import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkfrodIdentity, createCheckfrodImport, deleteCheckfrodJob, getCheckfrodJob,
  getCheckfrodReport, getCheckfrodReportLink, isCheckfrodConfigured, listCheckfrodJobs,
  summarizeCheckfrodReport,
} from '@/server/interviews/checkfrod-client'

const fetchMock = vi.fn()
const ORIGIN = 'https://checkfrod.nadtocheev.ru'
const LMS = 'https://learn.mentorcareer.ru'
const NOW = Date.parse('2026-10-11T10:00:00Z')
const UUID = '7a3dc8a9-5b54-415b-a719-a4610b1408f2'
const TOKEN = 'a'.repeat(64)
const callback = () => `${LMS}/api/internal/interviews/45/lms-45-1-${UUID}.mp4?expires=${Math.floor((NOW + 86400000) / 1000)}&token=${TOKEN}`
const job = (patch: Record<string, unknown> = {}) => ({ id: 'job45', status: 'running', phase: 'gaze', progress: 0.5, episodes: 3, duration: 60, gaze: 'head_only', ...patch })
const json = (value: unknown, status = 200) => Response.json(value, { status })

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => json(job()))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('CHECKFROD_API_KEY', 'unit-api-secret')
  vi.stubEnv('CHECKFROD_API_URL', '')
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', LMS)
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Checkfrod identity isolation', () => {
  it('reserves distinct16digit identities outside Telegram52bit range', () => {
    expect(checkfrodIdentity(1)).toBe('9000000000000001')
    expect(checkfrodIdentity(2147483647)).toBe('9000002147483647')
    expect(BigInt(checkfrodIdentity(1))).toBeGreaterThan((1n << 52n) - 1n)
    expect(checkfrodIdentity(45)).not.toBe(checkfrodIdentity(46))
  })
  it.each([0, -1, 1.5, NaN, Infinity, 2147483648])('rejects invalid LMS user ID%s', (id) => {
    expect(() => checkfrodIdentity(id)).toThrow('Некорректный владелец')
  })
  it('reads configuration at request time and fails closed without credentials', async () => {
    vi.stubEnv('CHECKFROD_API_KEY', '')
    expect(isCheckfrodConfigured()).toBe(false)
    await expect(getCheckfrodJob(45, 'job45')).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([
    'http://checkfrod.nadtocheev.ru', 'https://user:password@checkfrod.nadtocheev.ru',
    'https://checkfrod.nadtocheev.ru/path', 'https://checkfrod.nadtocheev.ru?token=secret',
    'https://checkfrod.nadtocheev.ru/#secret', 'invalid-origin',
  ])('rejects an invalid API origin%s without transmitting a credential', async (url) => {
    vi.stubEnv('CHECKFROD_API_URL', url)
    expect(isCheckfrodConfigured()).toBe(false)
    await expect(getCheckfrodJob(45, 'job45')).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('sends the namespace identity on every operation and refuses redirect forwarding', async () => {
    await getCheckfrodJob(45, 'job45')
    expect(fetchMock.mock.calls[0][0]).toBe(`${ORIGIN}/api/jobs/job45`)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer unit-api-secret', 'X-ICheck-User': '9000000000000045' }, redirect: 'error', cache: 'no-store' })
  })
})

describe('recording import is explicit and never duplicated by retries', () => {
  it('imports only a signed resource-scoped LMS callback with explicit consent', async () => {
    expect(await createCheckfrodImport(45, callback(), 'auto')).toBe('job45')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${ORIGIN}/api/imports`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ url: callback(), consent: true, roi_spec: 'auto' })
    expect(init.headers['Idempotency-Key']).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['arbitrary remote URL', 'https://evil.example/video.mp4'],
    ['direct Yandex capability', 'https://downloader.disk.yandex.ru/disk/capability'],
    ['cross-origin callback', callback().replace(LMS, 'https://evil.example')],
    ['HTTP source', callback().replace('https:', 'http:')],
    ['different resource in filename', callback().replace('/lms-45-', '/lms-46-')],
    ['directory traversal', callback().replace('/45/', '/../')],
    ['unexpected path', callback().replace('/api/internal/', '/api/public/')],
    ['unknown extension', callback().replace('.mp4', '.html')],
    ['duplicate token', `${callback()}&token=${TOKEN}`],
    ['extra query parameter', `${callback()}&redirect=evil`],
    ['invalid token', callback().replace(TOKEN, 'not-a-signature')],
    ['expired source', callback().replace(String(Math.floor((NOW + 86400000) / 1000)), String(Math.floor((NOW - 1000) / 1000)))],
    ['oversized validity', callback().replace(String(Math.floor((NOW + 86400000) / 1000)), String(Math.floor((NOW + 172800000) / 1000)))],
    ['invalid attempt', callback().replace('/lms-45-1-', '/lms-45-4-')],
    ['fragment', `${callback()}#secret`],
  ])('rejects%s before calling the external service', async (_description, url) => {
    await expect(createCheckfrodImport(45, url, 'auto')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('permits a localhost callback only in the test environment', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'http://localhost:3159')
    vi.stubEnv('NODE_ENV', 'test')
    await createCheckfrodImport(45, callback().replace(LMS, 'http://localhost:3159'), 'auto')
    vi.stubEnv('NODE_ENV', 'production')
    await expect(createCheckfrodImport(45, callback().replace(LMS, 'http://localhost:3159'), 'auto')).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('marks a lost POST response as uncertain and never retries it automatically', async () => {
    fetchMock.mockRejectedValue(new Error(`network error with private ${callback()} and unit-api-secret`))
    const result = createCheckfrodImport(45, callback(), 'auto')
    await expect(result).rejects.toMatchObject({ retryable: false, submissionUncertain: true, statusCode: 502 })
    await expect(result).rejects.not.toThrow(TOKEN)
    await expect(result).rejects.not.toThrow('unit-api-secret')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('marks an unusable successful POST response as uncertain instead of creating another job', async () => {
    fetchMock.mockResolvedValue(json({ status: 'queued' }))
    await expect(createCheckfrodImport(45, callback(), 'auto')).rejects.toMatchObject({ retryable: false, submissionUncertain: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('does not expose remote error details or retry a rejected import', async () => {
    fetchMock.mockResolvedValue(json({ detail: `secret ${TOKEN} unit-api-secret` }, 500))
    const result = createCheckfrodImport(45, callback(), 'auto')
    await expect(result).rejects.toMatchObject({ retryable: false, submissionUncertain: true })
    await expect(result).rejects.not.toThrow(TOKEN)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('owner-scoped polling and report handling', () => {
  it.each(['../other', 'job?user=other', 'a'.repeat(65), ''])('rejects malformed remote job ID%s before fetching', async (id) => {
    await expect(getCheckfrodJob(45, id)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('normalizes progress0..1 and protects against raw diagnostics in failed jobs', async () => {
    fetchMock.mockResolvedValue(json(job({ status: 'failed', progress: 3, phase: callback(), error: `source ${callback()} key unit-api-secret` })))
    const result = await getCheckfrodJob(45, 'job45')
    expect(result.progress).toBe(1)
    expect(result.phase).toBe('')
    expect(result.error).not.toContain(TOKEN)
    expect(result.error).not.toContain('unit-api-secret')
  })
  it('does not confuse an unknown or mismatched job with a queued analysis', async () => {
    fetchMock.mockResolvedValueOnce(json(job({ status: 'unexpected' }))).mockResolvedValueOnce(json(job({ id: 'other-job' })))
    await expect(getCheckfrodJob(45, 'job45')).rejects.toThrow('неизвестное состояние')
    await expect(getCheckfrodJob(45, 'job45')).rejects.toThrow('другой анализ')
  })
  it('fetches a report using the same owner identity', async () => {
    fetchMock.mockResolvedValue(json({ duration_s: 60, episodes: [] }))
    expect(await getCheckfrodReport(45, 'job45')).toEqual({ duration_s: 60, episodes: [] })
    expect(fetchMock.mock.calls[0][0]).toBe(`${ORIGIN}/reports/job45/report.json`)
    expect(fetchMock.mock.calls[0][1].headers['X-ICheck-User']).toBe('9000000000000045')
  })
  it('recovers by listing only the namespace actor’s jobs and exact filename', async () => {
    const filename = `lms-45-1-${UUID}.mp4`
    fetchMock.mockResolvedValue(json({ jobs: [job({ filename })] }))
    expect(await listCheckfrodJobs(45)).toEqual([{ id: 'job45', filename, status: 'running' }])
    expect(fetchMock.mock.calls[0][0]).toBe(`${ORIGIN}/api/jobs`)
    expect(fetchMock.mock.calls[0][1].headers['X-ICheck-User']).toBe('9000000000000045')
  })
  it('rejects a malformed list rather than silently hiding an uncertain submitted job', async () => {
    fetchMock.mockResolvedValue(json({ jobs: [job({ filename: null })] }))
    await expect(listCheckfrodJobs(45)).rejects.toThrow('некорректный список')
  })
  it('classifies GET429 as transient but does not retry it inside the client', async () => {
    fetchMock.mockResolvedValue(json({ detail: 'private details' }, 429))
    await expect(getCheckfrodJob(45, 'job45')).rejects.toMatchObject({ retryable: true, statusCode: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('makes deletion idempotent on404 without pretending a busy job was deleted', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'missing' }, 404)).mockResolvedValueOnce(json({ detail: 'busy' }, 409))
    await expect(deleteCheckfrodJob(45, 'job45')).resolves.toBeUndefined()
    await expect(deleteCheckfrodJob(45, 'job45')).rejects.toMatchObject({ statusCode: 409 })
    expect(fetchMock.mock.calls.every((call) => call[1].method === 'DELETE')).toBe(true)
  })
  it('accepts confirmed204 deletion without trying to parse nonexistent JSON', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(deleteCheckfrodJob(45, 'job45')).resolves.toBeUndefined()
  })
})

describe('signed report link validation', () => {
  it('accepts a bounded same-origin signed link and expiry', async () => {
    fetchMock.mockResolvedValue(json({ url: `${ORIGIN}/r/r1.encoded.signature`, expires_in_s: 259200 }))
    expect(await getCheckfrodReportLink(45, 'job45')).toEqual({ url: `${ORIGIN}/r/r1.encoded.signature`, expiresInS: 259200 })
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
  })
  it.each([
    'https://evil.example/r/r1.token', `${ORIGIN}/api/jobs/job45`,
    `${ORIGIN}/r/r1.token?api_key=private`, `${ORIGIN}/r/r1.token#private`,
    'https://user:password@checkfrod.nadtocheev.ru/r/r1.token',
    'http://checkfrod.nadtocheev.ru/r/r1.token', `${ORIGIN}/r/../reports/job45`,
  ])('rejects unsafe report URL%s', async (url) => {
    fetchMock.mockResolvedValue(json({ url, expires_in_s: 259200 }))
    await expect(getCheckfrodReportLink(45, 'job45')).rejects.toThrow('некорректную ссылку')
  })
  it.each([0, -1, 604801, 1.5, '259200', null])('rejects invalid link expiry%s', async (expires) => {
    fetchMock.mockResolvedValue(json({ url: `${ORIGIN}/r/r1.token`, expires_in_s: expires }))
    await expect(getCheckfrodReportLink(45, 'job45')).rejects.toThrow('срок доступа')
  })
})

describe('bounded JSON and cancellation', () => {
  it('rejects reports above4MiB from Content-Length before reading the body', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { headers: { 'Content-Length': String(4 * 1024 * 1024 + 1) } }))
    await expect(getCheckfrodReport(45, 'job45')).rejects.toThrow('превышает допустимый размер')
  })
  it('counts actual streamed bytes without trusting missing Content-Length', async () => {
    const cancel = vi.fn()
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)) }, cancel })))
    await expect(getCheckfrodReport(45, 'job45')).rejects.toThrow('превышает допустимый размер')
    expect(cancel).toHaveBeenCalled()
  })
  it('does not expose malformed response content', async () => {
    fetchMock.mockResolvedValue(new Response(`invalid-json-with-private-${TOKEN}`))
    const result = getCheckfrodReport(45, 'job45')
    await expect(result).rejects.toThrow('некорректный ответ')
    await expect(result).rejects.not.toThrow(TOKEN)
  })
  it('honours a pre-aborted signal without contacting the service', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(getCheckfrodJob(45, 'job45', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('enforces the deadline through a stalled response body, not only response headers', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), delay)
      return controller.signal
    })
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ start() {} })))
    const result = getCheckfrodReport(45, 'job45')
    const failure = expect(result).rejects.toMatchObject({ statusCode: 504, retryable: true })
    await vi.advanceTimersByTimeAsync(20000)
    await failure
  })
})

describe('summary follows the bot report semantics', () => {
  it('counts signals excluding info and preserves attention coverage and frozen minutes', () => {
    expect(summarizeCheckfrodReport({
      duration_s: 360, quality: { gaze: 'head_only' },
      episodes: [{ confidence: 'info' }, { confidence: 'high' }, { confidence: 'low' }],
      attention: { moments: [{}, {}], iris_s: 120, head_only_s: 60, no_face_s: 30, frozen_s: 90 },
    })).toEqual({ durationS: 360, episodes: 2, moments: 2, gaze: 'head_only', irisMinutes: 2, headOnlyMinutes: 1, noFaceMinutes: 0.5, frozenMinutes: 1.5 })
  })
  it('degrades old/malformed reports to finite nonnegative values without inventing conclusions', () => {
    expect(summarizeCheckfrodReport({ duration_s: -5, episodes: 'invalid', quality: { gaze: 'https://private.example/token' }, attention: { iris_s: NaN, head_only_s: Infinity, no_face_s: -60, frozen_s: '120', moments: null } })).toEqual({ durationS: 0, episodes: 0, moments: 0, gaze: '', irisMinutes: 0, headOnlyMinutes: 0, noFaceMinutes: 0, frozenMinutes: 0 })
    expect(summarizeCheckfrodReport(null).episodes).toBe(0)
  })
  it('preserves the bot’s counting behavior for old untyped episodes', () => {
    expect(summarizeCheckfrodReport({ episodes: [null, 'legacy-signal', { confidence: 'info' }] }).episodes).toBe(2)
  })
})
