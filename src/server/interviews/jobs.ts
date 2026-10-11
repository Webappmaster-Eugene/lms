import 'server-only'
import { randomUUID } from 'node:crypto'
import type { InterviewRecording } from '@/payload-types'
import type { Payload, Where } from 'payload'
import { relationId } from '@/lib/relation-id'
import { logger } from '@/lib/telemetry'
import { interviewTransaction, analysisInput } from '@/server/interviews/service'
import { createCheckfrodImport, getCheckfrodJob, getCheckfrodReport, listCheckfrodJobs, isCheckfrodConfigured, CheckfrodClientError } from '@/server/interviews/checkfrod-client'
import { createCheckfrodSource, checkfrodSourceFilename } from '@/server/interviews/capability'

const LEASE_MS = 5 * 60 * 1000
const POLL_DELAY_MS = 15000
export async function runInterviewAnalysisJobs(payload: Payload) {
  if (!isCheckfrodConfigured()) return { skipped: true }
  const claimed = await interviewTransaction(payload, -1, async (req) => {
    const waiting = await payload.find({ collection: 'interview-recordings', where: { and: [{ analysisStatus: { in: ['queued', 'processing'] } }, { category: { equals: 'personal' } }, { status: { equals: 'ready' } }, { or: [{ analysisLeaseUntil: { exists: false } }, { analysisLeaseUntil: { less_than_equal: new Date().toISOString() } }] }] }, sort: ['analysisLeaseUntil', 'analysisRequestedAt'], depth: 0, limit: 1, req, overrideAccess: true })
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
    if (!ownerId) throw new Error('Missing interview owner')
    await payload.findByID({ collection: 'users', id: ownerId, depth: 0, overrideAccess: true })
    const input = analysisInput(doc.analysisInput)
    if (Date.now() - Date.parse(doc.analysisRequestedAt ?? '') > 24 * 60 * 60 * 1000) throw new CheckfrodClientError('Checkfrod не завершил разбор за сутки', 504)
    let remoteId = doc.analysisRemoteJobId
    if (!remoteId) {
      if (doc.analysisSubmissionStartedAt) {
        const jobs = await listCheckfrodJobs(ownerId, signal)
        const match = jobs.find((job) => job.filename === checkfrodSourceFilename(doc))
        if (match) remoteId = match.id
        else if (Date.now() - Date.parse(doc.analysisSubmissionStartedAt) < 10 * 60 * 1000) {
          await update({ analysisProgress: 'Уточняем принятие записи в Checkfrod', analysisLeaseUntil: new Date(Date.now() + POLL_DELAY_MS).toISOString(), analysisClaim: null })
          return { skipped: false, pending: 1 }
        } else throw new CheckfrodClientError('Не удалось подтвердить приём записи в Checkfrod. Попробуйте ещё раз', 502)
      } else {
        const source = createCheckfrodSource(doc)
        await update({ analysisSubmissionStartedAt: new Date().toISOString(), analysisProgress: 'Передаём запись в Checkfrod' })
        remoteId = await createCheckfrodImport(ownerId, source, input.roiSpec, signal)
      }
      await update({ analysisRemoteJobId: remoteId })
    }
    const state = await getCheckfrodJob(ownerId, remoteId, signal)
    if (state.status === 'failed') throw new CheckfrodClientError('Checkfrod не смог разобрать запись. Проверьте видео и попробуйте ещё раз', 422)
    if (state.status === 'done') {
      const report = await getCheckfrodReport(ownerId, remoteId, signal)
      await update({ analysisStatus: 'completed', analysisProgress: 'Отчёт Checkfrod готов', analysisReport: report, analysisScore: null, analysisCriteria: null, analysisTranscript: null, analysisModel: null, analysisClaim: null, analysisLeaseUntil: null })
      return { skipped: false, completed: 1 }
    }
    const phase = state.status === 'queued' ? 'Запись в очереди Checkfrod' : 'Checkfrod анализирует видео'
    await update({ analysisProgress: `${phase}: ${Math.round(state.progress * 100)}%`, analysisClaim: null, analysisLeaseUntil: new Date(Date.now() + POLL_DELAY_MS).toISOString() })
    return { skipped: false, pending: 1 }
  } catch (error) {
    const retry = error instanceof CheckfrodClientError && (error.retryable || error.submissionUncertain)
    if (retry) {
      await update({ analysisProgress: 'Ожидаем ответа Checkfrod', analysisClaim: null, analysisLeaseUntil: new Date(Date.now() + 60000).toISOString() })
      return { skipped: false, pending: 1 }
    }
    logger.error('Checkfrod integration failed', { recordingId: doc.id, errorClass: error instanceof Error ? error.name : 'Unknown' })
    await update({ analysisStatus: 'failed', analysisError: error instanceof CheckfrodClientError ? error.message : 'Не удалось подключиться к Checkfrod. Попробуйте ещё раз', analysisClaim: null, analysisLeaseUntil: null })
    return { skipped: false, failed: 1 }
  }
}
