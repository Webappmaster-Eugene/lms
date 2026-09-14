import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

const auth = vi.fn()
const fetchPublicDownloadHref = vi.fn()

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ auth })),
}))
vi.mock('@/lib/yandex-disk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/yandex-disk')>()
  return { ...actual, fetchPublicDownloadHref }
})

const { GET } = await import('@/app/api/yandex-disk/proxy/route')

const FOLDER = 'https://disk.yandex.ru/d/XP2GssUqm7HIEg'
const HREF = 'https://downloader.disk.yandex.ru/disk/abc/video.ts'

/** Кеш ссылок живёт в модуле между тестами — каждому тесту свой файл. */
let fileCounter = 0

function uniqueVideoUrl(extension = 'ts'): string {
  fileCounter++
  return `${FOLDER}/${encodeURIComponent('Раздел 1')}/${fileCounter}.${extension}`
}

function proxyRequest(url?: string, headers: Record<string, string> = {}): Request {
  const target = new URL('https://learn.mentorcareer.ru/api/yandex-disk/proxy')
  if (url !== undefined) target.searchParams.set('url', url)
  return new Request(target, { headers })
}

const upstream = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 1, role: 'student' } })
  fetchPublicDownloadHref.mockResolvedValue(HREF)
  upstream.mockResolvedValue(
    new Response(new Uint8Array([0x47, 0x40, 0x11, 0x10]), {
      status: 206,
      headers: {
        'Content-Range': 'bytes 0-3/1000',
        'Content-Length': '4',
        'Accept-Ranges': 'bytes',
        'Content-Type': 'application/octet-stream',
      },
    }),
  )
  vi.stubGlobal('fetch', upstream)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('доступ', () => {
  it('без сессии — 401 и без обращения к Яндексу', async () => {
    auth.mockResolvedValue({ user: null })

    const response = await GET(proxyRequest(uniqueVideoUrl()))

    expect(response.status).toBe(401)
    expect(fetchPublicDownloadHref).not.toHaveBeenCalled()
  })

  it('чужая ссылка отклоняется', async () => {
    const response = await GET(proxyRequest('https://example.com/video.ts'))

    expect(response.status).toBe(400)
    expect(fetchPublicDownloadHref).not.toHaveBeenCalled()
  })

  it('без параметра url — 400', async () => {
    const response = await GET(proxyRequest())

    expect(response.status).toBe(400)
  })
})

describe('отдача файла', () => {
  it('пробрасывает Range и отвечает 206 с границами куска', async () => {
    const response = await GET(proxyRequest(uniqueVideoUrl(), { Range: 'bytes=0-3' }))

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 0-3/1000')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')

    const [, init] = upstream.mock.calls[0]
    expect((init?.headers as Record<string, string>).Range).toBe('bytes=0-3')
  })

  it('без Range запрос уходит без этого заголовка', async () => {
    upstream.mockResolvedValue(new Response(new Uint8Array([0x47]), { status: 200 }))

    const response = await GET(proxyRequest(uniqueVideoUrl()))

    expect(response.status).toBe(200)
    const [, init] = upstream.mock.calls[0]
    expect(init?.headers).toEqual({})
  })

  it('тип содержимого у потока — video/mp2t', async () => {
    const response = await GET(proxyRequest(uniqueVideoUrl()))

    expect(response.headers.get('Content-Type')).toBe('video/mp2t')
  })

  it('временная ссылка не попадает ни в какой кеш', async () => {
    const response = await GET(proxyRequest(uniqueVideoUrl()))

    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('байты действительно доходят до клиента', async () => {
    const response = await GET(proxyRequest(uniqueVideoUrl()))
    const body = new Uint8Array(await response.arrayBuffer())

    expect(body[0]).toBe(0x47)
  })

  it('сбой источника не выдаётся за успех', async () => {
    upstream.mockResolvedValue(new Response('nope', { status: 403 }))

    const response = await GET(proxyRequest(uniqueVideoUrl()))

    expect(response.status).toBe(502)
  })
})
