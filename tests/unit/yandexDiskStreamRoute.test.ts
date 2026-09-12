import { describe, it, expect, beforeEach, vi } from 'vitest'

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

const { GET } = await import('@/app/api/yandex-disk/stream/route')

const FOLDER = 'https://disk.yandex.ru/d/XP2GssUqm7HIEg'
const HREF = 'https://downloader.disk.yandex.ru/disk/abc/1.mp4'

/** Каждый тест берёт свой файл: кеш ссылок живёт в модуле между тестами. */
let fileCounter = 0

function streamRequest(url?: string): Request {
  const target = new URL('https://lms.nadtocheev.ru/api/yandex-disk/stream')
  if (url !== undefined) target.searchParams.set('url', url)
  return new Request(target)
}

function uniqueVideoUrl(): string {
  fileCounter++
  return `${FOLDER}/${encodeURIComponent('0. Предобучение')}/${fileCounter}.mp4`
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 1, role: 'student' } })
  fetchPublicDownloadHref.mockResolvedValue(HREF)
})

describe('доступ', () => {
  it('без сессии — 401 и без обращения к Яндексу', async () => {
    auth.mockResolvedValue({ user: null })

    const response = await GET(streamRequest(uniqueVideoUrl()))

    expect(response.status).toBe(401)
    expect(fetchPublicDownloadHref).not.toHaveBeenCalled()
  })

  it('обычному студенту видео отдаётся — права админа не нужны', async () => {
    const response = await GET(streamRequest(uniqueVideoUrl()))

    expect(response.status).toBe(302)
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

describe('редирект на прямую ссылку', () => {
  it('отдаёт 302 на ссылку Яндекса и запрещает кеширование', async () => {
    const response = await GET(streamRequest(uniqueVideoUrl()))

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(HREF)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
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

    expect(second.status).toBe(302)
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
    await expect(response.json()).resolves.toMatchObject({ error: 'Файл не найден' })
  })

  it('неизвестная ошибка — 502, без деталей наружу', async () => {
    fetchPublicDownloadHref.mockRejectedValue(new Error('socket hang up'))

    const response = await GET(streamRequest(uniqueVideoUrl()))

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Не удалось получить ссылку на видео',
    })
  })

  it('упавший запрос не кешируется', async () => {
    const url = uniqueVideoUrl()
    fetchPublicDownloadHref.mockRejectedValueOnce(new Error('timeout'))

    await GET(streamRequest(url))
    const second = await GET(streamRequest(url))

    expect(second.status).toBe(302)
    expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(2)
  })
})
