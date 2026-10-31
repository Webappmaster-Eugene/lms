import { getPayload } from '@/lib/payload'
import { runNotificationJobs } from '@/server/notification-service'
import { validNotificationJobKey } from '@/server/notification-job-auth'
import { logger } from '@/lib/telemetry'
import { cleanupStudentAnalytics } from '@/server/student-analytics'
import { cleanupWebVitals } from '@/server/web-vitals'
import { runEmailBroadcastJobs } from '@/server/broadcasts/service'
import { runBootcampSchedule } from '@/server/bootcamp-schedule'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Планировщик ждёт ответа 120 с; письмам остаётся то, что не потратили уведомления.
const ROUTE_BUDGET_MS = 110_000
const BROADCAST_BUDGET_MS = 60_000

export async function POST(request: Request) {
  if (!validNotificationJobKey(request.headers.get('x-lms-job-key'))) return Response.json({ error: 'Доступ запрещён' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  const startedAt = Date.now()
  let payload: Awaited<ReturnType<typeof getPayload>>
  try {
    payload = await getPayload()
  } catch (error) {
    logger.error('Notification scheduler failed', error)
    return Response.json({ error: 'Задача уведомлений не выполнена' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }

  let result: Awaited<ReturnType<typeof runNotificationJobs>> | null = null
  try {
    result = await runNotificationJobs(payload)
    if (!result.skipped) {
      await cleanupStudentAnalytics(payload)
      await cleanupWebVitals(payload)
    }
    logger.info('Notification scheduler completed', { 'notification.reminders': result.reminders, 'notification.deliveries': result.deliveries, 'notification.skipped': result.skipped })
  } catch (error) {
    logger.error('Notification scheduler failed', error)
  }

  // Буткемп: напоминания об оплате, истечение срока, сверка с Робокассой, итоги недели. Сбой не мешает остальному.
  try {
    const bootcamp = await runBootcampSchedule(payload)
    if (bootcamp.reminders || bootcamp.expired || bootcamp.reviewAlerts || bootcamp.reconciled || bootcamp.weeklySummary) {
      logger.info('Bootcamp schedule completed', { 'bootcamp.reminders': bootcamp.reminders, 'bootcamp.expired': bootcamp.expired, 'bootcamp.review_alerts': bootcamp.reviewAlerts, 'bootcamp.reconciled': bootcamp.reconciled, 'bootcamp.weekly_summary': bootcamp.weeklySummary })
    }
  } catch (error) {
    logger.error('Bootcamp schedule failed', error)
  }

  // Рассылки идут и при сбое напоминаний: у них своя аренда и свои письма, а сбой
  // одной задачи не должен останавливать другую — ни в одну, ни в другую сторону.
  let emails: Awaited<ReturnType<typeof runEmailBroadcastJobs>> | { error: string }
  try {
    emails = await runEmailBroadcastJobs(payload, { deadline: Math.min(Date.now() + BROADCAST_BUDGET_MS, startedAt + ROUTE_BUDGET_MS) })
    if (!emails.skipped && (emails.sent || emails.failed || emails.retried || emails.skippedRecipients || emails.completed)) {
      logger.info('Email broadcast job completed', { 'email.sent': emails.sent, 'email.failed': emails.failed, 'email.retried': emails.retried, 'email.skipped': emails.skippedRecipients, 'email.broadcasts_completed': emails.completed })
    }
  } catch (error) {
    logger.error('Email broadcast job failed', error)
    emails = { error: 'Задача рассылок не выполнена' }
  }

  if (!result) return Response.json({ error: 'Задача уведомлений не выполнена', emails }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  return Response.json({ ...result, emails }, { headers: { 'Cache-Control': 'no-store' } })
}
