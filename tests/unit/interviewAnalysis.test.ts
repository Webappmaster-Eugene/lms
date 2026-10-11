import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInterviewAnalysis, deleteInterviewAnalysis, getInterviewAnalysis, isInterviewAnalysisConfigured } from '@/server/interviews/analysis-client'
import { analysisContextInputSchema } from '@/server/interviews/analysis-schema'
import { interviewContext, interviewResult } from '../fixtures/interview-analysis'

const fetchMock = vi.fn()
const ORIGIN = 'https://bot.example.test'
const LMS = 'https://learn.mentorcareer.ru'
const NOW = Date.parse('2026-10-11T10:00:00Z')
const UUID = '7a3dc8a9-5b54-415b-a719-a4610b1408f2'
const TOKEN = 'a'.repeat(64)
const callback = () => `${LMS}/api/internal/interviews/45/lms-45-1-${UUID}.mp4?expires=${Math.floor((NOW + 86400000) / 1000)}&token=${TOKEN}`
const job = (patch: Record<string, unknown> = {}) => ({ id: UUID, status: 'queued', progress: 'Ожидает анализа', ...patch })
const json = (value: unknown, status = 200) => Response.json(value, { status })

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => json(job()))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('INTERVIEW_ANALYSIS_API_TOKEN', 'unit-api-secret')
  vi.stubEnv('INTERVIEW_ANALYSIS_API_URL', ORIGIN)
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', LMS)
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('semantic service authentication and identity isolation', () => {
  it('fails closed without a token', async () => {
    vi.stubEnv('INTERVIEW_ANALYSIS_API_TOKEN', '')
    expect(isInterviewAnalysisConfigured()).toBe(false)
    await expect(getInterviewAnalysis(45, UUID)).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each(['http://bot.example.test', 'https://user:password@bot.example.test', 'https://bot.example.test/path', 'https://bot.example.test?token=secret', 'https://bot.example.test/#secret', 'invalid'])('rejects unsafe API origin %s before transmitting credentials', async (url) => {
    vi.stubEnv('INTERVIEW_ANALYSIS_API_URL', url)
    expect(isInterviewAnalysisConfigured()).toBe(false)
    await expect(getInterviewAnalysis(45, UUID)).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([0, -1, 1.5, NaN, Infinity, 2147483648])('rejects owner %s', async (owner) => {
    await expect(getInterviewAnalysis(owner, UUID)).rejects.toMatchObject({ statusCode: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each(['../other', `${UUID}?ownerId=2`, 'a'.repeat(65), ''])('rejects malformed request ID %s', async (id) => {
    await expect(getInterviewAnalysis(45, id)).rejects.toMatchObject({ statusCode: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('sends owner scope, disables redirects and caches, and forwards no browser credentials', async () => {
    await getInterviewAnalysis(45, UUID)
    expect(fetchMock.mock.calls[0][0]).toBe(`${ORIGIN}/api/integrations/lms/interviews/${UUID}?ownerId=45`)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer unit-api-secret' }, redirect: 'error', cache: 'no-store' })
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('Cookie')
  })
})

describe('context, protected source and stable submission identity', () => {
  it('sends the target grade and vacancy to the existing evaluator, preserving the UUID on retry', async () => {
    await createInterviewAnalysis(45, UUID, callback(), interviewContext)
    await createInterviewAnalysis(45, UUID, callback(), interviewContext)
    const submitted = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body))
    expect(submitted[0]).toEqual({ ownerId: '45', requestId: UUID, sourceUrl: callback(), context: interviewContext })
    expect(submitted[1]).toEqual(submitted[0])
  })
  it.each([
    'https://evil.example/video.mp4', 'https://downloader.disk.yandex.ru/disk/capability',
    callback().replace(LMS, 'https://evil.example'), callback().replace('https:', 'http:'),
    callback().replace('/lms-45-', '/lms-46-'), callback().replace('/api/internal/', '/api/public/'),
    callback().replace('.mp4', '.html'), `${callback()}&token=${TOKEN}`, `${callback()}&redirect=evil`,
    callback().replace(TOKEN, 'not-a-signature'), `${callback()}#private`,
    callback().replace('/lms-45-1-', '/lms-45-4-'),
    callback().replace(UUID, '8a3dc8a9-5b54-415b-a719-a4610b1408f2'),
    callback().replace(String(Math.floor((NOW + 86400000) / 1000)), String(Math.floor((NOW - 1000) / 1000))),
    callback().replace(String(Math.floor((NOW + 86400000) / 1000)), String(Math.floor((NOW + 172800000) / 1000))),
  ])('rejects unsafe source %s before contacting the bot', async (url) => {
    await expect(createInterviewAnalysis(45, UUID, url, interviewContext)).rejects.toMatchObject({ statusCode: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([
    { consent: false, targetGrade: 'middle', interviewFormat: 'mixed' },
    { consent: true, targetGrade: 'expert', interviewFormat: 'mixed' },
    { consent: true, targetGrade: 'middle', interviewFormat: 'fraud' },
    { consent: true, targetGrade: 'middle', interviewFormat: 'mixed', vacancyText: 'x'.repeat(15001) },
    { consent: true, targetGrade: 'middle', interviewFormat: 'mixed', direction: 'forged direction' },
    { consent: true, targetGrade: 'middle', interviewFormat: 'mixed', candidateName: 'x'.repeat(121) },
  ])('rejects consent or forged/unbounded context %j', (input) => {
    expect(analysisContextInputSchema.safeParse(input).success).toBe(false)
  })
  it.each(['technical', 'live_coding', 'system_design', 'hr', 'mixed'])('supports interview style %s without fraud parameters', (interviewFormat) => {
    expect(analysisContextInputSchema.parse({ consent: true, targetGrade: 'middle', interviewFormat, vacancyText: '  React  ' })).toMatchObject({ vacancyText: 'React', interviewFormat })
  })
  it('returns a sanitized, retryable error after a lost POST response and never retries internally', async () => {
    fetchMock.mockRejectedValue(new Error(`private ${callback()} unit-api-secret`))
    const result = createInterviewAnalysis(45, UUID, callback(), interviewContext)
    await expect(result).rejects.toMatchObject({ statusCode: 502, retryable: true })
    await expect(result).rejects.not.toThrow(TOKEN)
    await expect(result).rejects.not.toThrow('unit-api-secret')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('validates stored runtime context before transmitting it to the service', async () => {
    await expect(createInterviewAnalysis(45, UUID, callback(), { ...interviewContext, vacancyText: 'x'.repeat(15001) })).rejects.toMatchObject({ statusCode: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('can safely retry malformed successful POST responses using the same stable UUID', async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 'queued' }))
    await expect(createInterviewAnalysis(45, UUID, callback(), interviewContext)).rejects.toMatchObject({ statusCode: 502, retryable: true })
    await createInterviewAnalysis(45, UUID, callback(), interviewContext)
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body)
  })
})

describe('actual persisted report contract', () => {
  it('retains grade, evidence, vacancy score, coverage and missing must criteria', async () => {
    fetchMock.mockResolvedValue(json(job({ status: 'completed', report: interviewResult })))
    expect((await getInterviewAnalysis(45, UUID)).report).toEqual(interviewResult)
  })
  it.each([
    job({ id: '8a3dc8a9-5b54-415b-a719-a4610b1408f2' }), job({ status: 'unexpected' }),
    job({ status: 'completed' }), job({ status: 'completed', report: { duration_s: 120, episodes: [] } }),
    job({ status: 'completed', report: { ...interviewResult, score: { ...interviewResult.score, coverage: 2 } } }),
    job({ status: 'completed', report: { ...interviewResult, report: { ...interviewResult.report, criteria: [] } } }),
    job({ status: 'completed', report: { ...interviewResult, criteria: [interviewResult.criteria[0], interviewResult.criteria[0]] } }),
    job({ status: 'completed', report: { ...interviewResult, score: { ...interviewResult.score, failedMust: ['foreign-criterion'] } } }),
    job({ status: 'completed', report: { ...interviewResult, report: { ...interviewResult.report, extraneous: [{ fromSec: 10, toSec: 5, note: 'bad interval' }] } } }),
  ])('rejects mismatched jobs, missing or inconsistent semantic reports', async (value) => {
    fetchMock.mockResolvedValue(json(value))
    await expect(getInterviewAnalysis(45, UUID)).rejects.toThrow('некорректный отчёт')
  })
  it.each([408, 425, 429, 500, 503])('marks HTTP %s as transient without exposing the provider body', async (status) => {
    fetchMock.mockResolvedValue(json({ error: `private ${TOKEN} unit-api-secret` }, status))
    const request = getInterviewAnalysis(45, UUID)
    await expect(request).rejects.toMatchObject({ statusCode: status, retryable: true })
    await expect(request).rejects.not.toThrow(TOKEN)
  })
  it.each([401, 403])('reports HTTP %s as a configuration failure', async (status) => {
    fetchMock.mockResolvedValue(json({ error: 'private' }, status))
    await expect(getInterviewAnalysis(45, UUID)).rejects.toMatchObject({ statusCode: 503, retryable: false })
  })
  it('does not expose provider progress or failure diagnostics to a learner', async () => {
    fetchMock.mockResolvedValue(json(job({ status: 'failed', progress: TOKEN, error: 'private unit-api-secret' })))
    const result = await getInterviewAnalysis(45, UUID)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
    expect(JSON.stringify(result)).not.toContain('unit-api-secret')
    expect(result.error).toContain('Проверьте звук')
  })
  it('makes deletion idempotent on404 and204 but retains a busy remote job', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json({}, 409))
    await expect(deleteInterviewAnalysis(45, UUID)).resolves.toBeUndefined()
    await expect(deleteInterviewAnalysis(45, UUID)).resolves.toBeUndefined()
    await expect(deleteInterviewAnalysis(45, UUID)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('bounded responses and cancellation', () => {
  it('rejects excessive declared Content-Length without reading body', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { headers: { 'Content-Length': String(4 * 1024 * 1024 + 1) } }))
    await expect(getInterviewAnalysis(45, UUID)).rejects.toThrow('превышает допустимый размер')
  })
  it('counts actual streamed bytes and cancels oversized content', async () => {
    const cancel = vi.fn()
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)) }, cancel })))
    await expect(getInterviewAnalysis(45, UUID)).rejects.toThrow('превышает допустимый размер')
    expect(cancel).toHaveBeenCalled()
  })
  it('does not expose invalid JSON contents', async () => {
    fetchMock.mockResolvedValue(new Response(`private-${TOKEN}`))
    const result = getInterviewAnalysis(45, UUID)
    await expect(result).rejects.toThrow('некорректный ответ')
    await expect(result).rejects.not.toThrow(TOKEN)
  })
  it('honours a pre-aborted signal without contacting the service', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(getInterviewAnalysis(45, UUID, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('enforces a deadline through a stalled response body', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), delay)
      return controller.signal
    })
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ start() {} })))
    const failure = expect(getInterviewAnalysis(45, UUID)).rejects.toMatchObject({ statusCode: 504, retryable: true })
    await vi.advanceTimersByTimeAsync(20000)
    await failure
  })
})
