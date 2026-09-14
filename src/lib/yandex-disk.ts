/**
 * Яндекс.Диск API клиент для работы с публичными папками.
 * Используется для автоматического импорта курсов из видео-файлов.
 */

import type { PublicResourceRef } from './yandex-disk-url'

export { buildPublicFileUrl, parsePublicResourceUrl } from './yandex-disk-url'
export type { PublicResourceRef } from './yandex-disk-url'

const YD_API_BASE = 'https://cloud-api.yandex.net/v1/disk/public/resources'

/** Максимальный размер текстового материала, который разворачиваем в контент урока. */
const MAX_TEXT_FILE_BYTES = 64 * 1024
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'])

export type YandexDiskItem = {
  name: string
  type: 'file' | 'dir'
  path: string
  mime_type?: string
  size?: number
  public_url?: string
  file?: string // temporary download URL
}

type YandexDiskEmbedded = {
  items: YandexDiskItem[]
  total: number
  limit: number
  offset: number
}

type YandexDiskResponse = {
  name: string
  type: 'file' | 'dir'
  public_key?: string
  public_url?: string
  _embedded?: YandexDiskEmbedded
}

type FetchOptions = {
  token?: string
  path?: string
  limit?: number
  offset?: number
}

/**
 * Получает содержимое публичной папки Яндекс.Диска.
 * Поддерживает пагинацию для папок с > 100 файлами.
 */
export async function fetchPublicFolderContents(
  publicUrl: string,
  options: FetchOptions = {},
): Promise<YandexDiskItem[]> {
  const { token, path, limit = 100, offset = 0 } = options

  const url = new URL(YD_API_BASE)
  url.searchParams.set('public_key', publicUrl)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset))
  if (path) {
    url.searchParams.set('path', path)
  }

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `OAuth ${token}`
  }

  const response = await fetchWithRetry(url.toString(), { headers })
  const data: YandexDiskResponse = await response.json()

  if (!data._embedded) {
    return []
  }

  const items = data._embedded.items
  const total = data._embedded.total

  // Рекурсивная пагинация если файлов больше чем limit
  if (total > offset + limit) {
    const nextItems = await fetchPublicFolderContents(publicUrl, {
      ...options,
      offset: offset + limit,
    })
    return [...items, ...nextItems]
  }

  return items
}

/**
 * Рекурсивно получает всё содержимое папки, включая подпапки.
 */
export async function fetchFolderRecursive(
  publicUrl: string,
  options: Omit<FetchOptions, 'path'> = {},
  currentPath?: string,
): Promise<YandexDiskItem[]> {
  const items = await fetchPublicFolderContents(publicUrl, { ...options, path: currentPath })
  const result: YandexDiskItem[] = []

  for (const item of items) {
    if (item.type === 'dir') {
      const subItems = await fetchFolderRecursive(publicUrl, options, item.path)
      result.push(...subItems)
    } else {
      result.push(item)
    }
  }

  return result
}

/**
 * Фильтрует только видео-файлы из списка элементов.
 */
export function filterVideoFiles(items: YandexDiskItem[]): YandexDiskItem[] {
  return items.filter((item) => {
    if (item.type !== 'file') return false
    const ext = getFileExtension(item.name)
    return VIDEO_EXTENSIONS.has(ext)
  })
}

/**
 * Извлекает расширение файла (нижний регистр, без точки).
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot + 1).toLowerCase()
}

/**
 * Fetch с retry и exponential backoff.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempt = 1,
): Promise<Response> {
  const response = await fetch(url, init)

  if (response.ok) return response

  // 429 Too Many Requests или 5xx — ретраим
  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1)
    await new Promise((resolve) => setTimeout(resolve, delay))
    return fetchWithRetry(url, init, attempt + 1)
  }

  if (response.status === 404) {
    throw new YandexDiskError('Папка не найдена. Проверьте, что ссылка публичная и корректная.', response.status)
  }

  if (response.status === 403) {
    throw new YandexDiskError('Доступ запрещён. Убедитесь, что ссылка на папку является публичной.', response.status)
  }

  throw new YandexDiskError(
    `Ошибка Яндекс.Диска: ${response.status} ${response.statusText}`,
    response.status,
  )
}

export class YandexDiskError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'YandexDiskError'
  }
}

/**
 * Получает временную прямую ссылку на файл публичного ресурса.
 * Ссылка живёт ограниченное время, поэтому её нельзя сохранять в контент.
 */
export async function fetchPublicDownloadHref(
  ref: PublicResourceRef,
  options: { token?: string } = {},
): Promise<string> {
  const url = new URL(`${YD_API_BASE}/download`)
  url.searchParams.set('public_key', ref.publicKey)
  if (ref.path) {
    url.searchParams.set('path', ref.path)
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.token) {
    headers['Authorization'] = `OAuth ${options.token}`
  }

  const response = await fetchWithRetry(url.toString(), { headers })
  const data: { href?: string } = await response.json()

  if (!data.href) {
    throw new YandexDiskError('Яндекс.Диск не вернул ссылку на файл', 502)
  }

  return data.href
}

/**
 * Скачивает небольшой текстовый файл публичного ресурса.
 * Файлы больше MAX_TEXT_FILE_BYTES не читаем — такие материалы остаются ссылкой.
 */
export async function fetchPublicTextFile(
  ref: PublicResourceRef,
  options: { token?: string } = {},
): Promise<string | null> {
  const href = await fetchPublicDownloadHref(ref, options)
  const response = await fetchWithRetry(href, {
    headers: { Range: `bytes=0-${MAX_TEXT_FILE_BYTES - 1}` },
  })

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength === 0) return null

  return decodeText(buffer)
}

/**
 * Текстовые материалы курсов приходят как из UTF-8, так и из Windows-1251 —
 * определяем кодировку по успешности строгого UTF-8 декодирования.
 */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1251').decode(buffer)
  }
}

/** Сколько байт читаем в поисках moov-атома с начала и с конца файла. */
const MOOV_HEAD_BYTES = 1024 * 1024
const MOOV_TAIL_BYTES = 1536 * 1024

/** Заголовка mp4-бокса хватает 16 байт: size (4 или 4+8) + type (4). */
const BOX_HEADER_BYTES = 16
/** Короткий бокс — это всё ещё валидный бокс: "free" между ftyp и mdat весит ровно 8. */
const MIN_BOX_SIZE = 8
/** mvhd лежит первым ребёнком moov, так что начала бокса достаточно. */
const MOOV_PROBE_BYTES = 4096
/** Страховка от зацикливания на битом контейнере. */
const MAX_BOX_WALK = 24

/** MPEG-TS: пакеты по 188 байт, каждый начинается с 0x47. Метки времени — в PCR. */
const TS_PACKET_BYTES = 188
const TS_SYNC_BYTE = 0x47
/** Сколько читаем с начала и с конца, чтобы поймать первый и последний PCR. */
const TS_PROBE_BYTES = 1024 * 1024
/** Частота часов PCR. */
const PCR_HZ = 27_000_000
/** Запись длиннее суток — признак разрыва счётчика, а не реальной длительности. */
const MAX_REASONABLE_SECONDS = 24 * 60 * 60

/** Сигнатура Matroska: часть записей библиотеки — mkv, иногда под именем .mp4. */
const EBML_MAGIC = 0x1a45dfa3
/** Блок Info с длительностью лежит в начале сегмента, сразу за оглавлением. */
const EBML_PROBE_BYTES = 256 * 1024
const EBML_SEGMENT = 0x18538067
const EBML_INFO = 0x1549a966
const EBML_TIMECODE_SCALE = 0x2ad7b1
const EBML_DURATION = 0x4489
/** Наносекунды в секунде: TimecodeScale задаётся в них. */
const NS_IN_SECOND = 1_000_000_000

/**
 * Длительность видео в секундах.
 *
 * API Диска её не отдаёт, поэтому читаем сам контейнер. У mp4 идём по таблице
 * верхнеуровневых боксов (ftyp → mdat → moov …) и прыгаем прямо к moov: слепое
 * чтение начала и хвоста промахивается на длинных записях, где moov весит
 * десятки мегабайт и лежит за пределами окна. Matroska узнаём по сигнатуре и
 * разбираем отдельно — moov в ней не бывает. Если ничего не вышло, возвращаем
 * null: показать урок без длительности лучше, чем уронить импорт.
 */
export async function fetchVideoDuration(
  ref: PublicResourceRef,
  options: { token?: string } = {},
): Promise<number | null> {
  try {
    const href = await fetchPublicDownloadHref(ref, options)

    const first = await fetchBytes(href, 0, BOX_HEADER_BYTES - 1)
    if (!first.total || first.body.length < 4) return null

    if (first.body.readUInt32BE(0) === EBML_MAGIC) {
      return await readDurationFromMatroska(href, first.total)
    }

    if (first.body[0] === TS_SYNC_BYTE) {
      const stream = await readDurationFromTransportStream(href, first.total)
      if (stream !== null) return stream
    }

    const walked = await readDurationByBoxWalk(href, first)
    if (walked !== null) return walked

    return await readDurationByScan(href)
  } catch {
    return null
  }
}

/** Прыжок к moov по таблице боксов: несколько коротких запросов вместо мегабайтов. */
async function readDurationByBoxWalk(
  href: string,
  first: { body: Buffer; total: number },
): Promise<number | null> {
  const total = first.total
  if (!total) return null

  let offset = 0
  let header = first.body

  for (let step = 0; step < MAX_BOX_WALK && offset + MIN_BOX_SIZE <= total; step++) {
    if (step > 0) {
      header = (await fetchBytes(href, offset, Math.min(offset + BOX_HEADER_BYTES, total) - 1)).body
    }

    const box = readBoxHeader(header)
    if (!box) return null

    if (box.type === 'moov') {
      const end = Math.min(offset + MOOV_PROBE_BYTES, total) - 1
      const moov = await fetchBytes(href, offset, end)
      return readMvhdDuration(moov.body)
    }

    // size 0 — бокс тянется до конца файла, значит moov за ним уже не будет
    if (box.size < MIN_BOX_SIZE) return null
    offset += box.size
  }

  return null
}

/** Запасной путь: слепое чтение начала и хвоста файла. */
async function readDurationByScan(href: string): Promise<number | null> {
  const head = await fetchBytes(href, 0, MOOV_HEAD_BYTES - 1)

  const fromHead = readMvhdDuration(head.body)
  if (fromHead !== null) return fromHead

  if (head.total <= MOOV_HEAD_BYTES) return null

  const tail = await fetchBytes(href, Math.max(0, head.total - MOOV_TAIL_BYTES), head.total - 1)
  return readMvhdDuration(tail.body)
}

/**
 * Длительность Matroska: элемент Duration в блоке Info, в единицах TimecodeScale.
 * Читаем начало файла — оглавление и Info лежат перед потоком данных.
 */
async function readDurationFromMatroska(href: string, total: number): Promise<number | null> {
  const chunk = await fetchBytes(href, 0, Math.min(EBML_PROBE_BYTES, total) - 1)
  const found = { scale: null as number | null, duration: null as number | null }

  scanEbml(chunk.body, 0, chunk.body.length, found, 0)

  if (found.duration === null || found.duration <= 0) return null

  const scale = found.scale ?? 1_000_000
  const seconds = (found.duration * scale) / NS_IN_SECOND

  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

/** Обходит элементы EBML, спускаясь только в Segment и Info. */
function scanEbml(
  buffer: Buffer,
  start: number,
  end: number,
  found: { scale: number | null; duration: number | null },
  depth: number,
): void {
  if (depth > 4) return

  let offset = start
  while (offset < end) {
    const id = readVint(buffer, offset, true)
    if (!id) return

    const size = readVint(buffer, id.next, false)
    if (!size) return

    // размер «неизвестен» — дальше идти по смещениям нельзя
    const bodyEnd = size.value === null ? end : Math.min(size.next + size.value, end)

    if (id.value === EBML_SEGMENT || id.value === EBML_INFO) {
      scanEbml(buffer, size.next, bodyEnd, found, depth + 1)
      if (found.duration !== null && found.scale !== null) return
    } else if (id.value === EBML_TIMECODE_SCALE && size.value !== null && size.value > 0) {
      found.scale = buffer.readUIntBE(size.next, Math.min(size.value, 6))
    } else if (id.value === EBML_DURATION && (size.value === 4 || size.value === 8)) {
      found.duration = size.value === 4
        ? buffer.readFloatBE(size.next)
        : buffer.readDoubleBE(size.next)
    }

    if (size.value === null) return
    offset = size.next + size.value
  }
}

/**
 * Переменная длина EBML: старшие нули первого байта задают число байт.
 * keepMarker — для идентификаторов (маркер входит в значение), иначе размер;
 * значение null у размера означает «неизвестен».
 */
function readVint(
  buffer: Buffer,
  offset: number,
  keepMarker: boolean,
): { value: number | null; next: number } | null {
  if (offset >= buffer.length) return null

  const head = buffer[offset]
  if (head === 0) return null

  let mask = 0x80
  let length = 1
  while ((head & mask) === 0) {
    mask >>= 1
    length += 1
    if (length > 8) return null
  }

  if (offset + length > buffer.length) return null

  let value = keepMarker ? head : head & (mask - 1)
  let unknown = !keepMarker && (head & (mask - 1)) === mask - 1

  for (let i = 1; i < length; i++) {
    const byte = buffer[offset + i]
    value = value * 256 + byte
    if (byte !== 0xff) unknown = false
  }

  if (!Number.isSafeInteger(value)) return null

  return { value: unknown ? null : value, next: offset + length }
}

/**
 * Длительность MPEG-TS: разница между первой и последней меткой PCR.
 * Контейнер не хранит длительность целиком, поэтому читаем начало и конец.
 */
async function readDurationFromTransportStream(
  href: string,
  total: number,
): Promise<number | null> {
  const headSize = Math.min(TS_PROBE_BYTES, total)
  const head = await fetchBytes(href, 0, headSize - 1)
  const first = collectPcr(head.body)
  if (first.length === 0) return null

  const tailStart = Math.max(0, total - TS_PROBE_BYTES)
  const tail = tailStart === 0 ? head : await fetchBytes(href, tailStart, total - 1)
  const last = collectPcr(tail.body)
  if (last.length === 0) return null

  const seconds = (last[last.length - 1] - first[0]) / PCR_HZ

  return seconds > 0 && seconds < MAX_REASONABLE_SECONDS ? seconds : null
}

/** Собирает метки PCR из пакетов, предварительно поймав выравнивание по sync-байту. */
function collectPcr(buffer: Buffer): number[] {
  const start = findTsAlignment(buffer)
  if (start === null) return []

  const values: number[] = []

  for (let offset = start; offset + TS_PACKET_BYTES <= buffer.length; offset += TS_PACKET_BYTES) {
    const adaptation = (buffer[offset + 3] >> 4) & 0b11
    const hasAdaptation = adaptation === 2 || adaptation === 3
    if (!hasAdaptation) continue

    const adaptationLength = buffer[offset + 4]
    if (adaptationLength === 0) continue

    const pcrPresent = (buffer[offset + 5] & 0x10) !== 0
    if (!pcrPresent) continue

    // PCR: 33 бита базы по 90 кГц и 9 бит расширения по 27 МГц
    const base =
      buffer[offset + 6] * 2 ** 25 +
      buffer[offset + 7] * 2 ** 17 +
      buffer[offset + 8] * 2 ** 9 +
      buffer[offset + 9] * 2 +
      (buffer[offset + 10] >> 7)
    const extension = ((buffer[offset + 10] & 1) << 8) | buffer[offset + 11]

    values.push(base * 300 + extension)
  }

  return values
}

/** Кусок файла начинается не с границы пакета — ищем смещение по цепочке sync-байтов. */
function findTsAlignment(buffer: Buffer): number | null {
  for (let offset = 0; offset < TS_PACKET_BYTES; offset++) {
    let aligned = true
    for (let packet = 0; packet < 5; packet++) {
      const at = offset + packet * TS_PACKET_BYTES
      if (at >= buffer.length || buffer[at] !== TS_SYNC_BYTE) {
        aligned = false
        break
      }
    }
    if (aligned) return offset
  }

  return null
}

/** Заголовок mp4-бокса: 32-битный размер, расширенный 64-битным при size === 1. */
function readBoxHeader(buffer: Buffer): { size: number; type: string } | null {
  if (buffer.length < 8) return null

  const compact = buffer.readUInt32BE(0)
  const type = buffer.toString('latin1', 4, 8)

  if (compact === 1) {
    if (buffer.length < BOX_HEADER_BYTES) return null
    const large = buffer.readBigUInt64BE(8)
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null
    return { size: Number(large), type }
  }

  return { size: compact, type }
}

async function fetchBytes(url: string, start: number, end: number) {
  const response = await fetchWithRetry(url, { headers: { Range: `bytes=${start}-${end}` } })
  const range = response.headers.get('Content-Range')
  const total = Number(range?.split('/')[1]) || 0

  return { body: Buffer.from(await response.arrayBuffer()), total }
}

/** Разбирает атом mvhd: длительность в единицах timescale. */
function readMvhdDuration(buffer: Buffer): number | null {
  const at = buffer.indexOf('mvhd')
  if (at < 0) return null

  const version = buffer[at + 4]
  const offset = at + 4

  try {
    const timescale = version === 0 ? buffer.readUInt32BE(offset + 12) : buffer.readUInt32BE(offset + 20)
    const duration = version === 0
      ? buffer.readUInt32BE(offset + 16)
      : Number(buffer.readBigUInt64BE(offset + 24))

    if (!timescale || !duration) return null
    return duration / timescale
  } catch {
    return null
  }
}
