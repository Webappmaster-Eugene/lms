import 'server-only'

import { getPayload } from '@/lib/payload'
import { readBoundedJson, RequestBodyError } from '@/server/read-json-body'
import { NotificationError } from '@/server/notification-service'
import { logger } from '@/lib/telemetry'

export const notificationResponse = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } })

export async function notificationAuth(request: Request, write: boolean) {
  const payload = await getPayload()
  const headers = new Headers(request.headers)
  const authorization = headers.get('authorization')
  if (authorization !== null) {
    if (!/^(?:JWT|Bearer) \S+$/.test(authorization)) throw new NotificationError('Войдите в аккаунт', 401)
    headers.delete('cookie')
  }
  const { user } = await payload.auth({ headers })
  if (!user) throw new NotificationError('Войдите в аккаунт', 401)
  if (write) {
    const origin = headers.get('origin')
    const canonical = payload.config.serverURL ? new URL(payload.config.serverURL).origin : new URL(request.url).origin
    if ((!authorization && !origin) || origin && origin !== canonical || ['cross-site', 'same-site'].includes(headers.get('sec-fetch-site') ?? '')) throw new NotificationError('Доступ запрещён', 403)
  }
  return { payload, user }
}

export async function notificationBody(request: Request): Promise<Record<string, unknown>> {
  const body = await readBoundedJson(request, 4096)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new NotificationError('Некорректные данные')
  return body as Record<string, unknown>
}

export function notificationFailure(error: unknown) {
  if (error instanceof NotificationError || error instanceof RequestBodyError) return notificationResponse({ error: error.message }, error.status)
  logger.error('Notification API failed', error)
  return notificationResponse({ error: 'Не удалось сохранить уведомления. Попробуйте позже' }, 500)
}
