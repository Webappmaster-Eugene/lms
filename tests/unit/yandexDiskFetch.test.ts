import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchFolderRecursive,
  fetchPublicDownloadHref,
  fetchPublicFolderContents,
  fetchPublicResourceMeta,
  fetchPublicTextFile,
  fetchVideoDuration,
  YandexDiskError,
  type YandexDiskItem,
} from '@/lib/yandex-disk'

/**
 * Клиент публичного API Яндекс.Диска. Сеть подменяется целиком: проверяется,
 * какие запросы уходят на Диск и что импорт получает в ответ.
 */

const PUBLIC_KEY = 'https://disk.yandex.ru/d/abc'
const REF = { publicKey: PUBLIC_KEY, path: '/lesson.mp4' }
const HREF = 'https://downloader.disk.yandex.ru/disk/file?sign=temporary'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function failure(status: number, statusText = ''): Response {
  return new Response('{"error":"DiskError"}', { status, statusText })
}

function requestUrl(call: unknown[]): URL {
  return new URL(String(call[0]))
}

function requestHeaders(call: unknown[]): Record<string, string> {
  return ((call[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>
}

function file(path: string): YandexDiskItem {
  return { name: path.split('/').pop() ?? '', type: 'file', path }
}

function dir(path: string): YandexDiskItem {
  return { name: path.split('/').pop() ?? '', type: 'dir', path }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('листинг публичной папки', () => {
  it('токен уходит заголовком OAuth, папка и страница — параметрами запроса', async () => {
    fetchMock.mockResolvedValue(json({ name: 'Курс', type: 'dir', _embedded: { items: [file('/Блок 1/1.mp4')], total: 1, limit: 100, offset: 0 } }))

    const items = await fetchPublicFolderContents(PUBLIC_KEY, { token: 'oauth-token', path: '/Блок 1' })

    expect(items.map((item) => item.path)).toEqual(['/Блок 1/1.mp4'])
    const url = requestUrl(fetchMock.mock.calls[0])
    expect(url.origin + url.pathname).toBe('https://cloud-api.yandex.net/v1/disk/public/resources')
    expect(Object.fromEntries(url.searchParams)).toEqual({ public_key: PUBLIC_KEY, limit: '100', offset: '0', path: '/Блок 1' })
    expect(requestHeaders(fetchMock.mock.calls[0])).toMatchObject({ Authorization: 'OAuth oauth-token' })
  })

  it('без токена заголовок авторизации не отправляется', async () => {
    fetchMock.mockResolvedValue(json({ name: 'Курс', type: 'dir', _embedded: { items: [], total: 0, limit: 100, offset: 0 } }))

    await fetchPublicFolderContents(PUBLIC_KEY)

    expect(requestHeaders(fetchMock.mock.calls[0])).not.toHaveProperty('Authorization')
  })

  it('ссылка на отдельный файл (ответ без _embedded) даёт пустой список, а не ошибку', async () => {
    fetchMock.mockResolvedValue(json({ name: 'lesson.mp4', type: 'file' }))

    await expect(fetchPublicFolderContents(PUBLIC_KEY)).resolves.toEqual([])
  })
})

describe('рекурсивный обход папки', () => {
  it('спускается во все подпапки и возвращает только файлы, сохраняя токен', async () => {
    const tree: Record<string, YandexDiskItem[]> = {
      '': [file('/intro.mp4'), dir('/Блок 1'), dir('/Пустая')],
      '/Блок 1': [file('/Блок 1/1.mp4'), dir('/Блок 1/src')],
      '/Блок 1/src': [file('/Блок 1/src/index.ts')],
      '/Пустая': [],
    }
    fetchMock.mockImplementation(async (input: string) => {
      const path = new URL(input).searchParams.get('path') ?? ''
      const items = tree[path] ?? []
      return json({ name: path, type: 'dir', _embedded: { items, total: items.length, limit: 100, offset: 0 } })
    })

    const files = await fetchFolderRecursive(PUBLIC_KEY, { token: 'oauth-token' })

    expect(files.map((item) => item.path)).toEqual(['/intro.mp4', '/Блок 1/1.mp4', '/Блок 1/src/index.ts'])
    expect(files.every((item) => item.type === 'file')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    for (const call of fetchMock.mock.calls) {
      expect(requestHeaders(call)).toMatchObject({ Authorization: 'OAuth oauth-token' })
    }
  })
})

describe('описание публичного ресурса', () => {
  it.each([
    ['без имени', { type: 'file' }],
    ['с неизвестным типом', { name: 'Гайд.pdf', type: 'link' }],
  ])('ответ %s — ошибка 502, а не мусор в названии материала', async (_label, body) => {
    fetchMock.mockResolvedValue(json(body))

    const error = await fetchPublicResourceMeta({ publicKey: PUBLIC_KEY, path: null }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(YandexDiskError)
    expect(error).toMatchObject({ statusCode: 502, message: 'Яндекс.Диск не вернул описание файла' })
  })
})

describe('повторы и ошибки API', () => {
  it('429 и 5xx повторяются с удваивающейся паузой, затем приходит ответ', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(failure(429))
      .mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(json({ href: HREF }))

    const pending = fetchPublicDownloadHref(REF)

    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toBe(HREF)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('после трёх неудачных попыток ошибка несёт код и текст ответа', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () => failure(500, 'Internal Server Error'))

    const pending = fetchPublicDownloadHref(REF).catch((caught: unknown) => caught)
    await vi.advanceTimersByTimeAsync(10_000)

    const error = await pending
    expect(error).toBeInstanceOf(YandexDiskError)
    expect(error).toMatchObject({ statusCode: 500, message: 'Ошибка Яндекс.Диска: 500 Internal Server Error' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it.each([
    [403, 'Доступ запрещён. Убедитесь, что ссылка на папку является публичной.'],
    [400, 'Ошибка Яндекс.Диска: 400 Bad Request'],
  ])('ответ %i не повторяется и объясняет причину', async (status, message) => {
    fetchMock.mockResolvedValue(failure(status, 'Bad Request'))

    await expect(fetchPublicFolderContents(PUBLIC_KEY)).rejects.toMatchObject({ name: 'YandexDiskError', statusCode: status, message })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('отмена во время паузы перед повтором прерывает ожидание и новых запросов не делает', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () => failure(503))
    const controller = new AbortController()

    const pending = fetchPublicDownloadHref(REF, { signal: controller.signal }).catch((caught: unknown) => caught)
    await vi.advanceTimersByTimeAsync(500)
    controller.abort()

    await expect(pending).resolves.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('если зритель ушёл, пока шёл запрос, повтор даже не планируется', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      controller.abort()
      return failure(503)
    })

    const pending = fetchPublicDownloadHref(REF, { signal: controller.signal }).catch((caught: unknown) => caught)

    // Отказ приходит без ожидания паузы: таймеры не двигались.
    await expect(pending).resolves.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('временная ссылка на файл', () => {
  it('запрашивается с токеном и путём файла внутри публикации', async () => {
    fetchMock.mockResolvedValue(json({ href: HREF }))

    await expect(fetchPublicDownloadHref(REF, { token: 'oauth-token' })).resolves.toBe(HREF)

    const url = requestUrl(fetchMock.mock.calls[0])
    expect(url.pathname).toBe('/v1/disk/public/resources/download')
    expect(url.searchParams.get('public_key')).toBe(PUBLIC_KEY)
    expect(url.searchParams.get('path')).toBe('/lesson.mp4')
    expect(requestHeaders(fetchMock.mock.calls[0])).toMatchObject({ Authorization: 'OAuth oauth-token' })
  })

  it('ответ без href — ошибка 502', async () => {
    fetchMock.mockResolvedValue(json({}))

    await expect(fetchPublicDownloadHref(REF)).rejects.toMatchObject({ name: 'YandexDiskError', statusCode: 502 })
  })
})

/** Windows-1251 для кириллицы и ASCII — так сохраняют тексты старые Блокноты. */
function windows1251(text: string): Uint8Array {
  return Uint8Array.from([...text], (char) => {
    const code = char.charCodeAt(0)
    if (code < 0x80) return code
    if (code >= 0x410 && code <= 0x44f) return 0xc0 + (code - 0x410)
    if (char === 'Ё') return 0xa8
    if (char === 'ё') return 0xb8
    throw new Error(`Символ ${char} не нужен тесту`)
  })
}

describe('текстовый материал урока', () => {
  function serveText(body: Uint8Array) {
    fetchMock.mockImplementation(async (input: string) => {
      if (input.startsWith('https://cloud-api.yandex.net/')) return json({ href: HREF })
      return new Response(new Uint8Array(body), { status: 206 })
    })
  }

  it('скачивается по временной ссылке и только первые 64 КБ', async () => {
    serveText(new TextEncoder().encode('Ссылки к уроку'))

    await fetchPublicTextFile(REF)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe(HREF)
    expect(requestHeaders(fetchMock.mock.calls[1])).toEqual({ Range: 'bytes=0-65535' })
  })

  it('UTF-8 отдаётся без BOM в начале', async () => {
    serveText(new TextEncoder().encode('﻿Полезные ссылки: https://nodejs.org'))

    await expect(fetchPublicTextFile(REF)).resolves.toBe('Полезные ссылки: https://nodejs.org')
  })

  it('Windows-1251 распознаётся, когда строгий UTF-8 не сходится', async () => {
    serveText(windows1251('Ёлка, привет! Конспект урока.'))

    await expect(fetchPublicTextFile(REF)).resolves.toBe('Ёлка, привет! Конспект урока.')
  })

  it('пустой файл — null, а не пустой материал', async () => {
    serveText(new Uint8Array())

    await expect(fetchPublicTextFile(REF)).resolves.toBeNull()
  })
})

/** moov → mvhd (version 0) с заданными timescale и duration. */
function moovBox(timescale: number, duration: number): Buffer {
  const mvhd = Buffer.alloc(108)
  mvhd.writeUInt32BE(108, 0)
  mvhd.write('mvhd', 4, 'latin1')
  mvhd.writeUInt32BE(timescale, 20)
  mvhd.writeUInt32BE(duration, 24)
  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + mvhd.length, 0)
  header.write('moov', 4, 'latin1')
  return Buffer.concat([header, mvhd])
}

function tsPacket(pcr: number | null): Buffer {
  const packet = Buffer.alloc(188, 0)
  packet[0] = 0x47
  if (pcr === null) {
    packet[3] = 0x10
    return packet
  }
  packet[3] = 0x30
  packet[4] = 7
  packet[5] = 0x10
  const base = Math.floor(pcr / 300)
  const extension = pcr % 300
  packet[6] = Math.floor(base / 2 ** 25) & 0xff
  packet[7] = Math.floor(base / 2 ** 17) & 0xff
  packet[8] = Math.floor(base / 2 ** 9) & 0xff
  packet[9] = Math.floor(base / 2) & 0xff
  packet[10] = ((base & 1) << 7) | ((extension >> 8) & 1)
  packet[11] = extension & 0xff
  return packet
}

/** Поток длиннее окна чтения (1 МБ): начало и хвост читаются разными запросами. */
function longTransportStream(firstPcr: number, lastPcr: number | null): Buffer {
  const filler = Array.from({ length: 6000 }, () => tsPacket(null))
  return Buffer.concat([tsPacket(firstPcr), ...filler, tsPacket(lastPcr)])
}

describe('длительность видео: запасные пути', () => {
  function serveVideo(content: Buffer) {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input.startsWith('https://cloud-api.yandex.net/')) return json({ href: HREF })
      const range = requestHeaders([input, init]).Range ?? ''
      const [, from, to] = /bytes=(\d+)-(\d+)/.exec(range) ?? []
      const start = Number(from)
      const end = Math.min(Number(to), content.length - 1)
      return new Response(new Uint8Array(content.subarray(start, end + 1)), {
        status: 206,
        headers: { 'Content-Range': `bytes ${start}-${end}/${content.length}` },
      })
    })
  }

  function requestedRanges(): string[] {
    return fetchMock.mock.calls.map((call) => requestHeaders(call).Range).filter(Boolean)
  }

  it('битое начало файла: moov находится слепым чтением хвоста', async () => {
    // Нулевой размер первого бокса обрывает обход таблицы боксов.
    const content = Buffer.concat([Buffer.alloc(2 * 1024 * 1024), moovBox(1000, 90_000)])
    serveVideo(content)

    await expect(fetchVideoDuration(REF)).resolves.toBe(90)
    expect(requestedRanges().at(-1)).toBe(`bytes=${content.length - 1536 * 1024}-${content.length - 1}`)
  })

  it('длинный MPEG-TS: хвост читается отдельным запросом, длительность — по крайним PCR', async () => {
    const content = longTransportStream(27_000_000, 27_000_000 * 121)
    serveVideo(content)

    await expect(fetchVideoDuration(REF)).resolves.toBeCloseTo(120, 3)
    expect(requestedRanges()).toContain(`bytes=${content.length - 1024 * 1024}-${content.length - 1}`)
  })

  it('MPEG-TS без меток времени в хвосте — длительность неизвестна, а не случайное число', async () => {
    serveVideo(longTransportStream(27_000_000, null))

    await expect(fetchVideoDuration(REF)).resolves.toBeNull()
  })

  it('файл, лишь начинающийся с байта 0x47 (GIF под именем .mp4), не принимается за MPEG-TS', async () => {
    serveVideo(Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(4096, 0x20)]))

    await expect(fetchVideoDuration(REF)).resolves.toBeNull()
  })

  it('запись, оборванная внутри moov, даёт null без исключения', async () => {
    const ftyp = Buffer.alloc(24)
    ftyp.writeUInt32BE(24, 0)
    ftyp.write('ftyp', 4, 'latin1')
    // moov объявлен целиком, но файл кончается сразу за меткой mvhd.
    const truncated = moovBox(1000, 90_000).subarray(0, 8 + 8 + 2)
    serveVideo(Buffer.concat([ftyp, truncated]))

    await expect(fetchVideoDuration(REF)).resolves.toBeNull()
  })

  it('ошибка API Диска не роняет импорт: длительность просто неизвестна', async () => {
    fetchMock.mockResolvedValue(failure(404))

    await expect(fetchVideoDuration(REF)).resolves.toBeNull()
  })
})
