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
/** mvhd лежит первым ребёнком moov, так что начала бокса достаточно. */
const MOOV_PROBE_BYTES = 4096
/** Страховка от зацикливания на битом контейнере. */
const MAX_BOX_WALK = 24

/**
 * Длительность видео в секундах.
 *
 * API Диска её не отдаёт, поэтому читаем сам контейнер. Идём по таблице
 * верхнеуровневых боксов (ftyp → mdat → moov …) и прыгаем прямо к moov:
 * слепое чтение начала и хвоста промахивается на длинных записях, где moov
 * весит десятки мегабайт и лежит за пределами окна. Если обход не удался
 * (нестандартный контейнер, сервер игнорирует Range) — пробуем по-старому.
 * Не удалось разобрать — возвращаем null: показать урок без длительности
 * лучше, чем уронить импорт.
 */
export async function fetchVideoDuration(
  ref: PublicResourceRef,
  options: { token?: string } = {},
): Promise<number | null> {
  try {
    const href = await fetchPublicDownloadHref(ref, options)

    const walked = await readDurationByBoxWalk(href)
    if (walked !== null) return walked

    return await readDurationByScan(href)
  } catch {
    return null
  }
}

/** Прыжок к moov по таблице боксов: несколько коротких запросов вместо мегабайтов. */
async function readDurationByBoxWalk(href: string): Promise<number | null> {
  const first = await fetchBytes(href, 0, BOX_HEADER_BYTES - 1)
  const total = first.total
  if (!total) return null

  let offset = 0
  let header = first.body

  for (let step = 0; step < MAX_BOX_WALK && offset + BOX_HEADER_BYTES <= total; step++) {
    if (step > 0) {
      header = (await fetchBytes(href, offset, offset + BOX_HEADER_BYTES - 1)).body
    }

    const box = readBoxHeader(header)
    if (!box) return null

    if (box.type === 'moov') {
      const end = Math.min(offset + MOOV_PROBE_BYTES, total) - 1
      const moov = await fetchBytes(href, offset, end)
      return readMvhdDuration(moov.body)
    }

    // size 0 — бокс тянется до конца файла, дальше идти некуда
    if (box.size < BOX_HEADER_BYTES) return null
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
