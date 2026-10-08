import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const auth = vi.fn()
const fetchPublicDownloadHref = vi.fn()
const upstream = vi.fn()
vi.mock('@/server/learning-access', () => ({ canAccessLesson: vi.fn(async () => true) }))

vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ auth })),
}))
vi.mock('@/lib/yandex-disk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/yandex-disk')>()
  return { ...actual, fetchPublicDownloadHref }
})

const { GET } = await import('@/app/api/yandex-disk/stream/route')

const FOLDER = 'https://disk.yandex.ru/d/XP2GssUqm7HIEg'
const HREF = 'https://downloader.disk.yandex.ru/disk/abc/1.mp4'

/** Каждый тест берёт свой файл: кеш ссылок живёт в модуле между тестами. */
let fileCounter = 0

function streamRequest(url?: string): Request {
  const target = new URL('https://learn.mentorcareer.ru/api/yandex-disk/stream')
  if (url !== undefined) target.searchParams.set('url', url)
  return new Request(target)
}

function uniqueVideoUrl(): string {
  fileCounter++
  return `${FOLDER}/${encodeURIComponent('0. Предобучение')}/${fileCounter}.mp4`
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: { id: ++fileCounter + 10000, role: 'admin' } })
  fetchPublicDownloadHref.mockResolvedValue(HREF)
  upstream.mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '3' } }))
  vi.stubGlobal('fetch', upstream)
})
afterEach(() => vi.unstubAllGlobals())

describe('доступ', () => {
  it('ошибка проверки сессии закрывает выдачу и сохраняет private,no-store', async () => {
    auth.mockRejectedValue(new Error('database is unavailable'))
    const response = await GET(streamRequest(uniqueVideoUrl()))
    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(fetchPublicDownloadHref).not.toHaveBeenCalled()
    expect(upstream).not.toHaveBeenCalled()
  })
  it('без сессии — 401 и без обращения к Яндексу', async () => {
    auth.mockResolvedValue({ user: null })

    const response = await GET(streamRequest(uniqueVideoUrl()))

    expect(response.status).toBe(401)
    expect(fetchPublicDownloadHref).not.toHaveBeenCalled()
  })

  it('админская диагностика исходного URL остаётся доступна', async () => {
    const response = await GET(streamRequest(uniqueVideoUrl()))

    expect(response.status).toBe(200)
    expect(response.headers.get('Location')).toBeNull()
  })

  it('ученик не может получать произвольные публичные источники вместо урока', async () => {
    auth.mockResolvedValue({ user: { id: 1, role: 'student' } })
    const response = await GET(streamRequest(uniqueVideoUrl()))
    expect(response.status).toBe(403)
    expect(fetchPublicDownloadHref).not.toHaveBeenCalled()
  })
})

describe('проверка параметров', () => {
  it('без url — 400', async () => {
    const response = await GET(streamRequest())

    expect(response.status).toBe(400)
    expect(fetchPublicDownloadHref).not.toHaveBeenCalled()
  })

  it.each([
    ['чужой хост', 'https://evil.example.com/d/abc/1.mp4'],
    ['не ссылка', 'не-ссылка'],
    ['file-схема', 'file:///etc/passwd'],
  ])('%s — 400 и никакого запроса наружу', async (_label, url) => {
    const response = await GET(streamRequest(url))

    expect(response.status).toBe(400)
    expect(fetchPublicDownloadHref).not.toHaveBeenCalled()
  })
})

describe('защищённый поток без CDN capability', () => {
  it('отдаёт байты сервера и запрещает кеширование', async () => {
    const response = await GET(streamRequest(uniqueVideoUrl()))

    expect(response.status).toBe(200)
    expect(response.headers.get('Location')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('снимает Referer с запроса по Location — иначе CDN Яндекса отвечает 403', async () => {
    const response = await GET(streamRequest(uniqueVideoUrl()))

    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('путь к файлу передаётся отдельно от ключа публикации', async () => {
    const url = uniqueVideoUrl()

    await GET(streamRequest(url))

    expect(fetchPublicDownloadHref).toHaveBeenCalledWith(
      { publicKey: FOLDER, path: expect.stringMatching(/^\/0\. Предобучение\/\d+\.mp4$/) },
      expect.anything(),
    )
  })

  it('повторный запрос того же файла берёт ссылку из кеша', async () => {
    const url = uniqueVideoUrl()

    await GET(streamRequest(url))
    const second = await GET(streamRequest(url))

    expect(second.status).toBe(200)
    expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(1)
  })

  it('разные файлы кеш не путает', async () => {
    await GET(streamRequest(uniqueVideoUrl()))
    await GET(streamRequest(uniqueVideoUrl()))

    expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(2)
  })
})

describe('ошибки Яндекс.Диска', () => {
  it('404 от Яндекса пробрасывается как 404', async () => {
    const { YandexDiskError } = await import('@/lib/yandex-disk')
    fetchPublicDownloadHref.mockRejectedValue(new YandexDiskError('Файл не найден', 404))

    const response = await GET(streamRequest(uniqueVideoUrl()))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: 'Не удалось открыть файл. Попробуйте ещё раз' })
  })

  it('неизвестная ошибка — 502, без деталей наружу', async () => {
    fetchPublicDownloadHref.mockRejectedValue(new Error('socket hang up'))

    const response = await GET(streamRequest(uniqueVideoUrl()))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Не удалось открыть файл. Попробуйте ещё раз',
    })
  })

  it('упавший запрос не кешируется', async () => {
    const url = uniqueVideoUrl()
    fetchPublicDownloadHref.mockRejectedValueOnce(new Error('timeout'))

    await GET(streamRequest(url))
    const second = await GET(streamRequest(url))

    expect(second.status).toBe(200)
    expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(2)
  })
})
