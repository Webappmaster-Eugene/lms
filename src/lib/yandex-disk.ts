/**
 * Яндекс.Диск API клиент для работы с публичными папками.
 * Используется для автоматического импорта курсов из видео-файлов.
 */

const YD_API_BASE = 'https://cloud-api.yandex.net/v1/disk/public/resources'
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
