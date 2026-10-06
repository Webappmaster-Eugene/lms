import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { YandexDiskError } from '@/lib/yandex-disk'
import { resolveHref } from '@/lib/yandex-disk-href'
import { withSpan, logger } from '@/lib/telemetry'
import { LessonVideoAccessError, resolveLessonVideoSource } from '@/server/lesson-video-access'

/**
 * Яндекс.Диск запрещает встраивание своих страниц в iframe
 * (`frame-ancestors webvisor.com`), поэтому видео проигрывается нативным
 * плеером, а этот роут отдаёт браузеру временную прямую ссылку на файл.
 *
 * Ссылка живёт ограниченное время и не может храниться в контенте урока —
 * её нужно получать на каждый просмотр, поэтому редирект, а не проксирование:
 * трафик идёт напрямую с CDN Яндекса, наш сервер остаётся stateless.
 */

export async function GET(request: Request): Promise<Response> {
  return withSpan('api.yandexDisk.stream', {}, async () => {
    const payload = await getPayload({ config })

    const { user } = await payload.auth({ headers: request.headers })
    if (!user) {
      return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })
    }

    try {
      const source = await resolveLessonVideoSource(payload, user, new URL(request.url).searchParams)
      const href = source.kind === 'media' ? source.path : await resolveHref(source.ref)

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
      if (error instanceof LessonVideoAccessError) {
        return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } })
      }
      const status = error instanceof YandexDiskError ? error.statusCode : 502
      const message =
        error instanceof YandexDiskError && user.role === 'admin' ? error.message : 'Не удалось получить ссылку на видео'

      logger.error('Не удалось открыть видео урока', { 'http.status_code': status, 'error.type': error instanceof Error ? error.name : 'unknown' })

      return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } })
    }
  })
}
