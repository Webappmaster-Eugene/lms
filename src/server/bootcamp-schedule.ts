import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { formatRubles, paymentPath, PAYMENT_REMINDER_BEFORE_DAYS, REVIEW_ALERT_AFTER_DAYS } from '@/lib/bootcamp-admission'
import { formatEntryTaskDate } from '@/lib/bootcamp-entry-task'
import { BOOTCAMP_PROGRAMS } from '@/lib/bootcamp-leads'
import { sendWeeklySummary } from '@/server/bootcamp-funnel'
import { logger } from '@/lib/telemetry'
import { bootcampPaymentReminderEmail, emailBaseUrl } from '@/payload/emails/templates'
import { journal, leadAdminLink, rowsOf } from '@/server/bootcamp-lead-events'
import { applyPaid } from '@/server/bootcamp-payment'
import { contactReplyTo } from '@/server/contact-reply-to'
import { fetchOperationState, robokassaConfig } from '@/server/robokassa'

/**
 * Периодические задачи буткемпа: их зовёт тот же планировщик, что и уведомления
 * (/api/internal/notifications/run, раз в минуту). Каждая отметка ставится условным
 * UPDATE до действия, поэтому повтор запуска не шлёт второе письмо.
 */

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = (payload: Payload) => (payload.db as unknown as { drizzle: Db }).drizzle

// Сверяем счета, которые не оплачены за 15 минут, но не старше трёх дней; один счёт - не чаще раза в 30 минут.
const RECONCILE_AFTER_MIN = 15
const RECONCILE_WINDOW_DAYS = 3
const RECONCILE_EVERY_MIN = 30
const RECONCILE_BATCH = 20

let running = false

export type BootcampScheduleResult = { reminders: number, expired: number, reviewAlerts: number, reconciled: number, weeklySummary: boolean }

export async function runBootcampSchedule(payload: Payload): Promise<BootcampScheduleResult> {
  const result: BootcampScheduleResult = { reminders: 0, expired: 0, reviewAlerts: 0, reconciled: 0, weeklySummary: false }
  if (running) return result
  running = true
  try {
    result.reminders = await paymentReminders(payload)
    result.expired = await paymentExpiry(payload)
    result.reviewAlerts = await reviewAlerts(payload)
    result.reconciled = await reconcile(payload)
    result.weeklySummary = await sendWeeklySummary(payload)
  } finally {
    running = false
  }
  return result
}

async function paymentReminders(payload: Payload): Promise<number> {
  const due = rowsOf<{ id: number, email: string, name: string | null, program: string, payment_token: string, payment_due_at: string, payment_amount_kopecks: string | number }>(await db(payload).execute(sql`
    update bootcamp_leads set payment_reminder_sent_at = now(), updated_at = now()
    where status = 'admitted' and paid_at is null and payment_reminder_sent_at is null
      and payment_link_sent_at < payment_due_at - make_interval(days => ${PAYMENT_REMINDER_BEFORE_DAYS})
      and payment_due_at > now() and payment_due_at <= now() + make_interval(days => ${PAYMENT_REMINDER_BEFORE_DAYS})
    returning id, email, name, program, payment_token, payment_due_at, payment_amount_kopecks`))
  const replyTo = due.length > 0 ? await contactReplyTo(payload) : null
  for (const lead of due) {
    const dueDate = formatEntryTaskDate(lead.payment_due_at)
    try {
      const content = bootcampPaymentReminderEmail({
        name: lead.name,
        program: BOOTCAMP_PROGRAMS.find((item) => item.value === lead.program)?.short ?? lead.program,
        amount: formatRubles(Number(lead.payment_amount_kopecks)),
        dueDate,
        url: `${emailBaseUrl()}${paymentPath(lead.payment_token)}`,
        replyable: Boolean(replyTo),
      })
      await payload.sendEmail({ to: lead.email, ...content, ...(replyTo ? { replyTo } : {}) })
      await journal(payload, { lead: lead.id, type: 'payment_reminder', message: `Напоминание об оплате до ${dueDate} ушло` })
    } catch (error) {
      logger.error('Bootcamp payment reminder failed', error, { 'lead.id': lead.id })
      await journal(payload, { lead: lead.id, type: 'payment_alert', message: 'Напоминание об оплате не ушло', telegram: { title: `Напоминание об оплате не ушло: ${lead.email}`, lines: ['Подробности в журнале приложения.'], link: leadAdminLink(lead.id) } })
    }
  }
  return due.length
}

async function paymentExpiry(payload: Payload): Promise<number> {
  const expired = rowsOf<{ id: number, email: string, payment_due_at: string }>(await db(payload).execute(sql`
    update bootcamp_leads set payment_expired_notice_at = now(), updated_at = now()
    where status = 'admitted' and paid_at is null and payment_expired_notice_at is null and payment_due_at < now()
    returning id, email, payment_due_at`))
  for (const lead of expired) {
    await journal(payload, {
      lead: lead.id, type: 'payment_expired', message: `Срок оплаты истёк ${formatEntryTaskDate(lead.payment_due_at)}`,
      telegram: { title: `Срок оплаты истёк: ${lead.email}`, lines: ['Отправьте ссылку ещё раз с новым сроком или отмените допуск.'], link: leadAdminLink(lead.id) },
    })
  }
  return expired.length
}

async function reviewAlerts(payload: Payload): Promise<number> {
  const waiting = rowsOf<{ id: number, email: string, entry_submitted_at: string }>(await db(payload).execute(sql`
    update bootcamp_leads set review_alert_at = now(), updated_at = now()
    where status in ('new', 'contacted', 'diagnostic') and review_alert_at is null
      and entry_submitted_at < now() - make_interval(days => ${REVIEW_ALERT_AFTER_DAYS})
    returning id, email, entry_submitted_at`))
  for (const lead of waiting) {
    await journal(payload, {
      lead: lead.id, type: 'review_overdue', message: `Решение ждёт ответа с ${formatEntryTaskDate(lead.entry_submitted_at)}`,
      telegram: { title: `Решение ждёт ответа ${REVIEW_ALERT_AFTER_DAYS} дня: ${lead.email}`, lines: ['Кандидату обещан ответ за 5 дней: допустите, отправьте на подготовку или откажите.'], link: leadAdminLink(lead.id) },
    })
  }
  return waiting.length
}

/**
 * Уведомление Робокассы могло потеряться: висящие счета сверяем через OpStateExt. Для
 * тестовых платежей метод не работает (документация Робокассы), их не трогаем. Отменённые
 * у нас счета тоже сверяем: ссылка Робокассы на них живёт до своего срока.
 */
async function reconcile(payload: Payload): Promise<number> {
  const config = robokassaConfig()
  if (!config || config.isTest) return 0
  const pending = rowsOf<{ id: number, amount_kopecks: string | number }>(await db(payload).execute(sql`
    update bootcamp_payments set checked_at = now(), updated_at = now()
    where id in (
      select id from bootcamp_payments
      where method = 'robokassa' and coalesce(is_test, false) = false and (
        (status in ('pending', 'cancelled') and processed_at is null and created_at < now() - make_interval(mins => ${RECONCILE_AFTER_MIN}) and created_at > now() - make_interval(days => ${RECONCILE_WINDOW_DAYS}))
        or (status = 'paid' and op_key is null and checked_at is null)
      ) and (checked_at is null or checked_at < now() - make_interval(mins => ${RECONCILE_EVERY_MIN}))
      order by id limit ${RECONCILE_BATCH}
    )
    returning id, amount_kopecks`))
  let paid = 0
  for (const { id, amount_kopecks: invoiceKopecks } of pending) {
    try {
      const state = await fetchOperationState(config, id)
      if (state.opKey) await db(payload).execute(sql`update bootcamp_payments set op_key = coalesce(op_key, ${state.opKey}) where id = ${id}`)
      if (state.state === 'paid') {
        // Сумму счёта задаёт наша подпись в ссылке; в Info/OutSum Робокасса может вернуть сумму за вычетом комиссии.
        const { outcome } = await applyPaid(payload, id, { amountKopecks: Number(invoiceKopecks), incCurrLabel: state.incCurrLabel, opKey: state.opKey, source: 'reconcile' })
        if (outcome === 'paid') paid += 1
        else if (outcome !== 'already') logger.warn('Robokassa reconciliation found a payment that did not move the lead', { 'robokassa.inv_id': id, 'robokassa.outcome': outcome })
      } else if (state.state === 'cancelled') {
        await db(payload).execute(sql`update bootcamp_payments set status = 'cancelled', updated_at = now() where id = ${id} and status = 'pending'`)
      }
    } catch (error) {
      logger.warn('Robokassa reconciliation failed', { 'robokassa.inv_id': id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return paid
}
