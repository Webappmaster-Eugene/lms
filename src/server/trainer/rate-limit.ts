import 'server-only'

/**
 * Ограничитель частоты запросов для маршрутов тренажёра.
 *
 * Каждый прогон стоит процессорного времени в отдельном процессе, поэтому
 * отправки и компиляции ограничены по пользователю.
 *
 * Состояние живёт в globalThis: модули в dev перезагружаются при каждом
 * изменении файла, и обычная переменная модуля обнуляла бы счётчики.
 */

type Bucket = { count: number; resetAt: number }

export type RateLimiter = {
  /** Занимает слот. `false` означает, что лимит исчерпан. */
  take: (key: string) => boolean
}

/** Раз в сколько взятий слота подчищать истёкшие записи. */
const CLEANUP_EVERY = 200

export function createRateLimiter(name: string, max: number, windowMs: number): RateLimiter {
  const storeKey = Symbol.for(`lms.trainer.rateLimit.${name}`)
  const holder = globalThis as unknown as Record<symbol, Map<string, Bucket> | undefined>

  function store(): Map<string, Bucket> {
    let map = holder[storeKey]
    if (!map) {
      map = new Map<string, Bucket>()
      holder[storeKey] = map
    }
    return map
  }

  let sinceCleanup = 0

  return {
    take(key: string): boolean {
      const buckets = store()
      const now = Date.now()

      // Без периодической уборки карта росла бы на каждого пользователя,
      // который хоть раз что-то отправил, и никогда не уменьшалась.
      if (++sinceCleanup >= CLEANUP_EVERY) {
        sinceCleanup = 0
        for (const [bucketKey, bucket] of buckets) {
          if (bucket.resetAt <= now) buckets.delete(bucketKey)
        }
      }

      const bucket = buckets.get(key)

      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs })
        return true
      }

      if (bucket.count >= max) return false

      bucket.count += 1
      return true
    },
  }
}
