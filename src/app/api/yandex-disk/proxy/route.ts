import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { YandexDiskError } from '@/lib/yandex-disk'
import { resolveHref } from '@/lib/yandex-disk-href'
import { withSpan, logger } from '@/lib/telemetry'
import { LessonVideoAccessError, resolveLessonVideoSource } from '@/server/lesson-video-access'

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

    try {
      const source = await resolveLessonVideoSource(payload, user, new URL(request.url).searchParams)
      if (source.kind !== 'yandex') {
        return NextResponse.json({ error: 'Видео медиатеки использует нативный плеер' }, { status: 400 })
      }
      const { ref } = source
      const href = await resolveHref(ref)
      const range = request.headers.get('range')

      const upstream = await fetch(href, {
        headers: range ? { Range: range } : {},
        cache: 'no-store',
        signal: request.signal,
      })

      if (upstream.status === 416) {
        const headers = new Headers({ 'Cache-Control': 'private, no-store' })
        const contentRange = upstream.headers.get('content-range')
        if (contentRange) headers.set('Content-Range', contentRange)
        await upstream.body?.cancel()
        return new Response(null, { status: 416, headers })
      }

      if (!upstream.ok && upstream.status !== 206) {
        logger.warn('YD proxy: источник ответил не 2xx', {
          'yd.path': ref.path ?? '',
          'http.status_code': upstream.status,
        })
        await upstream.body?.cancel()
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
      headers.set('Content-Disposition', 'inline')
      headers.set('X-Content-Type-Options', 'nosniff')

      return new Response(upstream.body, { status: upstream.status, headers })
    } catch (error) {
      if (error instanceof LessonVideoAccessError) {
        return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } })
      }
      const status = error instanceof YandexDiskError ? error.statusCode : 502
      const message =
        error instanceof YandexDiskError && user.role === 'admin' ? error.message : 'Не удалось получить файл'

      logger.error('Не удалось получить поток видео урока', { 'http.status_code': status, 'error.type': error instanceof Error ? error.name : 'unknown' })

      return NextResponse.json({ error: message }, { status: status === 404 ? 404 : 502, headers: { 'Cache-Control': 'private, no-store' } })
    }
  })
}

/** mpegts.js не смотрит на тип, но честный заголовок помогает отладке и кешам. */
function contentTypeFor(path: string | null | undefined): string {
  if (path && /\.ts$/i.test(path)) return 'video/mp2t'
  return 'application/octet-stream'
}
