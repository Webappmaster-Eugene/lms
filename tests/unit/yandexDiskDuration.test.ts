import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchVideoDuration } from '@/lib/yandex-disk'

/**
 * Раньше длительность искалась слепым чтением первого мегабайта и хвоста.
 * На длинных записях moov весит десятки мегабайт и в это окно не попадает —
 * 153 видео библиотеки остались без длительности, хотя браузер их читает.
 * Теперь идём по таблице боксов и прыгаем прямо к moov.
 */

function box(type: string, size: number): Buffer {
  const b = Buffer.alloc(8)
  b.writeUInt32BE(size, 0)
  b.write(type, 4, 'latin1')
  return b
}

function largeBox(type: string, size: number): Buffer {
  const b = Buffer.alloc(16)
  b.writeUInt32BE(1, 0)
  b.write(type, 4, 'latin1')
  b.writeBigUInt64BE(BigInt(size), 8)
  return b
}

/** moov → mvhd (version 0) с заданными timescale и duration. */
function moovBox(timescale: number, duration: number): Buffer {
  const mvhd = Buffer.alloc(108)
  mvhd.writeUInt32BE(108, 0)
  mvhd.write('mvhd', 4, 'latin1')
  mvhd.writeUInt8(0, 8) // version
  mvhd.writeUInt32BE(timescale, 20)
  mvhd.writeUInt32BE(duration, 24)

  const header = Buffer.alloc(8)
  header.writeUInt32BE(8 + mvhd.length, 0)
  header.write('moov', 4, 'latin1')

  return Buffer.concat([header, mvhd])
}

/** Отдаёт куски «файла» по Range, как это делает CDN Диска. */
function serveFile(file: Buffer) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/download')) {
      return new Response(JSON.stringify({ href: 'https://cdn.example/file.mp4' }), { status: 200 })
    }

    const range = (init?.headers as Record<string, string> | undefined)?.Range ?? ''
    const [, from, to] = range.match(/bytes=(\d+)-(\d+)/) ?? []
    const start = Number(from)
    const end = Math.min(Number(to), file.length - 1)
    const slice = new Uint8Array(file.subarray(start, end + 1))

    return new Response(slice, {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${file.length}` },
    })
  })
}

const REF = { publicKey: 'https://disk.yandex.ru/d/abc', path: '/lesson.mp4' }

describe('длительность видео из контейнера', () => {
  let fetchMock: ReturnType<typeof serveFile>

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function install(file: Buffer) {
    fetchMock = serveFile(file)
    vi.stubGlobal('fetch', fetchMock)
  }

  it('читает moov в начале файла (mp4 с faststart)', async () => {
    const file = Buffer.concat([
      box('ftyp', 24),
      Buffer.alloc(16),
      moovBox(1000, 364_000),
      box('mdat', 8),
    ])
    install(file)

    await expect(fetchVideoDuration(REF)).resolves.toBe(364)
  })

  it('добирается до moov за большим mdat, не вычитывая его', async () => {
    const mdatSize = 64 * 1024 * 1024
    const file = Buffer.concat([
      box('ftyp', 24),
      Buffer.alloc(16),
      box('mdat', mdatSize),
      Buffer.alloc(mdatSize - 8), // «тело» mdat
      moovBox(600, 5_400_000),
    ])
    install(file)

    await expect(fetchVideoDuration(REF)).resolves.toBe(9000)

    // ни один запрос не тянет мегабайты: только заголовки боксов и начало moov
    const ranges = fetchMock.mock.calls
      .map((c) => ((c[1]?.headers as Record<string, string> | undefined)?.Range ?? ''))
      .filter(Boolean)
      .map((r) => {
        const [, from, to] = r.match(/bytes=(\d+)-(\d+)/) ?? []
        return Number(to) - Number(from) + 1
      })
    expect(Math.max(...ranges)).toBeLessThanOrEqual(4096)
  })

  it('понимает 64-битный размер бокса', async () => {
    const mdatSize = 16 * 1024 * 1024
    const file = Buffer.concat([
      box('ftyp', 16),
      Buffer.alloc(8),
      largeBox('mdat', mdatSize),
      Buffer.alloc(mdatSize - 16),
      moovBox(1000, 120_000),
    ])
    install(file)

    await expect(fetchVideoDuration(REF)).resolves.toBe(120)
  })

  it('на контейнере без moov отдаёт null, а не падает', async () => {
    const file = Buffer.concat([box('ftyp', 16), Buffer.alloc(8), box('mdat', 1024), Buffer.alloc(1016)])
    install(file)

    await expect(fetchVideoDuration(REF)).resolves.toBeNull()
  })

  it('битый размер бокса не уводит в бесконечный цикл', async () => {
    const broken = Buffer.alloc(64)
    broken.writeUInt32BE(0, 0) // size 0 — «до конца файла»
    broken.write('mdat', 4, 'latin1')
    install(broken)

    await expect(fetchVideoDuration(REF)).resolves.toBeNull()
    expect(fetchMock.mock.calls.length).toBeLessThan(10)
  })
})
