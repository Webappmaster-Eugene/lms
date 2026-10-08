import { notificationAuth, notificationBody, notificationFailure, notificationResponse } from '@/server/notification-api'
import { changeNotificationPreferences, notificationSettings, NotificationError } from '@/server/notification-service'
import { validTimezone } from '@/lib/notification-policy'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try { const { payload, user } = await notificationAuth(request, false); return notificationResponse(await notificationSettings(payload, user)) } catch (error) { return notificationFailure(error) }
}

export async function PATCH(request: Request) {
  try {
    const { payload, user } = await notificationAuth(request, true)
    const body = await notificationBody(request)
    const changes: { pushEnabled?: boolean; remindersEnabled?: boolean; timezone?: string; reminderHour?: number } = {}
    for (const field of ['pushEnabled', 'remindersEnabled'] as const) {
      if (body[field] === undefined) continue
      if (typeof body[field] !== 'boolean') throw new NotificationError('Некорректные настройки')
      changes[field] = body[field]
    }
    if (body.timezone !== undefined) {
      if (!validTimezone(body.timezone)) throw new NotificationError('Выберите часовой пояс')
      changes.timezone = body.timezone
    }
    if (body.reminderHour !== undefined) {
      if (typeof body.reminderHour !== 'number' || !Number.isInteger(body.reminderHour) || body.reminderHour < 8 || body.reminderHour > 21) throw new NotificationError('Время напоминания — с 08:00 до 21:00')
      changes.reminderHour = body.reminderHour
    }
    await changeNotificationPreferences(payload, user, changes)
    return notificationResponse(await notificationSettings(payload, user))
  } catch (error) { return notificationFailure(error) }
}
