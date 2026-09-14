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


/** Элемент EBML: идентификатор как есть + размер в переменной длине. */
function ebml(id: number[], payload: Buffer): Buffer {
  const size = Buffer.alloc(4)
  size.writeUInt32BE(0x10000000 | payload.length, 0) // 4-байтовый vint
  return Buffer.concat([Buffer.from(id), size, payload])
}

function ebmlFloat(id: number[], value: number): Buffer {
  const payload = Buffer.alloc(8)
  payload.writeDoubleBE(value, 0)
  return ebml(id, payload)
}

function ebmlUint(id: number[], value: number): Buffer {
  const payload = Buffer.alloc(4)
  payload.writeUInt32BE(value, 0)
  return ebml(id, payload)
}

/** Файл Matroska: заголовок EBML, затем Segment → Info → TimecodeScale + Duration. */
function matroska(durationTicks: number, timecodeScale = 1_000_000): Buffer {
  const info = Buffer.concat([
    ebmlUint([0x2a, 0xd7, 0xb1], timecodeScale),
    ebmlFloat([0x44, 0x89], durationTicks),
  ])
  const segment = Buffer.concat([
    ebml([0x11, 0x4d, 0x9b, 0x74], Buffer.alloc(64)), // SeekHead — пропускаем
    ebml([0x15, 0x49, 0xa9, 0x66], info),
  ])
  return Buffer.concat([
    ebml([0x1a, 0x45, 0xdf, 0xa3], Buffer.alloc(16)),
    ebml([0x18, 0x53, 0x80, 0x67], segment),
    Buffer.alloc(4096), // «поток данных»
  ])
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

  it('короткий бокс free между ftyp и mdat не обрывает обход', async () => {
    // Ровно такая раскладка у длинных записей библиотеки: ftyp, free(8), mdat, moov
    const mdatSize = 32 * 1024 * 1024
    const file = Buffer.concat([
      box('ftyp', 32),
      Buffer.alloc(24),
      box('free', 8),
      box('mdat', mdatSize),
      Buffer.alloc(mdatSize - 8),
      moovBox(1000, 6_755_334),
    ])
    install(file)

    await expect(fetchVideoDuration(REF)).resolves.toBeCloseTo(6755.334, 2)
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

  it('Matroska: длительность берётся из Info, а не из moov', () => {
    install(matroska(1_700_000))

    // 1 700 000 тактов × 1 мс = 1700 с
    return expect(fetchVideoDuration(REF)).resolves.toBeCloseTo(1700, 3)
  })

  it('Matroska с нестандартным TimecodeScale считается верно', () => {
    install(matroska(600_000, 100_000))

    return expect(fetchVideoDuration(REF)).resolves.toBeCloseTo(60, 3)
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
