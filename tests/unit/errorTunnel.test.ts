import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSentryDsn } from '@/lib/error-reporting/dsn'
import { BROWSER_PLACEHOLDER_DSN } from '@/lib/error-reporting/sentry-options'

const DSN = 'https://publicKey123@o42.ingest.de.sentry.io/4507'

const { POST } = await import('@/app/api/monitoring/route')
const { resetTunnelLimits, MAX_ENVELOPE_BYTES } = await import('@/server/error-tunnel')

function envelope(dsn = BROWSER_PLACEHOLDER_DSN): string {
  return [
    JSON.stringify({ event_id: 'a'.repeat(32), sent_at: '2026-10-20T10:00:00.000Z', dsn, sdk: { name: 'sentry.javascript.nextjs', version: '11.4.0' } }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify({ message: 'boom', level: 'error' }),
  ].join('\n')
}

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://learn.mentorcareer.ru/api/monitoring', {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=UTF-8', origin: 'https://learn.mentorcareer.ru', 'sec-fetch-site': 'same-origin', ...headers },
    body,
  })
}

const upstream = vi.fn<typeof fetch>()

beforeEach(() => {
  resetTunnelLimits()
  vi.stubEnv('SENTRY_DSN', DSN)
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru')
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  upstream.mockResolvedValue(new Response('{"id":"x"}', { status: 200 }))
  vi.stubGlobal('fetch', upstream)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  upstream.mockReset()
})

describe('DSN Sentry', () => {
  it('разбирает облачный и самостоятельный DSN', () => {
    expect(parseSentryDsn(DSN)).toEqual({ dsn: DSN, publicKey: 'publicKey123', projectId: '4507', envelopeUrl: 'https://o42.ingest.de.sentry.io/api/4507/envelope/' })
    expect(parseSentryDsn('https://k@sentry.example.ru/prefix/12')?.envelopeUrl).toBe('https://sentry.example.ru/prefix/api/12/envelope/')
  })

  it('неверный DSN выключает трекер, а не роняет приложение', () => {
    for (const value of ['', 'not a url', 'https://sentry.io/1', 'https://k:secret@sentry.io/1', 'https://k@sentry.io/project', 'ftp://k@sentry.io/1']) {
      expect(parseSentryDsn(value), value).toBeNull()
    }
  })
})

describe('туннель /api/monitoring', () => {
  it('пересылает конверт в Sentry с настоящим DSN вместо заглушки браузера', async () => {
    const response = await POST(request(envelope()))
    expect(response.status).toBe(200)
    expect(upstream).toHaveBeenCalledOnce()
    const [url, init] = upstream.mock.calls[0] ?? []
    expect(url).toBe('https://o42.ingest.de.sentry.io/api/4507/envelope/?sentry_key=publicKey123&sentry_version=7')
    const body = String(init?.body)
    expect(JSON.parse(body.split('\n')[0] ?? '{}').dsn).toBe(DSN)
    expect(body).not.toContain('sentry.invalid')
    expect(body.split('\n').slice(1).join('\n')).toBe(envelope().split('\n').slice(1).join('\n'))
  })

  it('без SENTRY_DSN молча принимает отчёт и никуда его не шлёт', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    expect((await POST(request(envelope()))).status).toBe(204)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('не принимает отчёты с чужих сайтов и без Origin, который браузер всегда шлёт с POST', async () => {
    expect((await POST(request(envelope(), { origin: 'https://evil.example' }))).status).toBe(403)
    expect((await POST(request(envelope(), { 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
    const noOrigin = request(envelope())
    noOrigin.headers.delete('origin')
    expect((await POST(noOrigin)).status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('пропускает только события и отчёты клиента: вложения и сессии через туннель не идут', async () => {
    const header = JSON.stringify({ dsn: BROWSER_PLACEHOLDER_DSN })
    expect((await POST(request([header, JSON.stringify({ type: 'attachment', length: 3 }), 'abc'].join('\n')))).status).toBe(400)
    expect((await POST(request([header, JSON.stringify({ type: 'session' }), '{}'].join('\n')))).status).toBe(400)
    expect((await POST(request([header, JSON.stringify({ type: 'client_report' }), '{"discarded_events":[]}'].join('\n')))).status).toBe(200)
    expect(upstream).toHaveBeenCalledOnce()
  })

  it('отчёты браузера идут на отдельный ключ, если он задан', async () => {
    vi.stubEnv('SENTRY_BROWSER_DSN', 'https://browserKey@o42.ingest.de.sentry.io/4507')
    await POST(request(envelope()))
    expect(String(upstream.mock.calls[0]?.[0])).toContain('sentry_key=browserKey')
  })

  it('за прокси без доверенного IP лимит считается по сессии: шумный ученик не отнимает его у других', async () => {
    for (let index = 0; index < 30; index += 1) await POST(request(envelope(), { cookie: 'payload-token=noisy' }))
    expect((await POST(request(envelope(), { cookie: 'payload-token=noisy' }))).status).toBe(429)
    expect((await POST(request(envelope(), { cookie: 'payload-token=quiet' }))).status).toBe(200)
  })

  it('отклоняет слишком большой и битый конверт', async () => {
    expect((await POST(request('x'.repeat(MAX_ENVELOPE_BYTES + 1)))).status).toBe(413)
    expect((await POST(request('not json\n{}'))).status).toBe(400)
    expect((await POST(request(JSON.stringify({ dsn: 'x' })))).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('ограничивает частоту: мусорные конверты не съедят квоту Sentry', async () => {
    const statuses: number[] = []
    for (let index = 0; index < 32; index += 1) statuses.push((await POST(request(envelope()))).status)
    expect(statuses.filter((code) => code === 200)).toHaveLength(30)
    expect(statuses.at(-1)).toBe(429)
  })

  it('передаёт браузеру лимиты Sentry, чтобы SDK сам притормозил', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 429, headers: { 'retry-after': '120', 'x-sentry-rate-limits': '120:error:organization' } }))
    const response = await POST(request(envelope()))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('120')
    expect(response.headers.get('x-sentry-rate-limits')).toBe('120:error:organization')
  })

  it('недоступный Sentry — 502, без исключения и без рекурсии в отчёты', async () => {
    upstream.mockRejectedValue(new TypeError('fetch failed'))
    expect((await POST(request(envelope()))).status).toBe(502)
  })
})
