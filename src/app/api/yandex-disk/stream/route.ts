import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  fetchPublicDownloadHref,
  parsePublicResourceUrl,
  YandexDiskError,
  type PublicResourceRef,
} from '@/lib/yandex-disk'
import { withSpan, logger } from '@/lib/telemetry'

/**
 * Яндекс.Диск запрещает встраивание своих страниц в iframe
 * (`frame-ancestors webvisor.com`), поэтому видео проигрывается нативным
 * плеером, а этот роут отдаёт браузеру временную прямую ссылку на файл.
 *
 * Ссылка живёт ограниченное время и не может храниться в контенте урока —
 * её нужно получать на каждый просмотр, поэтому редирект, а не проксирование:
 * трафик идёт напрямую с CDN Яндекса, наш сервер остаётся stateless.
 */

/** Прямые ссылки Яндекса живут заметно дольше, но перевыпускаем их чаще — с запасом. */
const HREF_TTL_MS = 5 * 60 * 1000
const CACHE_LIMIT = 500

type CacheEntry = { href: string; expiresAt: number }

const hrefCache = new Map<string, CacheEntry>()

export async function GET(request: Request): Promise<Response> {
  return withSpan('api.yandexDisk.stream', {}, async () => {
    const payload = await getPayload({ config })

    const { user } = await payload.auth({ headers: request.headers })
    if (!user) {
      return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })
    }

    const rawUrl = new URL(request.url).searchParams.get('url')
    if (!rawUrl) {
      return NextResponse.json({ error: 'Обязательный параметр: url' }, { status: 400 })
    }

    const ref = parsePublicResourceUrl(rawUrl)
    if (!ref) {
      return NextResponse.json(
        { error: 'Ссылка не похожа на публичный ресурс Яндекс.Диска' },
        { status: 400 },
      )
    }

    try {
      const href = await resolveHref(ref)

      return new NextResponse(null, {
        status: 302,
        headers: {
          Location: href,
          // Временную ссылку нельзя класть ни в кеш браузера, ни в общий кеш.
          'Cache-Control': 'private, no-store',
          // CDN Яндекса отвечает 403 на запрос с чужим Referer; политика редиректа
          // снимает заголовок у запроса, который браузер отправит по Location.
          'Referrer-Policy': 'no-referrer',
        },
      })
    } catch (error) {
      const status = error instanceof YandexDiskError ? error.statusCode : 502
      const message =
        error instanceof YandexDiskError ? error.message : 'Не удалось получить ссылку на видео'

      logger.error(`YD stream failed для ${ref.publicKey}${ref.path ?? ''}: ${message}`)

      return NextResponse.json({ error: message }, { status: status === 404 ? 404 : status })
    }
  })
}

async function resolveHref(ref: PublicResourceRef): Promise<string> {
  const key = `${ref.publicKey}${ref.path ?? ''}`
  const now = Date.now()
  const cached = hrefCache.get(key)

  if (cached && cached.expiresAt > now) {
    return cached.href
  }

  const href = await fetchPublicDownloadHref(ref, { token: process.env.YANDEX_DISK_TOKEN || undefined })

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
