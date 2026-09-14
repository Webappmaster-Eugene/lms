import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { parsePublicResourceUrl, YandexDiskError } from '@/lib/yandex-disk'
import { resolveHref } from '@/lib/yandex-disk-href'
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
