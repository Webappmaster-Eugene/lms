import 'server-only'
import { randomUUID } from 'node:crypto'
import type { InterviewRecording } from '@/payload-types'
import type { Payload, Where } from 'payload'
import { relationId } from '@/lib/relation-id'
import { logger } from '@/lib/telemetry'
import { stackOnly } from '@/lib/error-reporting/capture'
import { interviewTransaction, storedAnalysisContext } from '@/server/interviews/service'
import { createInterviewAnalysis, getInterviewAnalysis, isInterviewAnalysisConfigured, InterviewAnalysisClientError } from '@/server/interviews/analysis-client'
import { createInterviewSource } from '@/server/interviews/capability'

const LEASE_MS = 5 * 60 * 1000
const POLL_DELAY_MS = 15000
export async function runInterviewAnalysisJobs(payload: Payload) {
  if (!isInterviewAnalysisConfigured()) return { skipped: true }
  const claimed = await interviewTransaction(payload, -1, async (req) => {
    const waiting = await payload.find({ collection: 'interview-recordings', where: { and: [{ analysisBackend: { equals: 'sovetnik' } }, { analysisStatus: { in: ['queued', 'processing'] } }, { category: { equals: 'personal' } }, { status: { equals: 'ready' } }, { or: [{ analysisLeaseUntil: { exists: false } }, { analysisLeaseUntil: { less_than_equal: new Date().toISOString() } }] }] }, sort: ['analysisLeaseUntil', 'analysisRequestedAt'], depth: 0, limit: 1, req, overrideAccess: true })
    const doc = waiting.docs[0]
    if (!doc) return null
    const claim = randomUUID()
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'processing', analysisClaim: claim, analysisLeaseUntil: new Date(Date.now() + LEASE_MS).toISOString() }, req, overrideAccess: true })
    return { doc, claim }
  })
  if (!claimed) return { skipped: true }
  const { doc, claim } = claimed
  const signal = AbortSignal.timeout(90000)
  const where: Where = { and: [{ id: { equals: doc.id } }, { analysisClaim: { equals: claim } }, { analysisStatus: { equals: 'processing' } }] }
  const update = async (data: Partial<InterviewRecording>) => {
    const result = await payload.update({ collection: 'interview-recordings', where, data, overrideAccess: true, depth: 0 })
    if (result.docs.length !== 1) throw new Error('Interview analysis claim lost')
  }
  try {
    const ownerId = relationId(doc.owner)
    if (!ownerId || !doc.analysisRemoteKey) throw new Error('Missing interview identity')
    await payload.findByID({ collection: 'users', id: ownerId, depth: 0, overrideAccess: true })
    const context = storedAnalysisContext(doc.analysisInput)
    const requestedAt = Date.parse(doc.analysisRequestedAt ?? '')
    if (!Number.isFinite(requestedAt) || Date.now() - requestedAt > 24 * 60 * 60 * 1000) throw new InterviewAnalysisClientError('Сервис не завершил оценку за сутки', 504)
    // Both the idempotency key and the signed source are deterministic for this attempt.
    // A lost POST response can safely recover the existing job instead of paying twice.
    let state
    if (doc.analysisRemoteJobId) state = await getInterviewAnalysis(ownerId, doc.analysisRemoteJobId, signal)
    else {
      await update({ analysisSubmissionStartedAt: doc.analysisSubmissionStartedAt ?? new Date().toISOString(), analysisProgress: 'Передаём запись на оценку' })
      state = await createInterviewAnalysis(ownerId, doc.analysisRemoteKey, createInterviewSource(doc), context, signal)
      await update({ analysisRemoteJobId: state.id })
    }
    if (state.status === 'failed') throw new InterviewAnalysisClientError(state.error || 'Не удалось оценить запись. Проверьте звук и повторите анализ', 422)
    if (state.status === 'completed' && state.report) {
      await update({ analysisStatus: 'completed', analysisProgress: 'Оценка собеседования готова', analysisReport: { ...state.report, report: { ...state.report.report }, score: { ...state.report.score }, criteria: state.report.criteria.map((criterion) => ({ ...criterion })) }, analysisScore: { ...state.report.score }, analysisCriteria: state.report.criteria.map((criterion) => ({ ...criterion })), analysisTranscript: null, analysisModel: state.report.model, analysisClaim: null, analysisLeaseUntil: null })
      return { skipped: false, completed: 1 }
    }
    await update({ analysisProgress: state.progress || 'Оцениваем ответы на собеседовании', analysisClaim: null, analysisLeaseUntil: new Date(Date.now() + POLL_DELAY_MS).toISOString() })
    return { skipped: false, pending: 1 }
  } catch (error) {
    if (error instanceof InterviewAnalysisClientError && error.retryable) {
      await update({ analysisProgress: 'Ожидаем ответа сервиса оценки', analysisClaim: null, analysisLeaseUntil: new Date(Date.now() + 60000).toISOString() })
      return { skipped: false, pending: 1 }
    }
    logger.error('Interview evaluation integration failed', stackOnly(error), { recordingId: doc.id, errorClass: error instanceof Error ? error.name : 'Unknown' })
    await update({ analysisStatus: 'failed', analysisError: error instanceof InterviewAnalysisClientError ? error.message : 'Не удалось оценить собеседование. Попробуйте ещё раз', analysisClaim: null, analysisLeaseUntil: null })
    return { skipped: false, failed: 1 }
  }
}
