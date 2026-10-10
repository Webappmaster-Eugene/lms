import 'server-only'

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
type PendingHref = { controller: AbortController; promise: Promise<string>; subscribers: number; settled: boolean }

// Stream and proxy are separately bundled Next routes, but share one process.
const processState = globalThis as typeof globalThis & {
  __lmsYandexDiskHrefs?: { hrefCache: Map<string, CacheEntry>; pendingHrefs: Map<string, PendingHref> }
}
const { hrefCache, pendingHrefs } = processState.__lmsYandexDiskHrefs ??= {
  hrefCache: new Map<string, CacheEntry>(), pendingHrefs: new Map<string, PendingHref>(),
}

function resourceKey(ref: PublicResourceRef): string {
  return JSON.stringify([ref.publicKey, ref.path ?? null])
}

/** An older failed stream must not evict a newer link fetched by another stream. */
export function invalidateHref(ref: PublicResourceRef, rejectedHref: string): void {
  const key = resourceKey(ref)
  if (hrefCache.get(key)?.href === rejectedHref) hrefCache.delete(key)
}

export async function resolveHref(ref: PublicResourceRef, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const key = resourceKey(ref)
  const now = Date.now()
  const cached = hrefCache.get(key)

  if (cached && cached.expiresAt > now) {
    return cached.href
  }

  let pending = pendingHrefs.get(key)
  if (!pending) {
    const controller = new AbortController()
    const promise = fetchPublicDownloadHref(ref, {
      token: process.env.YANDEX_DISK_TOKEN || undefined,
      signal: controller.signal,
    }).then((href) => {
      controller.signal.throwIfAborted()
      const completedAt = Date.now()
      evictExpired(completedAt)
      hrefCache.set(key, { href, expiresAt: completedAt + HREF_TTL_MS })
      return href
    }).finally(() => {
      entry.settled = true
      if (pendingHrefs.get(key) === entry) pendingHrefs.delete(key)
    })
    const entry: PendingHref = { controller, promise, subscribers: 0, settled: false }
    pendingHrefs.set(key, entry)
    pending = entry
  }

  const entry = pending
  entry.subscribers++
  let onAbort: (() => void) | undefined
  try {
    if (!signal) return await entry.promise
    return await new Promise<string>((resolve, reject) => {
      onAbort = () => reject(signal.reason ?? new DOMException('Request aborted', 'AbortError'))
      signal.addEventListener('abort', onAbort, { once: true })
      entry.promise.then(resolve, reject)
      if (signal.aborted) onAbort()
    })
  } finally {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort)
    entry.subscribers--
    // Cancelling metadata must not cancel another viewer's concurrent Range request.
    if (!entry.settled && entry.subscribers === 0) {
      if (pendingHrefs.get(key) === entry) pendingHrefs.delete(key)
      entry.controller.abort()
    }
  }
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
