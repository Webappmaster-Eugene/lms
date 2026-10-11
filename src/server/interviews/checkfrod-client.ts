import 'server-only'

import type { CheckfrodJobState, CheckfrodReportLink, CheckfrodSummary } from '@/lib/interviews/checkfrod-types'

const DEFAULT_ORIGIN = 'https://checkfrod.nadtocheev.ru'
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const TIMEOUT_MS = 20000
const MAX_USER_ID = 2147483647
const USER_NAMESPACE = 9000000000000000n
const JOB_STATUSES = ['uploading', 'queued', 'running', 'done', 'failed'] as const

export class CheckfrodClientError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
    readonly retryable = false,
    readonly submissionUncertain = false,
  ) {
    super(message)
    this.name = 'CheckfrodClientError'
  }
}

/** Reserved above Telegram's documented 52-bit ID range; never derive from a Telegram profile. */
export function checkfrodIdentity(userId: number): string {
  if (!Number.isInteger(userId) || userId < 1 || userId > MAX_USER_ID) {
    throw new CheckfrodClientError('Некорректный владелец записи', 400)
  }
  return String(USER_NAMESPACE + BigInt(userId))
}

function apiOrigin(): string {
  const raw = process.env.CHECKFROD_API_URL?.trim() || DEFAULT_ORIGIN
  let url: URL
  try { url = new URL(raw) } catch { throw new CheckfrodClientError('Сервис проверки записи не настроен', 503) }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || (raw !== url.origin && raw !== `${url.origin}/`)) {
    throw new CheckfrodClientError('Сервис проверки записи не настроен', 503)
  }
  return url.origin
}

export function isCheckfrodConfigured(): boolean {
  if (!process.env.CHECKFROD_API_KEY?.trim()) return false
  try { apiOrigin(); return true } catch { return false }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CheckfrodClientError('Сервис проверки вернул некорректный ответ')
  return value as Record<string, unknown>
}

function jobId(id: unknown): string {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new CheckfrodClientError('Сервис проверки не вернул корректный номер анализа')
  return id
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function plainStatus(value: unknown, limit = 80): string {
  return typeof value === 'string' && value.length <= limit && /^[\p{L}\p{N}_ -]*$/u.test(value) ? value : ''
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get('content-length')
  if (length && /^\d+$/.test(length) && Number(length) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new CheckfrodClientError('Отчёт сервиса проверки превышает допустимый размер')
  }
  if (!response.body) throw new CheckfrodClientError('Сервис проверки вернул пустой ответ')
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
      if (received > MAX_RESPONSE_BYTES) throw new CheckfrodClientError('Отчёт сервиса проверки превышает допустимый размер')
      pieces.push(decoder.decode(chunk.value, { stream: true }))
    }
    pieces.push(decoder.decode())
    try { return JSON.parse(pieces.join('')) }
    catch { throw new CheckfrodClientError('Сервис проверки вернул некорректный ответ') }
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (!completed) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

type RequestOptions = { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; signal?: AbortSignal; creatingJob?: boolean }

async function request(userId: number, path: string, options: RequestOptions = {}): Promise<unknown> {
  options.signal?.throwIfAborted()
  const identity = checkfrodIdentity(userId)
  const origin = apiOrigin()
  const key = process.env.CHECKFROD_API_KEY?.trim()
  if (!key) throw new CheckfrodClientError('Сервис проверки записи не настроен', 503)
  const method = options.method ?? 'GET'
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  let responseSucceeded = false
  try {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`, 'X-ICheck-User': identity,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store', redirect: 'error', signal,
    })
    if (!response.ok) {
      await response.body?.cancel()
      const retryable = [408, 425, 429].includes(response.status) || response.status >= 500
      const message = response.status === 404 ? 'Анализ записи не найден'
        : response.status === 409 ? 'Операция сейчас недоступна для этого анализа'
          : response.status === 401 || response.status === 403 ? 'Доступ к сервису проверки записи не настроен'
            : response.status === 429 ? 'Сервис проверки занят. Попробуйте позже'
              : 'Сервис проверки временно недоступен'
      throw new CheckfrodClientError(message, response.status === 401 || response.status === 403 ? 503 : response.status >= 400 && response.status <= 599 ? response.status : 502, !options.creatingJob && retryable, Boolean(options.creatingJob && response.status >= 500))
    }
    if (method === 'DELETE' && response.status === 204) { await response.body?.cancel(); return null }
    responseSucceeded = true
    return await readJson(response, signal)
  } catch (error) {
    options.signal?.throwIfAborted()
    if (error instanceof CheckfrodClientError) {
      if (options.creatingJob && responseSucceeded) throw new CheckfrodClientError(error.message, error.statusCode, false, true)
      throw error
    }
    throw new CheckfrodClientError(timeout.aborted ? 'Сервис проверки не ответил вовремя. Попробуйте позже' : 'Не удалось подключиться к сервису проверки записи', timeout.aborted ? 504 : 502, !options.creatingJob, Boolean(options.creatingJob))
  }
}

function recordingCallbackHref(raw: string): string {
  let source: URL
  let canonical: URL
  try {
    source = new URL(raw)
    canonical = new URL(process.env.NEXT_PUBLIC_SERVER_URL ?? '')
  } catch { throw new CheckfrodClientError('Не удалось подготовить запись для проверки', 503) }
  const match = /^\/api\/internal\/interviews\/([1-9]\d*)\/lms-([1-9]\d*)-([1-9]\d*)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/.exec(source.pathname)
  const keys = Array.from(source.searchParams.keys())
  const token = source.searchParams.get('token') ?? ''
  const expires = source.searchParams.get('expires') ?? ''
  const localTest = process.env.NODE_ENV === 'test' && canonical.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(canonical.hostname)
  if ((!localTest && canonical.protocol !== 'https:') || canonical.username || canonical.password || canonical.search || canonical.hash || canonical.pathname !== '/' || source.origin !== canonical.origin || source.protocol !== canonical.protocol || source.username || source.password || source.hash || !match || match[1] !== match[2] || Number(match[1]) > MAX_USER_ID || Number(match[3]) > 3 || keys.length !== 2 || !keys.includes('token') || !keys.includes('expires') || !/^[a-f0-9]{64}$/.test(token) || !/^\d{10}$/.test(expires)) {
    throw new CheckfrodClientError('Некорректный защищённый источник записи', 400)
  }
  const expiryMs = Number(expires) * 1000
  if (expiryMs <= Date.now() || expiryMs > Date.now() + 24 * 60 * 60 * 1000 + 60000) throw new CheckfrodClientError('Ссылка на запись устарела. Запустите проверку снова', 400)
  return source.href
}

export async function createCheckfrodImport(userId: number, href: string, roiSpec: string, signal?: AbortSignal): Promise<string> {
  const source = recordingCallbackHref(href)
  if (typeof roiSpec !== 'string' || !roiSpec.trim() || roiSpec.length > 200) throw new CheckfrodClientError('Некорректная область лица кандидата', 400)
  const data = await request(userId, '/api/imports', {
    method: 'POST', body: { url: source, consent: true, roi_spec: roiSpec }, signal, creatingJob: true,
  })
  try { return jobId(object(data).id) }
  catch { throw new CheckfrodClientError('Сервис не подтвердил номер анализа. Проверяем состояние отправленной записи', 502, false, true) }
}

export async function getCheckfrodJob(userId: number, id: string, signal?: AbortSignal): Promise<CheckfrodJobState> {
  const remoteId = jobId(id)
  const row = object(await request(userId, `/api/jobs/${remoteId}`, { signal }))
  const status = row.status
  if (!JOB_STATUSES.some((value) => value === status)) throw new CheckfrodClientError('Сервис проверки вернул неизвестное состояние анализа')
  if (row.id !== undefined && row.id !== remoteId) throw new CheckfrodClientError('Сервис проверки вернул другой анализ')
  return {
    id: remoteId, status: status as CheckfrodJobState['status'], phase: plainStatus(row.phase, 120),
    progress: Math.min(1, safeNumber(row.progress)),
    episodes: typeof row.episodes === 'number' && Number.isSafeInteger(row.episodes) && row.episodes >= 0 ? row.episodes : null,
    duration: typeof row.duration === 'number' && Number.isFinite(row.duration) && row.duration >= 0 ? row.duration : null,
    gaze: typeof row.gaze === 'string' ? plainStatus(row.gaze) : null,
    error: status === 'failed' ? 'Сервис не смог проверить запись. Попробуйте повторить анализ' : null,
  }
}

export async function getCheckfrodReport(userId: number, id: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return object(await request(userId, `/reports/${jobId(id)}/report.json`, { signal }))
}

export async function getCheckfrodReportLink(userId: number, id: string, signal?: AbortSignal): Promise<CheckfrodReportLink> {
  const row = object(await request(userId, `/api/jobs/${jobId(id)}/link`, { method: 'POST', signal }))
  let url: URL
  try { url = new URL(typeof row.url === 'string' ? row.url : '') }
  catch { throw new CheckfrodClientError('Сервис проверки не вернул ссылку на отчёт') }
  if (url.origin !== apiOrigin() || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/^\/r\/[A-Za-z0-9._~-]{1,2048}$/.test(url.pathname)) {
    throw new CheckfrodClientError('Сервис проверки вернул некорректную ссылку на отчёт')
  }
  if (typeof row.expires_in_s !== 'number' || !Number.isInteger(row.expires_in_s) || row.expires_in_s <= 0 || row.expires_in_s > 7 * 24 * 60 * 60) {
    throw new CheckfrodClientError('Сервис проверки не указал корректный срок доступа к отчёту')
  }
  return { url: url.href, expiresInS: row.expires_in_s }
}

/** Same counters as Sovetnik: informational episodes do not count as signals. */
export function summarizeCheckfrodReport(value: unknown): CheckfrodSummary {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const attention = row.attention && typeof row.attention === 'object' && !Array.isArray(row.attention) ? row.attention as Record<string, unknown> : {}
  const quality = row.quality && typeof row.quality === 'object' && !Array.isArray(row.quality) ? row.quality as Record<string, unknown> : {}
  const episodes = Array.isArray(row.episodes) ? row.episodes : []
  return {
    durationS: safeNumber(row.duration_s),
    episodes: episodes.filter((episode: unknown) => !episode || typeof episode !== 'object' || (episode as Record<string, unknown>).confidence !== 'info').length,
    moments: Array.isArray(attention.moments) ? attention.moments.length : 0,
    gaze: plainStatus(quality.gaze),
    irisMinutes: safeNumber(attention.iris_s) / 60,
    headOnlyMinutes: safeNumber(attention.head_only_s) / 60,
    noFaceMinutes: safeNumber(attention.no_face_s) / 60,
    frozenMinutes: safeNumber(attention.frozen_s) / 60,
  }
}

export async function deleteCheckfrodJob(userId: number, id: string, signal?: AbortSignal): Promise<void> {
  try { await request(userId, `/api/jobs/${jobId(id)}`, { method: 'DELETE', signal }) }
  catch (error) {
    if (error instanceof CheckfrodClientError && error.statusCode === 404) return
    throw error
  }
}

export type CheckfrodJobListItem = { id: string; filename: string; status: CheckfrodJobState['status'] }

export async function listCheckfrodJobs(userId: number, signal?: AbortSignal): Promise<CheckfrodJobListItem[]> {
  const row = object(await request(userId, '/api/jobs', { signal }))
  if (!Array.isArray(row.jobs) || row.jobs.length > 10000) throw new CheckfrodClientError('Сервис проверки вернул некорректный список анализов')
  return row.jobs.map((raw: unknown) => {
    const job = object(raw)
    if (typeof job.filename !== 'string' || !job.filename || job.filename.length > 255 || !JOB_STATUSES.some((status) => status === job.status)) throw new CheckfrodClientError('Сервис проверки вернул некорректный список анализов')
    return { id: jobId(job.id), filename: job.filename, status: job.status as CheckfrodJobState['status'] }
  })
}
