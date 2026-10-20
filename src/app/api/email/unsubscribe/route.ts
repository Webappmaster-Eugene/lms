import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { setEmailBroadcastConsent } from '@/server/broadcasts/consent'
import { verifyUnsubscribeToken } from '@/server/broadcasts/unsubscribe-token'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 4096
const noStore = { 'Cache-Control': 'no-store' }

function pageLocation(token: string, params: Record<string, string>): string {
  return `/unsubscribe?${new URLSearchParams({ token, ...params }).toString()}`
}

async function formFields(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
  const reader = request.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  if (reader) {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError('body too large') }
      chunks.push(chunk.value)
    }
  }
  const body = Buffer.concat(chunks)
  if (type === 'multipart/form-data') {
    const form = await new Response(body, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData()
    return new URLSearchParams([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  }
  return new URLSearchParams(type === 'application/x-www-form-urlencoded' || type === '' ? body.toString('utf8') : '')
}

/**
 * Ссылка из письма открывается в браузере — GET лишь ведёт на страницу подтверждения:
 * почтовые сканеры переходят по ссылкам сами и не должны отписывать человека.
 */
export function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  return new Response(null, { status: 303, headers: { Location: pageLocation(token, {}), ...noStore } })
}

/** RFC 8058 (кнопка «Отписаться» почтового клиента) и форма страницы /unsubscribe. */
export async function POST(request: Request) {
  let fields: URLSearchParams
  try {
    fields = await formFields(request)
  } catch {
    return new Response('Слишком большой запрос', { status: 413, headers: noStore })
  }
  const token = fields.get('token') ?? new URL(request.url).searchParams.get('token') ?? ''
  const oneClick = fields.get('List-Unsubscribe') === 'One-Click'
  const resubscribe = !oneClick && fields.get('action') === 'resubscribe'
  const userId = verifyUnsubscribeToken(token)
  if (userId === null) {
    return oneClick
      ? new Response('Ссылка отписки недействительна', { status: 400, headers: noStore })
      : new Response(null, { status: 303, headers: { Location: pageLocation(token, { error: 'invalid' }), ...noStore } })
  }
  try {
    const payload = await getPayload()
    const changed = await setEmailBroadcastConsent(payload, userId, resubscribe)
    if (!changed) {
      return oneClick
        ? new Response('Ссылка отписки недействительна', { status: 400, headers: noStore })
        : new Response(null, { status: 303, headers: { Location: pageLocation(token, { error: 'invalid' }), ...noStore } })
    }
  } catch (error) {
    logger.error('Email unsubscribe failed', error, { 'user.id': userId })
    return oneClick
      ? new Response('Не удалось отписаться. Попробуйте позже', { status: 500, headers: noStore })
      : new Response(null, { status: 303, headers: { Location: pageLocation(token, { error: 'failed' }), ...noStore } })
  }
  if (oneClick) return new Response('Вы отписаны от рассылок MentorCareer', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...noStore } })
  return new Response(null, { status: 303, headers: { Location: pageLocation(token, { done: resubscribe ? 'resubscribed' : 'unsubscribed' }), ...noStore } })
}
