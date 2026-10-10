import 'server-only'
import { logger } from '@/lib/telemetry'
import { InterviewError } from '@/lib/interviews/analysis/errors'
import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { relationId } from '@/lib/relation-id'
import { interviewTransaction, analysisInput } from '@/server/interviews/service'
import { analyzeRecording, isInterviewAnalysisConfigured } from '@/server/interviews/analyzer'
import { resolveRecordingHref } from '@/server/interviews/disk'
import type { InterviewCriterion } from '@/lib/interviews/analysis/types'

const LEASE_MS = 30 * 60 * 1000
export async function runInterviewAnalysisJobs(payload: Payload) {
  if (!isInterviewAnalysisConfigured()) return { skipped: true }
  const claimed = await interviewTransaction(payload, -1, async (req) => {
    const active = await payload.find({ collection: 'interview-recordings', where: { analysisStatus: { equals: 'processing' } }, req, overrideAccess: true, depth: 0, limit: 1, sort: 'id' })
    if (active.docs[0]) {
      const doc = active.docs[0]
      if (doc.analysisLeaseUntil && Date.parse(doc.analysisLeaseUntil) > Date.now()) return null
      // Do not automatically spend money again after a crash; the owner can retry explicitly.
      await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed', analysisError: 'Анализ прервался. Запустите его ещё раз', analysisClaim: null, analysisLeaseUntil: null }, req, overrideAccess: true })
    }
    const waiting = await payload.find({ collection: 'interview-recordings', where: { and: [{ analysisStatus: { equals: 'queued' } }, { category: { equals: 'personal' } }, { status: { equals: 'ready' } }] }, sort: 'analysisRequestedAt', depth: 0, limit: 1, req, overrideAccess: true })
    const doc = waiting.docs[0]
    if (!doc) return null
    const claim = randomUUID()
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'processing', analysisProgress: 'Подготовка записи', analysisClaim: claim, analysisLeaseUntil: new Date(Date.now() + LEASE_MS).toISOString() }, req, overrideAccess: true })
    return { doc, claim }
  })
  if (!claimed) return { skipped: true }
  const { doc, claim } = claimed
  const abort = new AbortController()
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(2 * 60 * 60 * 1000)])
  const update = async (data: { analysisProgress?: string; analysisLeaseUntil?: string; analysisStatus?: 'failed'; analysisError?: string }) => {
    const result = await payload.update({ collection: 'interview-recordings', where: { and: [{ id: { equals: doc.id } }, { analysisClaim: { equals: claim } }, { analysisStatus: { equals: 'processing' } }] }, data, overrideAccess: true, depth: 0 })
    if (result.docs.length !== 1) { abort.abort(); throw new Error('Interview analysis claim lost') }
  }
  const heartbeat = setInterval(() => { void update({ analysisLeaseUntil: new Date(Date.now() + LEASE_MS).toISOString() }).catch(() => { abort.abort() }) }, 60000)
  heartbeat.unref()
  try {
    const ownerId = relationId(doc.owner)
    if (!ownerId) throw new Error('Missing interview owner')
    await payload.findByID({ collection: 'users', id: ownerId, overrideAccess: true, depth: 0 })
    const track = await payload.findByID({ collection: 'interview-directions', id: relationId(doc.direction) ?? -1, overrideAccess: true, depth: 0 })
    const input = analysisInput(doc.analysisInput)
    const result = await analyzeRecording({ downloadHref: await resolveRecordingHref(doc), directionSlug: track.slug, signal, ...input, ...(Array.isArray(track.criteria) && track.criteria.length > 0 ? { criteria: track.criteria as unknown as InterviewCriterion[] } : {}), onProgress: async (progress) => { signal.throwIfAborted(); try { await update({ analysisProgress: progress.slice(0, 200), analysisLeaseUntil: new Date(Date.now() + LEASE_MS).toISOString() }) } catch (error) { abort.abort(); throw error } } })
    await payload.update({ collection: 'interview-recordings', where: { and: [{ id: { equals: doc.id } }, { analysisClaim: { equals: claim } }, { analysisStatus: { equals: 'processing' } }] }, data: { analysisStatus: 'completed', analysisProgress: 'Анализ готов', analysisReport: JSON.parse(JSON.stringify(result.report)), analysisScore: JSON.parse(JSON.stringify(result.score)), analysisCriteria: JSON.parse(JSON.stringify(result.criteria)), analysisTranscript: result.transcript, analysisModel: result.model, analysisClaim: null, analysisLeaseUntil: null }, overrideAccess: true, depth: 0 })
    return { skipped: false, completed: 1 }
  } catch (error) {
    logger.error('Interview analysis failed', { recordingId: doc.id, errorClass: error instanceof Error ? error.name.slice(0, 64) : 'Unknown' })
    const message = error instanceof InterviewError ? error.message.slice(0, 500) : 'Не удалось проанализировать запись. Проверьте звук и попробуйте ещё раз'
    await update({ analysisStatus: 'failed', analysisError: message, analysisProgress: 'Анализ не завершён' })
    return { skipped: false, failed: 1 }
  } finally { clearInterval(heartbeat) }
}
