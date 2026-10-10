import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrainerRunnerError } from '@/server/trainer/pool'

const proxyRuntimeRequest = vi.fn()
vi.mock('@/server/trainer/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/trainer/runtime')>()
  return { ...actual, proxyRuntimeRequest }
})
vi.mock('@/lib/telemetry', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

const previewRoute = await import('@/app/api/trainer/preview/[token]/[[...path]]/route')
const adapter = await vi.importActual<typeof import('@/server/trainer/runtime')>('@/server/trainer/runtime')
const token = 'a'.repeat(48)
const serviceToken = 'runtime-token-'.repeat(4)

function request({ method = 'GET', leaseToken = token, path = [], query = '', headers = {}, body }: { method?: string; leaseToken?: string; path?: string[]; query?: string; headers?: Record<string, string>; body?: string } = {}) {
  const incoming = new Request(`https://lms.test/api/trainer/preview/${leaseToken}/${path.join('/')}${query}`, { method, headers, ...(body === undefined ? {} : { body }) })
  const handler = method === 'OPTIONS' ? previewRoute.OPTIONS : method === 'HEAD' ? previewRoute.HEAD : method === 'POST' ? previewRoute.POST : previewRoute.GET
  return handler(incoming, { params: Promise.resolve({ token: leaseToken, path }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  proxyRuntimeRequest.mockResolvedValue(new Response('<h1>Next</h1>', { headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'payload-token=evil', 'X-Frame-Options': 'DENY' } }))
  vi.stubEnv('TRAINER_RUNTIME_URL', 'http://runtime.internal:8080')
  vi.stubEnv('TRAINER_RUNTIME_TOKEN', serviceToken)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Next.js capability-предпросмотр', () => {
  it('отдаёт проект без учётных данных LMS, с sandbox CSP и без Set-Cookie runtime', async () => {
    const response = await request()
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<h1>Next</h1>')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(response.headers.get('X-Frame-Options')).toBeNull()
    expect(response.headers.get('Content-Security-Policy')).toContain('sandbox allow-scripts')
    expect(response.headers.get('Content-Security-Policy')).not.toContain('allow-same-origin')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('null')
  })

  it('передаёт внутренний путь и query; не требует LMS-cookie для случайного capability', async () => {
    expect((await request({ path: ['_next', 'static', 'chunk.js'], query: '?v=1' })).status).toBe(200)
    expect(proxyRuntimeRequest).toHaveBeenCalledWith(token, '/_next/static/chunk.js?v=1', expect.any(Request))
    const incoming = proxyRuntimeRequest.mock.calls[0][2] as Request
    expect(incoming.headers.has('cookie')).toBe(false)
    expect(incoming.headers.has('authorization')).toBe(false)
  })

  it('проверяет capability и путь до обращения к runtime', async () => {
    for (const leaseToken of ['short', 'a'.repeat(129), 'bad token'.repeat(5)]) expect((await request({ leaseToken })).status).toBe(404)
    for (const path of [['..'], ['.'], ['foo/bar'], ['foo\\bar'], ['nul\u0000']]) expect((await request({ path })).status).toBe(404)
    expect(proxyRuntimeRequest).not.toHaveBeenCalled()
  })

  it('обрабатывает preflight локально, возвращает HEAD без тела', async () => {
    const options = await request({ method: 'OPTIONS' })
    expect(options.status).toBe(204)
    expect(options.headers.get('Access-Control-Allow-Headers')).toContain('Next-Action')
    expect(proxyRuntimeRequest).not.toHaveBeenCalled()
    const head = await request({ method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it.each(['https://evil.test/', '//evil.test/', '/login', `/api/trainer/preview/${token}/foo\\bar`, `/api/trainer/preview/${token}/../../login`, `/api/trainer/preview/${token}/%2e%2e/%2e%2e/login`])('отклоняет перенаправление проекта %s', async (location) => {
    proxyRuntimeRequest.mockResolvedValue(new Response(null, { status: 302, headers: { Location: location } }))
    const response = await request()
    expect(response.status).toBe(400)
    expect(response.headers.get('Location')).toBeNull()
  })

  it('разрешает перенаправление внутри своего capability, сохраняет истечение и ограничивает размер ответа', async () => {
    const location = `/api/trainer/preview/${token}/profile`
    proxyRuntimeRequest.mockResolvedValueOnce(new Response(null, { status: 307, headers: { Location: location } }))
    expect((await request()).headers.get('Location')).toBe(location)
    proxyRuntimeRequest.mockResolvedValueOnce(new Response('Expired', { status: 410 }))
    expect((await request()).status).toBe(410)
    proxyRuntimeRequest.mockResolvedValueOnce(new Response(new Uint8Array(8 * 1024 * 1024 + 1)))
    expect((await request()).status).toBe(413)
    proxyRuntimeRequest.mockRejectedValueOnce(new TrainerRunnerError('gone'))
    expect((await request()).status).toBe(503)
  })
})

describe('настоящий runtime HTTP-адаптер', () => {
  it('не пересылает Cookie, JWT, Host, Origin и чужие заголовки; пересылает только runtime auth и данные Next', async () => {
    const fetchRuntime = vi.fn(async () => new Response('OK'))
    vi.stubGlobal('fetch', fetchRuntime)
    const incoming = new Request('https://lms.test/api/trainer/preview/project', { method: 'POST', headers: {
      Cookie: 'payload-token=USER_COOKIE', Authorization: 'JWT USER_JWT', Host: 'evil.test', Origin: 'https://lms.test', 'X-Secret': 'private',
      'Content-Type': 'text/plain', RSC: '1', 'Next-Action': 'action', 'Next-Router-State-Tree': '[]',
    }, body: 'student request' })
    await adapter.proxyRuntimeRequest(token, '/page?x=1', incoming)
    expect(fetchRuntime).toHaveBeenCalledOnce()
    const [url, options] = fetchRuntime.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.href).toBe(`http://runtime.internal:8080/next/preview/${token}/page?x=1`)
    const headers = new Headers(options.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${serviceToken}`)
    expect(headers.get('rsc')).toBe('1')
    expect(headers.get('next-action')).toBe('action')
    for (const name of ['cookie', 'host', 'origin', 'x-secret']) expect(headers.has(name)).toBe(false)
    expect(headers.get('authorization')).not.toContain('USER_JWT')
    expect(new TextDecoder().decode(options.body as ArrayBuffer)).toBe('student request')
    expect(options.redirect).toBe('manual')
    expect(options.cache).toBe('no-store')
  })

  it('отклоняет выход за lease, неверный runtime URL и слишком большое тело до сетевого запроса', async () => {
    const fetchRuntime = vi.fn()
    vi.stubGlobal('fetch', fetchRuntime)
    const incoming = new Request('https://lms.test/preview')
    for (const path of ['//evil.test', '/../../secrets', '/foo\\bar']) await expect(adapter.proxyRuntimeRequest(token, path, incoming)).rejects.toThrow(TrainerRunnerError)
    vi.stubEnv('TRAINER_RUNTIME_URL', 'https://user:pass@runtime.internal')
    await expect(adapter.proxyRuntimeRequest(token, '/', incoming)).rejects.toThrow(TrainerRunnerError)
    vi.stubEnv('TRAINER_RUNTIME_URL', 'http://runtime.internal:8080')
    await expect(adapter.proxyRuntimeRequest(token, '/', new Request('https://lms.test/preview', { method: 'POST', body: 'x'.repeat(64 * 1024 + 1) }))).rejects.toThrow(TrainerRunnerError)
    expect(fetchRuntime).not.toHaveBeenCalled()
  })

  it('формирует путь Next.js из capability runtime, не доверяет присланному previewPath', async () => {
    const fetchRuntime = vi.fn(async () => Response.json({ leaseToken: token, expiresAt: 123, previewPath: 'https://evil.test/', url: 'http://runtime.internal/private' }))
    vi.stubGlobal('fetch', fetchRuntime)
    expect(await adapter.previewRuntime({ language: 'next', code: '{"app/page.tsx":""}', timeLimitMs: 5000 })).toEqual({ leaseToken: token, expiresAt: 123, previewPath: `/api/trainer/preview/${token}/` })
    const [, options] = fetchRuntime.mock.calls[0] as unknown as [URL, RequestInit]
    expect(new Headers(options.headers).get('authorization')).toBe(`Bearer ${serviceToken}`)
    expect(options.redirect).toBe('error')
  })
})
