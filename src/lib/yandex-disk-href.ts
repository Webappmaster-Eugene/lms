import { fetchPublicDownloadHref, type PublicResourceRef } from '@/lib/yandex-disk'

/**
 * Кеш временных прямых ссылок Яндекс.Диска.
 *
 * Ссылка живёт ограниченное время и не может лежать в контенте урока — её
 * приходится запрашивать на каждый просмотр. Кеш в памяти инстанса срезает
 * лишние обращения к API, когда плеер докачивает файл кусками.
 */

/** Прямые ссылки Яндекса живут заметно дольше, но перевыпускаем их чаще — с запасом. */
const HREF_TTL_MS = 5 * 60 * 1000
const CACHE_LIMIT = 500

type CacheEntry = { href: string; expiresAt: number }

const hrefCache = new Map<string, CacheEntry>()

export async function resolveHref(ref: PublicResourceRef): Promise<string> {
  const key = `${ref.publicKey}${ref.path ?? ''}`
  const now = Date.now()
  const cached = hrefCache.get(key)

  if (cached && cached.expiresAt > now) {
    return cached.href
  }

  const href = await fetchPublicDownloadHref(ref, {
    token: process.env.YANDEX_DISK_TOKEN || undefined,
  })

  evictExpired(now)
  hrefCache.set(key, { href, expiresAt: now + HREF_TTL_MS })

  return href
}

/** Кеш живёт в памяти инстанса: чистим протухшее и держим размер ограниченным. */
function evictExpired(now: number): void {
  for (const [key, entry] of hrefCache) {
    if (entry.expiresAt <= now) hrefCache.delete(key)
  }

  while (hrefCache.size >= CACHE_LIMIT) {
    const oldest = hrefCache.keys().next()
    if (oldest.done) break
    hrefCache.delete(oldest.value)
  }
}
