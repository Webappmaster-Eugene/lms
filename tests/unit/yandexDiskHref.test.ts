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
  Reflect.deleteProperty(globalThis, '__lmsYandexDiskHrefs')
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

      expect(fetchPublicDownloadHref).toHaveBeenCalledWith(REF, { token: 'secret-token', signal: expect.any(AbortSignal) })
    })

    it('пустая переменная окружения не уходит как пустая строка', async () => {
      vi.stubEnv('YANDEX_DISK_TOKEN', '')
      const resolveHref = await freshResolver()

      await resolveHref(REF)

      expect(fetchPublicDownloadHref).toHaveBeenCalledWith(REF, { token: undefined, signal: expect.any(AbortSignal) })
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

  describe('параллельные Range и отмена запроса', () => {
    it('stream и proxy из разных routebundles используют один процессный кеш', async () => {
      const firstResolver = await freshResolver()
      await firstResolver(REF)
      vi.resetModules()
      const { resolveHref: secondResolver } = await import('@/lib/yandex-disk-href')
      await expect(secondResolver(REF)).resolves.toBe('https://downloader.yandex.ru/file-1')
      expect(fetchPublicDownloadHref).toHaveBeenCalledOnce()
    })
    it('параллельные metadata/head/tail получают одну ссылку и один вызов API', async () => {
      const resolveHref = await freshResolver()
      let complete: ((value: string) => void) | undefined
      fetchPublicDownloadHref.mockImplementationOnce(() => new Promise<string>((resolve) => { complete = resolve }))
      const requests = [resolveHref(REF), resolveHref(REF), resolveHref(REF)]
      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(1)
      complete?.('https://downloader.yandex.ru/shared')
      await expect(Promise.all(requests)).resolves.toEqual(Array(3).fill('https://downloader.yandex.ru/shared'))
    })

    it('отмена metadata не прерывает соседний Range-запрос', async () => {
      const resolveHref = await freshResolver()
      let complete: ((value: string) => void) | undefined
      fetchPublicDownloadHref.mockImplementationOnce(() => new Promise<string>((resolve) => { complete = resolve }))
      const controller = new AbortController()
      const metadata = resolveHref(REF, controller.signal)
      const range = resolveHref(REF)
      const cancellation = expect(metadata).rejects.toMatchObject({ name: 'AbortError' })
      controller.abort()
      await cancellation
      expect(fetchPublicDownloadHref.mock.calls[0][1].signal.aborted).toBe(false)
      complete?.('https://downloader.yandex.ru/shared')
      await expect(range).resolves.toBe('https://downloader.yandex.ru/shared')
      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(1)
    })

    it('после отмены всех читателей останавливает API и новый просмотр получает новую ссылку', async () => {
      const resolveHref = await freshResolver()
      fetchPublicDownloadHref.mockImplementationOnce((_ref, options) => new Promise<string>((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      }))
      const controller = new AbortController()
      const first = resolveHref(REF, controller.signal)
      const cancellation = expect(first).rejects.toMatchObject({ name: 'AbortError' })
      controller.abort()
      await cancellation
      expect(fetchPublicDownloadHref.mock.calls[0][1].signal.aborted).toBe(true)
      await expect(resolveHref(REF)).resolves.toBe('https://downloader.yandex.ru/file-1')
      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(2)
    })

    it('поздний ответ отменённого API не перезаписывает кеш следующего просмотра', async () => {
      const resolveHref = await freshResolver()
      let completeOld: ((value: string) => void) | undefined
      fetchPublicDownloadHref.mockImplementationOnce(() => new Promise<string>((resolve) => { completeOld = resolve }))
      const controller = new AbortController()
      const first = resolveHref(REF, controller.signal)
      const cancellation = expect(first).rejects.toMatchObject({ name: 'AbortError' })
      controller.abort()
      await cancellation
      await resolveHref(REF)
      completeOld?.('https://downloader.yandex.ru/cancelled')
      await Promise.resolve()
      await Promise.resolve()
      await expect(resolveHref(REF)).resolves.toBe('https://downloader.yandex.ru/file-1')
      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(2)
    })

    it('однозначный ключ не смешивает разные publicKey/path с одинаковой конкатенацией', async () => {
      const resolveHref = await freshResolver()
      const first = ref('https://disk.yandex.ru/d/a', '/b/c.mp4')
      const second = ref('https://disk.yandex.ru/d/a/b', '/c.mp4')
      await resolveHref(first)
      fetchPublicDownloadHref.mockResolvedValue('https://downloader.yandex.ru/second')
      await expect(resolveHref(second)).resolves.toBe('https://downloader.yandex.ru/second')
      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(2)
    })

    it('TTL начинается после получения ссылки, а не в начале медленного API-запроса', async () => {
      const resolveHref = await freshResolver()
      let complete: ((value: string) => void) | undefined
      fetchPublicDownloadHref.mockImplementationOnce(() => new Promise<string>((resolve) => { complete = resolve }))
      const pending = resolveHref(REF)
      vi.advanceTimersByTime(10000)
      complete?.('https://downloader.yandex.ru/shared')
      await pending
      vi.advanceTimersByTime(TTL_MS - 1000)
      await expect(resolveHref(REF)).resolves.toBe('https://downloader.yandex.ru/shared')
      expect(fetchPublicDownloadHref).toHaveBeenCalledTimes(1)
    })

    it('отклонение старой ссылки не удаляет уже обновлённую ссылку соседнего запроса', async () => {
      const resolveHref = await freshResolver()
      const { invalidateHref } = await import('@/lib/yandex-disk-href')
      const old = await resolveHref(REF)
      invalidateHref(REF, old)
      fetchPublicDownloadHref.mockResolvedValue('https://downloader.yandex.ru/new')
      await resolveHref(REF)
      invalidateHref(REF, old)
      await expect(resolveHref(REF)).resolves.toBe('https://downloader.yandex.ru/new')
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
