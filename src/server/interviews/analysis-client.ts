import 'server-only'
import { z } from 'zod'
import type { InterviewAnalysisContext, InterviewAnalysisJob } from '@/lib/interviews/analysis-types'
import { analysisResultSchema, analysisContextSchema } from '@/server/interviews/analysis-schema'

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const TIMEOUT_MS = 20000
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
export class InterviewAnalysisClientError extends Error {
  constructor(message: string, readonly statusCode = 502, readonly retryable = false) {
    super(message)
    this.name = 'InterviewAnalysisClientError'
  }
}
function apiOrigin(): string {
  try {
    const url = new URL(process.env.INTERVIEW_ANALYSIS_API_URL?.trim() ?? '')
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid origin')
    return url.origin
  } catch { throw new InterviewAnalysisClientError('Сервис оценки собеседований не настроен', 503) }
}
export function isInterviewAnalysisConfigured(): boolean {
  if (!process.env.INTERVIEW_ANALYSIS_API_TOKEN?.trim()) return false
  try { apiOrigin(); return true } catch { return false }
}
function identifiers(ownerId: number, id: string) {
  if (!Number.isInteger(ownerId) || ownerId < 1 || ownerId > 2147483647 || !UUID.test(id)) throw new InterviewAnalysisClientError('Некорректный идентификатор оценки', 400)
  return { ownerId: String(ownerId), requestId: id }
}
async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('content-length')
  if (length && /^\d+$/.test(length) && Number(length) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new InterviewAnalysisClientError('Отчёт сервиса оценки превышает допустимый размер')
  }
  if (!response.body) throw new InterviewAnalysisClientError('Сервис оценки вернул пустой ответ')
  const reader = response.body.getReader()
  const onAbort = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener('abort', onAbort, { once: true })
  let completed = false
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const pieces: string[] = []
    let received = 0
    while (true) {
      signal.throwIfAborted()
      const chunk = await reader.read()
      signal.throwIfAborted()
      if (chunk.done) { completed = true; break }
      received += chunk.value.byteLength
      if (received > MAX_RESPONSE_BYTES) throw new InterviewAnalysisClientError('Отчёт сервиса оценки превышает допустимый размер')
      pieces.push(decoder.decode(chunk.value, { stream: true }))
    }
    pieces.push(decoder.decode())
    try { return JSON.parse(pieces.join('')) }
    catch { throw new InterviewAnalysisClientError('Сервис оценки вернул некорректный ответ') }
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (!completed) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}


async function request(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown, outerSignal?: AbortSignal): Promise<unknown> {
  outerSignal?.throwIfAborted()
  const origin = apiOrigin()
  const token = process.env.INTERVIEW_ANALYSIS_API_TOKEN?.trim()
  if (!token) throw new InterviewAnalysisClientError('Сервис оценки собеседований не настроен', 503)
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const signal = outerSignal ? AbortSignal.any([outerSignal, timeout]) : timeout
  try {
    const response = await fetch(`${origin}/api/integrations/lms/interviews${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', cache: 'no-store', signal,
    })
    if (!response.ok) {
      await response.body?.cancel()
      const retryable = [408, 425, 429].includes(response.status) || response.status >= 500
      const message = response.status === 404 ? 'Оценка собеседования не найдена' : response.status === 409 ? 'Операция недоступна, пока оценка выполняется' : response.status === 401 || response.status === 403 ? 'Доступ к сервису оценки не настроен' : 'Сервис оценки временно недоступен'
      throw new InterviewAnalysisClientError(message, [401, 403].includes(response.status) ? 503 : response.status, retryable)
    }
    if (method === 'DELETE' && response.status === 204) { await response.body?.cancel(); return null }
    return await readJson(response, signal)
  } catch (error) {
    outerSignal?.throwIfAborted()
    if (error instanceof InterviewAnalysisClientError) throw error
    throw new InterviewAnalysisClientError('Не удалось получить ответ сервиса оценки', timeout.aborted ? 504 : 502, true)
  }
}
const jobSchema = z.object({ id: z.string().regex(UUID), status: z.enum(['queued', 'processing', 'completed', 'failed']), progress: z.string().max(200), report: analysisResultSchema.optional(), error: z.string().max(500).optional() })
function parseJob(value: unknown, id: string): InterviewAnalysisJob {
  const parsed = jobSchema.safeParse(value)
  if (!parsed.success || parsed.data.id !== id || parsed.data.status === 'completed' && !parsed.data.report) throw new InterviewAnalysisClientError('Сервис оценки вернул некорректный отчёт')
  const progress = { queued: 'Запись в очереди оценки', processing: 'Анализируем ответы на собеседовании', completed: 'Оценка собеседования готова', failed: 'Оценка не выполнена' }[parsed.data.status]
  return { ...parsed.data, progress, ...(parsed.data.status === 'failed' ? { error: 'Сервис не смог оценить запись. Проверьте звук и повторите анализ' } : { error: undefined }) }
}
function sourceHref(raw: string, requestId: string): string {
  try {
    const source = new URL(raw)
    const canonical = new URL(process.env.NEXT_PUBLIC_SERVER_URL ?? '')
    const match = /^\/api\/internal\/interviews\/([1-9]\d*)\/lms-([1-9]\d*)-([1-3])-([a-f0-9-]+)\.mp4$/.exec(source.pathname)
    const expires = source.searchParams.get('expires') ?? ''
    if (source.protocol !== 'https:' || source.origin !== canonical.origin || source.username || source.password || source.hash || !match || match[1] !== match[2] || !UUID.test(match[4]) || match[4] !== requestId || source.searchParams.size !== 2 || !/^[a-f0-9]{64}$/.test(source.searchParams.get('token') ?? '') || !/^\d{10}$/.test(expires) || Number(expires) <= Date.now() / 1000 || Number(expires) > Date.now() / 1000 + 86460) throw new Error('Invalid source')
    return source.href
  } catch { throw new InterviewAnalysisClientError('Некорректный защищённый источник записи', 400) }
}
export async function createInterviewAnalysis(ownerId: number, id: string, sourceUrl: string, context: InterviewAnalysisContext, signal?: AbortSignal): Promise<InterviewAnalysisJob> {
  signal?.throwIfAborted()
  const identity = identifiers(ownerId, id)
  const parsedContext = analysisContextSchema.safeParse(context)
  if (!parsedContext.success) throw new InterviewAnalysisClientError('Некорректный контекст оценки', 400)
  try { return parseJob(await request('', 'POST', { ...identity, sourceUrl: sourceHref(sourceUrl, id), context: parsedContext.data }, signal), id) }
  catch (error) {
    if (error instanceof InterviewAnalysisClientError && error.statusCode === 502) throw new InterviewAnalysisClientError(error.message, 502, true)
    throw error
  }
}
export async function getInterviewAnalysis(ownerId: number, id: string, signal?: AbortSignal): Promise<InterviewAnalysisJob> {
  const identity = identifiers(ownerId, id)
  return parseJob(await request(`/${id}?ownerId=${identity.ownerId}`, 'GET', undefined, signal), id)
}
export async function deleteInterviewAnalysis(ownerId: number, id: string): Promise<void> {
  const identity = identifiers(ownerId, id)
  try { await request(`/${id}?ownerId=${identity.ownerId}`, 'DELETE') }
  catch (error) { if (!(error instanceof InterviewAnalysisClientError && error.statusCode === 404)) throw error }
}
