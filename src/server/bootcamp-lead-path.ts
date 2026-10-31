import 'server-only'

import { randomBytes } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import {
  CLOSED_STAGES,
  DECISION_STAGES,
  formatRubles,
  leadEventLabel,
  OFFER_URL,
  paymentDueAt,
  paymentPath,
  BOOTCAMP_PRICE_KOPECKS,
  PAYMENT_DUE_DAYS,
  type AdmissionInput,
} from '@/lib/bootcamp-admission'
import { BOOTCAMP_MANUALS_COURSE_SLUG, EnrollmentInputError, type EnrollmentInput } from '@/lib/bootcamp-enrollment'
import { formatEntryTaskDate } from '@/lib/bootcamp-entry-task'
import { BOOTCAMP_PROGRAMS, leadStatusLabel } from '@/lib/bootcamp-leads'
import { logger } from '@/lib/telemetry'
import { bootcampAdmittedEmail, bootcampDecisionEmail, emailBaseUrl } from '@/payload/emails/templates'
import { leadEnrollmentState, startEnrollment, type EnrollmentView } from '@/server/bootcamp-enrollment'
import { sendEntryTask } from '@/server/bootcamp-entry-task'
import { actorName, inTransaction, journal, leadAdminLink, recordLeadEvent, rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { contactReplyTo } from '@/server/contact-reply-to'
import { robokassaConfig } from '@/server/robokassa'
import type { BootcampLead, User } from '@/payload-types'

/**
 * Путь заявки в CMS (решение владельца 31.10.2026): каждый переход этапа - кнопка или событие
 * системы. Переход - условный UPDATE в транзакции вместе с событием журнала, поэтому двойной
 * клик или две вкладки не проведут заявку дважды. Письма уходят после фиксации.
 */

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = (payload: Payload) => (payload.db as unknown as { drizzle: Db }).drizzle

export type AdmissionDraft = { enrollment: EnrollmentInput, comment: string | null }

export function readAdmissionDraft(value: unknown): AdmissionDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { enrollment, comment } = value as Record<string, unknown>
  if (!enrollment || typeof enrollment !== 'object') return null
  const input = enrollment as Record<string, unknown>
  const text = (key: string) => typeof input[key] === 'string' ? input[key] as string : ''
  if (!text('firstName') || !text('lastName') || !text('username') || !text('group')) return null
  return {
    enrollment: { firstName: text('firstName'), lastName: text('lastName'), username: text('username'), group: text('group'), accessUntil: text('accessUntil') || null },
    comment: typeof comment === 'string' && comment ? comment : null,
  }
}

const program = (lead: BootcampLead) => BOOTCAMP_PROGRAMS.find((item) => item.value === lead.program)?.short ?? lead.program
const paymentUrl = (token: string) => `${emailBaseUrl()}${paymentPath(token)}`

async function findLead(payload: Payload, id: number): Promise<BootcampLead> {
  const lead = await payload.findByID({ collection: 'bootcamp-leads', id, depth: 0, overrideAccess: true, disableErrors: true })
  if (!lead) throw new EnrollmentInputError('Заявка не найдена', 404)
  return lead
}

function requireStage(lead: BootcampLead, allowed: readonly string[], action: string): void {
  if (!allowed.includes(lead.status)) throw new EnrollmentInputError(`${action} нельзя: заявка на этапе «${leadStatusLabel(lead.status)}». Обновите страницу.`, 409)
}

/** Условный переход: если этап уже сменили в другой вкладке, ничего не пишем. */
function changed(result: unknown): void {
  if (rowsOf(result).length === 0) throw new EnrollmentInputError('Заявку только что изменили в другой вкладке. Обновите страницу.', 409)
}

export type LeadPathEvent = { id: number, type: string, label: string, message: string, actor: string | null, at: string }
export type LeadPathPayment = { id: number, amount: string, status: string, method: string, isTest: boolean, paidAt: string | null, createdAt: string, paymentMethod: string | null }

export type LeadPathState = {
  lead: {
    id: number
    email: string
    name: string | null
    status: string
    statusLabel: string
    createdAt: string
    entryTaskSentAt: string | null
    entryTaskDueAt: string | null
    entrySubmittedAt: string | null
    entrySubmissionCount: number
    entryPassed: number | null
    entryTotal: number | null
    admittedAt: string | null
    amount: string | null
    paymentDueAt: string | null
    paymentUrl: string | null
    paymentLinkSentAt: string | null
    paymentPageOpenedAt: string | null
    paymentStartedAt: string | null
    paymentReminderSentAt: string | null
    paymentExpired: boolean
    paidAt: string | null
    decisionMessage: string | null
  }
  admission: AdmissionDraft | null
  payments: LeadPathPayment[]
  enrollment: EnrollmentView | null
  defaults: { firstName: string, lastName: string, username: string, group: string, amount: string, dueDays: number }
  paymentsEnabled: boolean
  paymentsTest: boolean
  events: LeadPathEvent[]
}

export async function leadPathState(payload: Payload, leadId: number): Promise<LeadPathState> {
  const lead = await findLead(payload, leadId)
  const base = await leadEnrollmentState(payload, leadId)
  const [payments, events] = await Promise.all([
    payload.find({ collection: 'bootcamp-payments', where: { lead: { equals: leadId } }, sort: '-createdAt', limit: 20, depth: 0, overrideAccess: true }),
    // depth 1 нужен ради имени администратора; без select к каждому событию подтянулась бы вся заявка с кодом решения.
    payload.find({ collection: 'bootcamp-lead-events', where: { lead: { equals: leadId } }, select: { type: true, message: true, actor: true, createdAt: true }, sort: '-createdAt', limit: 100, depth: 1, overrideAccess: true }),
  ])
  const config = robokassaConfig()
  const now = Date.now()
  return {
    lead: {
      id: lead.id,
      email: lead.email,
      name: lead.name ?? null,
      status: lead.status,
      statusLabel: leadStatusLabel(lead.status),
      createdAt: lead.createdAt,
      entryTaskSentAt: lead.entryTaskSentAt ?? null,
      entryTaskDueAt: lead.entryTaskDueAt ?? null,
      entrySubmittedAt: lead.entrySubmittedAt ?? null,
      entrySubmissionCount: lead.entrySubmissionCount ?? 0,
      entryPassed: lead.entryPassed ?? null,
      entryTotal: lead.entryTotal ?? null,
      admittedAt: lead.admittedAt ?? null,
      amount: lead.paymentAmountKopecks ? formatRubles(lead.paymentAmountKopecks) : null,
      paymentDueAt: lead.paymentDueAt ?? null,
      paymentUrl: lead.paymentToken ? paymentUrl(lead.paymentToken) : null,
      paymentLinkSentAt: lead.paymentLinkSentAt ?? null,
      paymentPageOpenedAt: lead.paymentPageOpenedAt ?? null,
      paymentStartedAt: lead.paymentStartedAt ?? null,
      paymentReminderSentAt: lead.paymentReminderSentAt ?? null,
      paymentExpired: lead.status === 'admitted' && Boolean(lead.paymentDueAt) && Date.parse(lead.paymentDueAt ?? '') < now,
      paidAt: lead.paidAt ?? null,
      decisionMessage: lead.decisionMessage ?? null,
    },
    admission: readAdmissionDraft(lead.admission),
    payments: payments.docs.map((doc) => ({
      id: doc.id,
      amount: formatRubles(doc.amountKopecks),
      status: doc.status,
      method: doc.method,
      isTest: doc.isTest === true,
      paidAt: doc.paidAt ?? null,
      createdAt: doc.createdAt,
      paymentMethod: doc.paymentMethod ?? doc.incCurrLabel ?? null,
    })),
    enrollment: base.enrollment,
    defaults: { ...base.defaults, amount: String(BOOTCAMP_PRICE_KOPECKS / 100), dueDays: PAYMENT_DUE_DAYS },
    paymentsEnabled: config !== null,
    paymentsTest: config?.isTest === true,
    events: events.docs.map((doc) => ({
      id: doc.id,
      type: doc.type,
      label: leadEventLabel(doc.type),
      message: doc.message,
      actor: doc.actor && typeof doc.actor === 'object' ? actorName(doc.actor) : null,
      at: doc.createdAt,
    })),
  }
}

/** Письмо со ссылкой на оплату. Сбой не откатывает допуск: наставник видит тревогу и отправит снова. */
export async function sendPaymentLink(payload: Payload, leadId: number, resend: boolean): Promise<boolean> {
  const lead = await findLead(payload, leadId)
  if (!lead.paymentToken || !lead.paymentDueAt || !lead.paymentAmountKopecks) return false
  try {
    const replyTo = await contactReplyTo(payload)
    const draft = readAdmissionDraft(lead.admission)
    const content = bootcampAdmittedEmail({
      name: lead.name ?? null,
      program: program(lead),
      amount: formatRubles(lead.paymentAmountKopecks),
      dueDate: formatEntryTaskDate(lead.paymentDueAt),
      url: paymentUrl(lead.paymentToken),
      offerUrl: OFFER_URL,
      comment: resend ? null : draft?.comment ?? null,
      resend,
      replyable: Boolean(replyTo),
    })
    await payload.sendEmail({ to: lead.email, ...content, ...(replyTo ? { replyTo } : {}) })
    await db(payload).execute(sql`update bootcamp_leads set payment_link_sent_at = now(), updated_at = now() where id = ${leadId}`)
    await journal(payload, { lead: leadId, type: 'payment_link_sent', message: `Письмо со ссылкой на оплату ушло на ${lead.email}` })
    return true
  } catch (error) {
    logger.error('Bootcamp payment link email failed', error, { 'lead.id': leadId })
    await journal(payload, {
      lead: leadId,
      type: 'payment_alert',
      message: 'Письмо со ссылкой на оплату не ушло',
      telegram: { title: `Письмо со ссылкой на оплату не ушло: ${lead.email}`, lines: ['Подробности в журнале приложения. Нажмите «Отправить ссылку ещё раз» в заявке.'], link: leadAdminLink(leadId) },
    })
    return false
  }
}

/** «Допустить»: этап «Допущен, ждёт оплаты», личная ссылка на оплату и данные для будущего зачисления. */
export async function admitLead(payload: Payload, admin: User, leadId: number, input: AdmissionInput): Promise<LeadPathState> {
  const lead = await findLead(payload, leadId)
  requireStage(lead, DECISION_STAGES, 'Допустить')
  const { username } = input.enrollment
  const taken = await payload.find({ collection: 'bootcamp-enrollments', where: { gitlabUsername: { equals: username } }, limit: 1, depth: 0, overrideAccess: true })
  if (taken.docs[0]) throw new EnrollmentInputError(`Логин ${username} уже у зачисленного ученика (${taken.docs[0].email})`, 409)
  const reserved = rowsOf<{ email: string }>(await db(payload).execute(sql`select email from bootcamp_leads where id <> ${leadId} and status in ('admitted', 'paid') and admission->'enrollment'->>'username' = ${username} limit 1`))
  if (reserved[0]) throw new EnrollmentInputError(`Логин ${username} уже отдан при допуске другой заявке (${reserved[0].email})`, 409)
  const course = await payload.find({ collection: 'courses', where: { slug: { equals: BOOTCAMP_MANUALS_COURSE_SLUG } }, limit: 1, depth: 0, overrideAccess: true })
  if (!course.docs[0]) throw new EnrollmentInputError(`В LMS нет курса методичек «${BOOTCAMP_MANUALS_COURSE_SLUG}»: после оплаты зачислить будет некуда. Сначала импортируйте методички.`, 409)

  const dueAt = paymentDueAt(new Date(), input.dueDays).toISOString()
  const draft: AdmissionDraft = { enrollment: input.enrollment, comment: input.comment }
  const enabled = robokassaConfig() !== null
  await inTransaction(payload, admin, async (req) => {
    changed(await (await txDb(req)).execute(sql`
      update bootcamp_leads set status = 'admitted', admitted_at = now(), admitted_by_id = ${admin.id},
        payment_amount_kopecks = ${input.amountKopecks}, payment_due_at = ${dueAt}, payment_token = ${randomBytes(24).toString('base64url')},
        payment_link_sent_at = null, payment_page_opened_at = null, payment_started_at = null, payment_reminder_sent_at = null,
        payment_expired_notice_at = null, paid_at = null, decision_message = ${input.comment}, admission = ${JSON.stringify(draft)}::jsonb, updated_at = now()
      where id = ${leadId} and status in ('new', 'contacted', 'diagnostic') returning id`))
    await recordLeadEvent(payload, req, {
      lead: leadId,
      type: 'admitted',
      actor: admin,
      message: `Допущен: ${formatRubles(input.amountKopecks)} до ${formatEntryTaskDate(dueAt)}, логин GitLab ${username}`,
      data: { amountKopecks: input.amountKopecks, dueAt, username, group: input.enrollment.group },
      telegram: {
        title: `Допущен: ${lead.email}`,
        lines: [
          `${input.enrollment.firstName} ${input.enrollment.lastName}, логин GitLab ${username}, поток ${input.enrollment.group}`,
          `Сумма ${formatRubles(input.amountKopecks)}, оплатить до ${formatEntryTaskDate(dueAt)}`,
          enabled ? 'Кандидату уходит письмо со ссылкой на оплату' : 'Робокасса не подключена: письмо со ссылкой не отправлено, оплату можно отметить вручную',
          `Допустил: ${actorName(admin)}`,
        ],
        link: leadAdminLink(leadId),
      },
    })
  })
  if (enabled) await sendPaymentLink(payload, leadId, false)
  return leadPathState(payload, leadId)
}

/** «Отправить ссылку ещё раз»: новый срок, напоминание и тревога об истечении снова в силе. */
export async function resendPaymentLink(payload: Payload, admin: User, leadId: number, dueDays: number): Promise<LeadPathState> {
  const lead = await findLead(payload, leadId)
  requireStage(lead, ['admitted'], 'Отправить ссылку')
  if (!robokassaConfig()) throw new EnrollmentInputError('Робокасса не подключена: переменные ROBOKASSA_* не заданы в Dokploy. Оплату можно отметить вручную.', 409)
  const dueAt = paymentDueAt(new Date(), dueDays).toISOString()
  await inTransaction(payload, admin, async (req) => {
    changed(await (await txDb(req)).execute(sql`update bootcamp_leads set payment_due_at = ${dueAt}, payment_reminder_sent_at = null, payment_expired_notice_at = null, updated_at = now() where id = ${leadId} and status = 'admitted' returning id`))
    await recordLeadEvent(payload, req, {
      lead: leadId,
      type: 'payment_link_sent',
      actor: admin,
      message: `Ссылка на оплату отправлена ещё раз, новый срок ${formatEntryTaskDate(dueAt)}`,
      telegram: { title: `Ссылка на оплату отправлена ещё раз: ${lead.email}`, lines: [`Новый срок: ${formatEntryTaskDate(dueAt)}`, `Отправил: ${actorName(admin)}`], link: leadAdminLink(leadId) },
    })
  })
  const sent = await sendPaymentLink(payload, leadId, true)
  if (!sent) throw new EnrollmentInputError('Срок продлён, но письмо не ушло. Подробности в журнале приложения, попробуйте ещё раз.', 502)
  return leadPathState(payload, leadId)
}

/** «Отменить допуск»: ссылка на оплату перестаёт работать, заявка возвращается к решению. */
export async function cancelAdmission(payload: Payload, admin: User, leadId: number): Promise<LeadPathState> {
  const lead = await findLead(payload, leadId)
  requireStage(lead, ['admitted'], 'Отменить допуск')
  const back = lead.entrySubmittedAt ? 'diagnostic' : 'new'
  await inTransaction(payload, admin, async (req) => {
    const tx = await txDb(req)
    changed(await tx.execute(sql`update bootcamp_leads set status = ${back}, updated_at = now() where id = ${leadId} and status = 'admitted' returning id`))
    await tx.execute(sql`update bootcamp_payments set status = 'cancelled', updated_at = now() where lead_id = ${leadId} and status = 'pending'`)
    await recordLeadEvent(payload, req, {
      lead: leadId,
      type: 'admission_cancelled',
      actor: admin,
      message: `Допуск отменён, заявка снова «${leadStatusLabel(back)}»`,
      telegram: { title: `Допуск отменён: ${lead.email}`, lines: ['Ссылка на оплату больше не работает', `Отменил: ${actorName(admin)}`], link: leadAdminLink(leadId) },
    })
  })
  return leadPathState(payload, leadId)
}

export type Decision = 'preparation' | 'rejected' | 'withdrawn'

const DECISION_TEXT: Record<Decision, { title: string, done: string }> = {
  preparation: { title: 'Нужна подготовка', done: 'Кандидату ушло письмо с рекомендациями' },
  rejected: { title: 'Отказ', done: 'Кандидату ушло письмо с решением' },
  withdrawn: { title: 'Кандидат отказался сам', done: 'Письмо кандидату не отправляется' },
}

/** «Нужна подготовка», «Отказать», «Кандидат отказался сам». Первые два пишут кандидату. */
export async function decideLead(payload: Payload, admin: User, leadId: number, decision: Decision, message: string | null): Promise<LeadPathState> {
  const lead = await findLead(payload, leadId)
  requireStage(lead, DECISION_STAGES, DECISION_TEXT[decision].title)
  const text = DECISION_TEXT[decision]
  await inTransaction(payload, admin, async (req) => {
    changed(await (await txDb(req)).execute(sql`update bootcamp_leads set status = ${decision}, decision_message = ${message}, updated_at = now() where id = ${leadId} and status in ('new', 'contacted', 'diagnostic') returning id`))
    await recordLeadEvent(payload, req, {
      lead: leadId,
      type: decision,
      actor: admin,
      message: message ? `${text.title}: ${message}` : text.title,
      telegram: { title: `${text.title}: ${lead.email}`, lines: [message, text.done, `Решил: ${actorName(admin)}`], link: leadAdminLink(leadId) },
    })
  })
  if (decision !== 'withdrawn') {
    try {
      const replyTo = await contactReplyTo(payload)
      const content = bootcampDecisionEmail({ name: lead.name ?? null, program: program(lead), decision, message, replyable: Boolean(replyTo) })
      await payload.sendEmail({ to: lead.email, ...content, ...(replyTo ? { replyTo } : {}) })
    } catch (error) {
      logger.error('Bootcamp decision email failed', error, { 'lead.id': leadId })
      await journal(payload, { lead: leadId, type: 'payment_alert', message: 'Письмо с решением не ушло', telegram: { title: `Письмо с решением не ушло: ${lead.email}`, lines: ['Подробности в журнале приложения. Напишите кандидату вручную.'], link: leadAdminLink(leadId) } })
    }
  }
  return leadPathState(payload, leadId)
}

/** «Вернуть на рассмотрение» после подготовки, отказа или отзыва. Письма нет. */
export async function reopenLead(payload: Payload, admin: User, leadId: number): Promise<LeadPathState> {
  const lead = await findLead(payload, leadId)
  requireStage(lead, CLOSED_STAGES, 'Вернуть на рассмотрение')
  const back = lead.entrySubmittedAt ? 'diagnostic' : 'new'
  await inTransaction(payload, admin, async (req) => {
    changed(await (await txDb(req)).execute(sql`update bootcamp_leads set status = ${back}, updated_at = now() where id = ${leadId} and status in ('preparation', 'rejected', 'withdrawn') returning id`))
    await recordLeadEvent(payload, req, {
      lead: leadId,
      type: 'reopened',
      actor: admin,
      message: `Возвращена на рассмотрение: «${leadStatusLabel(back)}»`,
      telegram: { title: `Заявка возвращена на рассмотрение: ${lead.email}`, lines: [`Вернул: ${actorName(admin)}`], link: leadAdminLink(leadId) },
    })
  })
  return leadPathState(payload, leadId)
}

/** «Продлить срок и отправить задание ещё раз»: та же ссылка, новый срок от сегодняшнего дня. */
export async function extendEntryTask(payload: Payload, admin: User, leadId: number): Promise<LeadPathState> {
  const lead = await findLead(payload, leadId)
  requireStage(lead, DECISION_STAGES, 'Продлить входное задание')
  const dueAt = await sendEntryTask(payload, { ...lead, entryTaskDueAt: null })
  if (!dueAt) throw new EnrollmentInputError('Письмо с заданием не ушло (сбой почты или предел писем в час). Подробности в журнале приложения.', 502)
  await journal(payload, { lead: leadId, type: 'entry_task_extended', actor: admin, message: `Задание отправлено ещё раз, новый срок ${formatEntryTaskDate(dueAt)}` })
  return leadPathState(payload, leadId)
}

/** «Зачислить» из пути заявки: после оплаты, если автозачисление не стартовало. */
export async function enrollPaidLead(payload: Payload, admin: User, leadId: number, input: EnrollmentInput): Promise<LeadPathState> {
  await startEnrollment(payload, admin, leadId, input)
  return leadPathState(payload, leadId)
}
