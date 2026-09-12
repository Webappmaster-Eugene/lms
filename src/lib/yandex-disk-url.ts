/**
 * Разбор публичных ссылок Яндекс.Диска.
 *
 * Вынесен отдельно от API-клиента: этим кодом пользуется и серверный импорт,
 * и клиентский плеер, которому незачем тянуть в бандл fetch-логику.
 */

const PUBLIC_HOSTS = new Set([
  'disk.yandex.ru',
  'disk.yandex.com',
  'disk.yandex.by',
  'disk.yandex.kz',
  'disk.360.yandex.ru',
  'yadi.sk',
])

export type PublicResourceRef = {
  /** Публичный ключ ресурса — ссылка на корень публикации (папку или файл). */
  publicKey: string
  /** Путь внутри публичной папки; null, если ссылка ведёт на сам опубликованный ресурс. */
  path: string | null
}

/**
 * Разбирает публичную ссылку на ключ публикации и путь внутри неё.
 *
 * Ссылка на файл внутри опубликованной папки выглядит как
 * `https://disk.yandex.ru/d/<key>/<путь>` — API принимает только сам ключ,
 * а путь передаётся отдельным параметром.
 */
export function parsePublicResourceUrl(rawUrl: string): PublicResourceRef | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!PUBLIC_HOSTS.has(url.hostname)) return null

  const [kind, key, ...rest] = url.pathname.split('/').filter(Boolean)
  if ((kind !== 'd' && kind !== 'i') || !key) return null

  let segments: string[]
  try {
    segments = rest.map(decodeURIComponent)
  } catch {
    return null
  }

  return {
    publicKey: `${url.origin}/${kind}/${key}`,
    path: segments.length > 0 ? `/${segments.join('/')}` : null,
  }
}

/** Собирает публичную ссылку на файл внутри опубликованной папки. */
export function buildPublicFileUrl(folderPublicUrl: string, filePath: string): string | null {
  const ref = parsePublicResourceUrl(folderPublicUrl)
  if (!ref) return null

  const segments = filePath.split('/').filter(Boolean).map(encodeURIComponent)
  return segments.length > 0 ? `${ref.publicKey}/${segments.join('/')}` : ref.publicKey
}
