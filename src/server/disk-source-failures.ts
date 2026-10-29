import 'server-only'

import type { PublicResourceRef } from '@/lib/yandex-disk-url'

/** Окно повторов плеера: проверка после обрыва приходит в пределах этого времени. */
const FAILURE_TTL_MS = 2 * 60 * 1000
const FAILURE_LIMIT = 500

// Stream и proxy собираются отдельными маршрутами, но живут в одном процессе.
const processState = globalThis as typeof globalThis & { __lmsDiskSourceFailures?: Map<string, number> }
const failures = processState.__lmsDiskSourceFailures ??= new Map<string, number>()

function resourceKey(ref: PublicResourceRef): string {
  return JSON.stringify([ref.publicKey, ref.path ?? null])
}

/**
 * Плеер проверяет файл запросом его начала. У файла, который Диск отдаёт участками, начало
 * отвечает, и без этой отметки обрыв на середине выглядел бы как сбой интернета у ученика.
 */
export function rememberSourceFailure(ref: PublicResourceRef): void {
  const now = Date.now()
  for (const [key, expiresAt] of failures) {
    if (expiresAt <= now) failures.delete(key)
  }
  while (failures.size >= FAILURE_LIMIT) {
    const oldest = failures.keys().next()
    if (oldest.done) break
    failures.delete(oldest.value)
  }
  const key = resourceKey(ref)
  // Свежая отметка уходит в конец очереди вытеснения.
  failures.delete(key)
  failures.set(key, now + FAILURE_TTL_MS)
}

export function recentSourceFailure(ref: PublicResourceRef): boolean {
  const key = resourceKey(ref)
  const expiresAt = failures.get(key)
  if (expiresAt === undefined) return false
  if (expiresAt > Date.now()) return true
  failures.delete(key)
  return false
}
