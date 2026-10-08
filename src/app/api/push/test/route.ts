import { notificationAuth, notificationFailure, notificationResponse } from '@/server/notification-api'
import { queuePushTest } from '@/server/notification-service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { payload, user } = await notificationAuth(request, true)
    await queuePushTest(payload, user)
    return notificationResponse({ queued: true })
  } catch (error) { return notificationFailure(error) }
}
