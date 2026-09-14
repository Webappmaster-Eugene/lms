import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { parsePublicResourceUrl, YandexDiskError } from '@/lib/yandex-disk'
import { resolveHref } from '@/lib/yandex-disk-href'
import { withSpan, logger } from '@/lib/telemetry'

/**
 * Отдаёт байты файла Диска через наш домен.
 *
 * Обычные видео браузер тянет прямо с CDN Яндекса — этим занимается роут
 * `stream` с редиректом, и трафик мимо нас. Но записи в контейнере MPEG-TS
 * браузер нативно не проигрывает: их разбирает mpegts.js через MediaSource,
 * а он читает файл запросами из JS. Временная ссылка Диска для этого не
 * годится: она живёт минуты и на запрос из браузера отвечает HTML. Поэтому
 * такие файлы (и только они) идут через прокси — с пробросом Range, чтобы
 * работала перемотка и докачка кусками.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Заголовки, которые нужно донести до плеера без изменений. */
const PASSTHROUGH_HEADERS = ['content-length', 'content-range', 'accept-ranges', 'last-modified']

export async function GET(request: Request): Promise<Response> {
  return withSpan('api.yandexDisk.proxy', {}, async () => {
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
      const range = request.headers.get('range')

      const upstream = await fetch(href, {
        headers: range ? { Range: range } : {},
        cache: 'no-store',
      })

      if (!upstream.ok && upstream.status !== 206) {
        logger.warn('YD proxy: источник ответил не 2xx', {
          'yd.path': ref.path ?? '',
          'http.status_code': upstream.status,
        })
        return NextResponse.json({ error: 'Источник недоступен' }, { status: 502 })
      }

      const headers = new Headers()
      for (const name of PASSTHROUGH_HEADERS) {
        const value = upstream.headers.get(name)
        if (value) headers.set(name, value)
      }

      headers.set('Content-Type', contentTypeFor(ref.path))
      // Ссылка персональная и временная: ни браузерного, ни общего кеша.
      headers.set('Cache-Control', 'private, no-store')
      headers.set('Accept-Ranges', headers.get('accept-ranges') ?? 'bytes')

      return new Response(upstream.body, { status: upstream.status, headers })
    } catch (error) {
      const status = error instanceof YandexDiskError ? error.statusCode : 502
      const message =
        error instanceof YandexDiskError ? error.message : 'Не удалось получить файл'

      logger.error(`YD proxy failed для ${ref.publicKey}${ref.path ?? ''}: ${message}`)

      return NextResponse.json({ error: message }, { status: status === 404 ? 404 : 502 })
    }
  })
}

/** mpegts.js не смотрит на тип, но честный заголовок помогает отладке и кешам. */
function contentTypeFor(path: string | null | undefined): string {
  if (path && /\.ts$/i.test(path)) return 'video/mp2t'
  return 'application/octet-stream'
}
