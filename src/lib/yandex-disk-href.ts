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
/** Замер 28.10.2026: адрес узла принимал любые Range не меньше 6,5 минуты после редиректа. */
const STORAGE_TTL_MS = 5 * 60 * 1000
const CACHE_LIMIT = 500

type CacheEntry = { href: string; expiresAt: number }
type StorageEntry = { url: string; href: string; expiresAt: number }
type PendingHref = { controller: AbortController; promise: Promise<string>; subscribers: number; settled: boolean }

// Stream and proxy are separately bundled Next routes, but share one process.
const processState = globalThis as typeof globalThis & {
  __lmsYandexDiskHrefs?: { hrefCache: Map<string, CacheEntry>; pendingHrefs: Map<string, PendingHref>; storageCache?: Map<string, StorageEntry> }
}
const state = processState.__lmsYandexDiskHrefs ??= {
  hrefCache: new Map<string, CacheEntry>(), pendingHrefs: new Map<string, PendingHref>(),
}
const { hrefCache, pendingHrefs } = state
// Состояние, созданное прежней сборкой в том же процессе, этой карты ещё не знает.
const storageCache = state.storageCache ??= new Map<string, StorageEntry>()

function resourceKey(ref: PublicResourceRef): string {
  return JSON.stringify([ref.publicKey, ref.path ?? null])
}

/** An older failed stream must not evict a newer link fetched by another stream. */
export function invalidateHref(ref: PublicResourceRef, rejectedHref: string): void {
  const key = resourceKey(ref)
  if (hrefCache.get(key)?.href === rejectedHref) hrefCache.delete(key)
  if (storageCache.get(key)?.href === rejectedHref) storageCache.delete(key)
}

/**
 * Узел хранилища, куда ведёт ссылка.
 *
 * Редирект downloader по ссылке занимает от 0,7 до 15 секунд, а узел после него отвечает за
 * доли секунды на любой Range. Плеер докачивает файл десятками Range, и без этого адреса
 * каждый из них заново ждёт редирект.
 */
export function cachedStorage(ref: PublicResourceRef): string | null {
  const key = resourceKey(ref)
  const entry = storageCache.get(key)
  if (!entry) return null
  if (entry.expiresAt > Date.now()) return entry.url
  storageCache.delete(key)
  return null
}

export function rememberStorage(ref: PublicResourceRef, href: string, url: string): void {
  const now = Date.now()
  evictExpired(storageCache, now)
  storageCache.set(resourceKey(ref), { url, href, expiresAt: now + STORAGE_TTL_MS })
}

/** Как и у ссылки: отказ старого узла не стирает адрес, который уже получил соседний поток. */
export function forgetStorage(ref: PublicResourceRef, rejectedUrl: string): void {
  const key = resourceKey(ref)
  if (storageCache.get(key)?.url === rejectedUrl) storageCache.delete(key)
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
      evictExpired(hrefCache, completedAt)
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
function evictExpired(cache: Map<string, { expiresAt: number }>, now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key)
  }

  while (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}
