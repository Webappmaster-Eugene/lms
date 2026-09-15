import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicResourceRef } from '@/lib/yandex-disk-url'

/**
 * Кеш прямых ссылок Яндекс.Диска: ссылка живёт ограниченное время, а плеер
 * докачивает файл кусками и дёргает резолвер помногу раз подряд.
 */

const fetchPublicDownloadHref = vi.fn()

vi.mock('@/lib/yandex-disk', () => ({ fetchPublicDownloadHref }))

const TTL_MS = 5 * 60 * 1000

async function freshResolver() {
  vi.resetModules()
  const hrefModule = await import('@/lib/yandex-disk-href')
  return hrefModule.resolveHref
}

const ref = (publicKey: string, path: string | null = null): PublicResourceRef => ({
  publicKey,
  path,
})

const REF = ref('https://disk.yandex.ru/d/abc123')

describe('кеш ссылок на файлы Яндекс.Диска', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T10:00:00Z'))
    fetchPublicDownloadHref.mockResolvedValue('https://downloader.yandex.ru/file-1')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  describe('попадание в кеш', () => {
    it('первый запрос идёт в API', async () => {
      const resolveHref = await freshResolver()

      await expect(resolveHref(REF)).resolves.toBe('https://downloader.yandex.ru/file-1')
      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(1)
    })

    it('повторные запросы того же файла в API не идут', async () => {
      const resolveHref = await freshResolver()

      await resolveHref(REF)
      await resolveHref(REF)
      await resolveHref(REF)

      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(1)
    })

    it('разные файлы кешируются раздельно', async () => {
      const resolveHref = await freshResolver()

      await resolveHref(REF)
      await resolveHref(ref('https://disk.yandex.ru/d/other'))

      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(2)
    })

    it('один и тот же ключ с разным path — разные записи', async () => {
      const resolveHref = await freshResolver()

      await resolveHref(ref(REF.publicKey, '/lesson-1.mp4'))
      await resolveHref(ref(REF.publicKey, '/lesson-2.mp4'))

      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(2)
    })
  })

  describe('срок жизни', () => {
    it('до истечения TTL ссылка берётся из кеша', async () => {
      const resolveHref = await freshResolver()

      await resolveHref(REF)
      vi.advanceTimersByTime(TTL_MS - 1000)
      await resolveHref(REF)

      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(1)
    })

    it('после истечения TTL ссылка перевыпускается', async () => {
      const resolveHref = await freshResolver()

      await resolveHref(REF)
      vi.advanceTimersByTime(TTL_MS + 1000)
      fetchPublicDownloadHref.mockResolvedValue('https://downloader.yandex.ru/file-2')

      await expect(resolveHref(REF)).resolves.toBe('https://downloader.yandex.ru/file-2')
      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(2)
    })
  })

  describe('токен доступа', () => {
    it('передаётся в API, когда задан', async () => {
      vi.stubEnv('YANDEX_DISK_TOKEN', 'secret-token')
      const resolveHref = await freshResolver()

      await resolveHref(REF)

      expect(fetchPublicDownloadHref).toHaveBeenCalledWith(REF, { token: 'secret-token' })
    })

    it('пустая переменная окружения не уходит как пустая строка', async () => {
      vi.stubEnv('YANDEX_DISK_TOKEN', '')
      const resolveHref = await freshResolver()

      await resolveHref(REF)

      expect(fetchPublicDownloadHref).toHaveBeenCalledWith(REF, { token: undefined })
    })
  })

  describe('ошибки', () => {
    it('отказ API пробрасывается наверх', async () => {
      const resolveHref = await freshResolver()
      fetchPublicDownloadHref.mockRejectedValueOnce(new Error('429 Too Many Requests'))

      await expect(resolveHref(REF)).rejects.toThrow('429')
    })

    it('неудачный запрос не отравляет кеш', async () => {
      const resolveHref = await freshResolver()
      fetchPublicDownloadHref.mockRejectedValueOnce(new Error('сеть недоступна'))

      await expect(resolveHref(REF)).rejects.toThrow()
      await expect(resolveHref(REF)).resolves.toBe('https://downloader.yandex.ru/file-1')
      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(2)
    })
  })

  describe('размер кеша', () => {
    it('протухшие записи вычищаются при новом запросе', async () => {
      const resolveHref = await freshResolver()

      await resolveHref(ref('a'))
      await resolveHref(ref('b'))

      vi.advanceTimersByTime(TTL_MS + 1000)
      await resolveHref(ref('c'))

      await resolveHref(ref('a'))
      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(4)
    })

    it('кеш не растёт бесконечно', async () => {
      const resolveHref = await freshResolver()

      for (let i = 0; i < 520; i++) {
        await resolveHref(ref(`key-${i}`))
      }
      const afterFill = fetchPublicDownloadHref.mock.calls.length

      await resolveHref(ref('key-0'))

      expect(afterFill).toBe(520)
      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(521)
    })

    it('свежий ключ остаётся в кеше после заполнения', async () => {
      const resolveHref = await freshResolver()

      for (let i = 0; i < 520; i++) {
        await resolveHref(ref(`key-${i}`))
      }
      const before = fetchPublicDownloadHref.mock.calls.length

      await resolveHref(ref('key-519'))

      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(before)
    })
  })
})
