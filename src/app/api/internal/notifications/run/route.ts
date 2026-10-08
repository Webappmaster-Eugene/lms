import { getPayload } from '@/lib/payload'
import { runNotificationJobs } from '@/server/notification-service'
import { validNotificationJobKey } from '@/server/notification-job-auth'
import { logger } from '@/lib/telemetry'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  if (!validNotificationJobKey(request.headers.get('x-lms-job-key'))) return Response.json({ error: 'Доступ запрещён' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  try {
    const result = await runNotificationJobs(await getPayload())
    logger.info('Notification scheduler completed', { 'notification.reminders': result.reminders, 'notification.deliveries': result.deliveries, 'notification.skipped': result.skipped })
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    logger.error('Notification scheduler failed', error)
    return Response.json({ error: 'Задача уведомлений не выполнена' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
