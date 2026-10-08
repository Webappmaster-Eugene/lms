import { notificationAuth, notificationBody, notificationFailure, notificationResponse } from '@/server/notification-api'
import { NotificationError, registerPush, unregisterPush } from '@/server/notification-service'
import { pushEndpoint } from '@/lib/notification-policy'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { payload, user } = await notificationAuth(request, true)
    const body = await notificationBody(request)
    const endpoint = pushEndpoint(body.endpoint)
    const keys = body.keys && typeof body.keys === 'object' ? body.keys as Record<string, unknown> : null
    if (!endpoint || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || !/^[A-Za-z0-9_-]{87,88}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{22,24}$/.test(keys.auth) || Buffer.from(keys.p256dh, 'base64url').length !== 65 || Buffer.from(keys.auth, 'base64url').length !== 16) throw new NotificationError('Некорректная подписка устройства')
    const sid = '_sid' in user && typeof user._sid === 'string' ? user._sid : null
    if (!sid) throw new NotificationError('Обновите вход в аккаунт', 401)
    await registerPush(payload, user, { endpoint: endpoint.href, keys: { p256dh: keys.p256dh, auth: keys.auth } }, sid)
    return notificationResponse({ subscribed: true })
  } catch (error) { return notificationFailure(error) }
}

export async function DELETE(request: Request) {
  try {
    const { payload, user } = await notificationAuth(request, true)
    const body = await notificationBody(request)
    const endpoint = pushEndpoint(body.endpoint)
    if (!endpoint) throw new NotificationError('Некорректная подписка устройства')
    await unregisterPush(payload, user, endpoint.href)
    return notificationResponse({ subscribed: false })
  } catch (error) { return notificationFailure(error) }
}
