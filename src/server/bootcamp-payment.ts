import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { formatRubles, isPaymentToken, OFFER_VERSION, RECEIPT_ITEM_NAME } from '@/lib/bootcamp-admission'
import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { formatEntryTaskDate } from '@/lib/bootcamp-entry-task'
import { BOOTCAMP_PROGRAMS, leadStatusLabel } from '@/lib/bootcamp-leads'
import { logger } from '@/lib/telemetry'
import { bootcampPaymentReceivedEmail, bootcampPaymentTeamEmail } from '@/payload/emails/templates'
import { startEnrollment } from '@/server/bootcamp-enrollment'
import { inTransaction, journal, leadAdminLink, recordLeadEvent, rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { readAdmissionDraft } from '@/server/bootcamp-lead-path'
import { adminEmails } from '@/server/bootcamp-leads'
import { contactReplyTo } from '@/server/contact-reply-to'
import { buildPaymentUrl, robokassaConfig, verifyResultNotice, verifySuccessReturn, type RobokassaNotice } from '@/server/robokassa'
import { createRateLimiter } from '@/server/trainer/rate-limit'
import type { BootcampLead, User } from '@/payload-types'

/**
 * Оплата буткемпа через Робокассу (документ 28 плана, флоу магазина podbor-minuta).
 * Источник истины - уведомление ResultURL с подписью Пароля #2: возврат кандидата на
 * страницу успеха ничего не меняет. Каждый переход к оплате - новая запись платежа, её id
 * и есть номер счёта (InvId).
 */

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = (payload: Payload) => (payload.db as unknown as { drizzle: Db }).drizzle

// Тревоги о чужих уведомлениях не должны превращаться в поток сообщений.
const alerts = createRateLimiter('bootcamp-payment-alerts', 10, 60 * 60_000)
// Страница ошибки открыта без подписи: перебор номеров счетов не должен засыпать журнал и Telegram.
const failReturns = createRateLimiter('bootcamp-payment-fail-returns', 30, 60 * 60_000)

const programName = (lead: Pick<BootcampLead, 'program'>) => BOOTCAMP_PROGRAMS.find((item) => item.value === lead.program)?.short ?? lead.program

export async function findLeadByPaymentToken(payload: Payload, token: string): Promise<BootcampLead | null> {
  if (!isPaymentToken(token)) return null
  const found = await payload.find({ collection: 'bootcamp-leads', where: { paymentToken: { equals: token } }, limit: 1, depth: 0, overrideAccess: true })
  return found.docs[0] ?? null
}

export type PaymentPageState = {
  kind: 'open' | 'paid' | 'expired' | 'closed' | 'unavailable'
  name: string | null
  program: string
  amount: string
  dueDate: string | null
  test: boolean
}

/** Что видит кандидат по личной ссылке. Первое открытие уходит наставнику в Telegram. */
export async function paymentPageState(payload: Payload, lead: BootcampLead): Promise<PaymentPageState> {
  const config = robokassaConfig()
  const expired = Boolean(lead.paymentDueAt) && Date.parse(lead.paymentDueAt ?? '') < Date.now()
  const kind: PaymentPageState['kind'] = lead.paidAt || lead.status === 'paid' || lead.status === 'enrolled'
    ? 'paid'
    : lead.status !== 'admitted' ? 'closed' : expired ? 'expired' : config ? 'open' : 'unavailable'
  if (kind === 'open' || kind === 'expired') {
    const first = rowsOf(await db(payload).execute(sql`update bootcamp_leads set payment_page_opened_at = now(), updated_at = now() where id = ${lead.id} and payment_page_opened_at is null returning id`))
    if (first.length > 0) {
      await journal(payload, {
        lead: lead.id,
        type: 'payment_page_opened',
        message: expired ? 'Кандидат открыл страницу оплаты после срока' : 'Кандидат открыл страницу оплаты',
        telegram: { title: `Открыл страницу оплаты: ${lead.email}`, lines: [expired ? 'Срок оплаты уже прошёл' : null], link: leadAdminLink(lead.id) },
      })
    }
  }
  return {
    kind,
    name: lead.name?.trim() || null,
    program: programName(lead),
    amount: formatRubles(lead.paymentAmountKopecks ?? 0),
    dueDate: lead.paymentDueAt ? formatEntryTaskDate(lead.paymentDueAt) : null,
    test: config?.isTest === true,
  }
}

/** «Перейти к оплате»: запись платежа и подписанная ссылка в Робокассу. */
export async function startCheckout(payload: Payload, token: string, acceptOffer: unknown): Promise<string> {
  const lead = await findLeadByPaymentToken(payload, token)
  if (!lead) throw new EnrollmentInputError('Ссылка на оплату не найдена', 404)
  const state = await paymentPageState(payload, lead)
  if (state.kind === 'paid') throw new EnrollmentInputError('Оплата уже получена, повторно платить не нужно.', 409)
  if (state.kind === 'closed') throw new EnrollmentInputError('Эта ссылка на оплату больше не действует. Напишите нам на support@mentorcareer.ru.', 409)
  if (state.kind === 'expired') throw new EnrollmentInputError('Срок оплаты прошёл. Напишите нам на support@mentorcareer.ru, и мы пришлём новую ссылку.', 409)
  const config = robokassaConfig()
  if (!config) throw new EnrollmentInputError('Оплата временно недоступна. Напишите нам на support@mentorcareer.ru.', 503)
  if (acceptOffer !== true) throw new EnrollmentInputError('Отметьте, что прочитали договор-оферту и принимаете её условия.', 400)
  const amountKopecks = lead.paymentAmountKopecks
  if (!amountKopecks || !lead.paymentDueAt) throw new EnrollmentInputError('В заявке нет суммы или срока оплаты. Напишите нам на support@mentorcareer.ru.', 409)

  const payment = await inTransaction(payload, null, async (req) => {
    const created = await payload.create({
      collection: 'bootcamp-payments',
      data: { lead: lead.id, amountKopecks, status: 'pending', method: 'robokassa', isTest: config.isTest, offerVersion: OFFER_VERSION, offerAcceptedAt: new Date().toISOString() },
      overrideAccess: true,
      depth: 0,
      req,
    })
    const first = rowsOf(await (await txDb(req)).execute(sql`update bootcamp_leads set payment_started_at = now(), updated_at = now() where id = ${lead.id} and payment_started_at is null returning id`))
    await recordLeadEvent(payload, req, {
      lead: lead.id,
      type: 'checkout_started',
      message: `Переход к оплате, счёт ${created.id}${config.isTest ? ' (тестовый режим)' : ''}`,
      data: { invId: created.id, test: config.isTest },
      telegram: first.length > 0 ? { title: `Перешёл к оплате: ${lead.email}`, lines: [`${formatRubles(amountKopecks)}, счёт ${created.id}${config.isTest ? ', тестовый режим Робокассы' : ''}`], link: leadAdminLink(lead.id) } : null,
    })
    return created
  })

  return buildPaymentUrl(config, {
    invId: payment.id,
    amountKopecks,
    description: `Буткемп ${programName(lead)}, заявка ${lead.id}`,
    receipt: { items: [{ name: RECEIPT_ITEM_NAME, quantity: 1, sum: amountKopecks / 100, payment_method: 'full_payment', payment_object: 'service', tax: 'none' }] },
    email: lead.email,
    expiresAt: new Date(lead.paymentDueAt),
  })
}

export type PaidOutcome = 'paid' | 'already' | 'unknown' | 'amount_mismatch' | 'double' | 'unexpected'

type PaidDetails = { amountKopecks: number, paymentMethod?: string, incCurrLabel?: string, fee?: string, opKey?: string, source: 'robokassa' | 'reconcile' }

/**
 * Оплата пришла (уведомление или сверка). Строка платежа блокируется: два одновременных
 * уведомления обработают оплату один раз, второе получит 'already'.
 */
export async function applyPaid(payload: Payload, invId: number, details: PaidDetails): Promise<{ outcome: PaidOutcome, leadId: number | null }> {
  const result = await inTransaction(payload, null, async (req) => {
    const tx = await txDb(req)
    const [payment] = rowsOf<{ id: number, lead_id: number, amount_kopecks: string | number, processed_at: string | null, is_test: boolean | null }>(
      await tx.execute(sql`select id, lead_id, amount_kopecks, processed_at, is_test from bootcamp_payments where id = ${invId} for update`))
    if (!payment) return { outcome: 'unknown' as const, leadId: null, lead: null }
    // Колонка numeric: драйвер отдаёт её строкой.
    if (Number(payment.amount_kopecks) !== details.amountKopecks) return { outcome: 'amount_mismatch' as const, leadId: payment.lead_id, lead: null }
    if (payment.processed_at) return { outcome: 'already' as const, leadId: payment.lead_id, lead: null }
    await tx.execute(sql`update bootcamp_payments set status = 'paid', paid_at = now(), processed_at = now(), payment_method = ${details.paymentMethod ?? null},
      inc_curr_label = ${details.incCurrLabel ?? null}, fee = ${details.fee ?? null}, op_key = coalesce(${details.opKey ?? null}, op_key), updated_at = now() where id = ${invId}`)
    const [lead] = rowsOf<{ id: number, email: string, status: string, paid_at: string | null }>(await tx.execute(sql`select id, email, status, paid_at from bootcamp_leads where id = ${payment.lead_id} for update`))
    const amount = formatRubles(details.amountKopecks)
    const test = payment.is_test === true
    const via = details.source === 'reconcile' ? ', найдено сверкой с Робокассой' : ''
    if (lead.paid_at) {
      await recordLeadEvent(payload, req, {
        lead: lead.id, type: 'payment_alert', message: `Вторая оплата: счёт ${invId}, ${amount}`, data: { invId },
        telegram: { title: `Двойная оплата: ${lead.email}`, lines: [`Счёт ${invId}, ${amount}${via}`, 'Заявка уже оплачена. Верните деньги в кабинете Робокассы и аннулируйте чек в «Мой налог».'], link: leadAdminLink(lead.id) },
      })
      return { outcome: 'double' as const, leadId: lead.id, lead }
    }
    if (lead.status !== 'admitted') {
      await tx.execute(sql`update bootcamp_leads set paid_at = now(), updated_at = now() where id = ${lead.id}`)
      await recordLeadEvent(payload, req, {
        lead: lead.id, type: 'payment_alert', message: `Оплата ${amount} пришла на этапе «${leadStatusLabel(lead.status)}», счёт ${invId}`, data: { invId },
        telegram: { title: `Оплата без допуска: ${lead.email}`, lines: [`${amount}, счёт ${invId}${via}`, `Этап заявки «${leadStatusLabel(lead.status)}»: решите, зачислить вручную или вернуть деньги.`], link: leadAdminLink(lead.id) },
      })
      return { outcome: 'unexpected' as const, leadId: lead.id, lead }
    }
    await tx.execute(sql`update bootcamp_leads set status = 'paid', paid_at = now(), updated_at = now() where id = ${lead.id}`)
    await tx.execute(sql`update bootcamp_payments set status = 'cancelled', updated_at = now() where lead_id = ${lead.id} and status = 'pending' and id <> ${invId}`)
    await recordLeadEvent(payload, req, {
      lead: lead.id, type: 'paid', message: `Оплата ${amount}, счёт ${invId}${test ? ' (тестовый режим)' : ''}${via}`, data: { invId, amountKopecks: details.amountKopecks, method: details.incCurrLabel ?? details.paymentMethod ?? null, test },
      telegram: { title: `${test ? 'Тестовая оплата' : 'Оплата получена'}: ${lead.email}`, lines: [`${amount}, счёт ${invId}${details.incCurrLabel ? `, ${details.incCurrLabel}` : ''}${via}`, 'Зачисление запускается автоматически'], link: leadAdminLink(lead.id) },
    })
    return { outcome: 'paid' as const, leadId: lead.id, lead }
  })
  if (result.outcome === 'paid' && result.leadId) await afterPaid(payload, result.leadId, invId)
  return { outcome: result.outcome, leadId: result.leadId }
}

/** После фиксации оплаты: письма и автозачисление. Сбой любого шага виден в Telegram, оплата остаётся. */
export async function afterPaid(payload: Payload, leadId: number, invId: number): Promise<void> {
  const lead = await payload.findByID({ collection: 'bootcamp-leads', id: leadId, depth: 0, overrideAccess: true })
  const payment = await payload.findByID({ collection: 'bootcamp-payments', id: invId, depth: 0, overrideAccess: true })
  const amount = formatRubles(payment.amountKopecks)
  try {
    const replyTo = await contactReplyTo(payload)
    await payload.sendEmail({ to: lead.email, ...bootcampPaymentReceivedEmail({ name: lead.name ?? null, program: programName(lead), amount, invoice: invId, replyable: Boolean(replyTo) }), ...(replyTo ? { replyTo } : {}) })
  } catch (error) {
    logger.error('Bootcamp payment receipt email failed', error, { 'lead.id': leadId })
  }
  try {
    const content = bootcampPaymentTeamEmail({ id: leadId, address: lead.email, amount, invoice: invId, method: payment.method === 'manual' ? 'отмечено вручную' : payment.incCurrLabel ?? payment.paymentMethod ?? 'Робокасса', test: payment.isTest === true })
    for (const to of await adminEmails(payload)) await payload.sendEmail({ to, ...content })
  } catch (error) {
    logger.error('Bootcamp payment team email failed', error, { 'lead.id': leadId })
  }
  const draft = readAdmissionDraft(lead.admission)
  try {
    if (!draft) throw new EnrollmentInputError('в заявке нет данных для зачисления из формы «Допустить»')
    // Учётку и курс выдаёт администратор: зачисление после оплаты идёт от имени того, кто допустил.
    const admin = await enrollingAdmin(payload, lead)
    await startEnrollment(payload, admin, leadId, draft.enrollment, { byPayment: true })
  } catch (error) {
    const reason = error instanceof EnrollmentInputError ? error.message : 'ошибка на сервере, подробности в журнале приложения'
    if (!(error instanceof EnrollmentInputError)) logger.error('Bootcamp auto enrollment failed', error, { 'lead.id': leadId })
    await journal(payload, {
      lead: leadId, type: 'enrollment_failed', message: `Автозачисление не стартовало: ${reason}`,
      telegram: { title: `Оплачено, но зачисление не стартовало: ${lead.email}`, lines: [reason, 'Проверьте данные и нажмите «Зачислить» в заявке.'], link: leadAdminLink(leadId) },
    })
  }
}

async function enrollingAdmin(payload: Payload, lead: BootcampLead): Promise<User> {
  const id = lead.admittedBy && typeof lead.admittedBy === 'object' ? lead.admittedBy.id : lead.admittedBy
  const admitted = id ? await payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true, disableErrors: true }) : null
  if (admitted && admitted.role === 'admin' && admitted.isActive !== false) return admitted
  const any = await payload.find({ collection: 'users', where: { and: [{ role: { equals: 'admin' } }, { isActive: { not_equals: false } }] }, sort: 'id', limit: 1, depth: 0, overrideAccess: true })
  if (!any.docs[0]) throw new EnrollmentInputError('нет действующего администратора, от имени которого выдать доступы')
  return any.docs[0]
}

/** «Отметить оплату вручную»: деньги пришли мимо Робокассы. Дальше тот же путь, что у оплаты. */
export async function markPaidManually(payload: Payload, admin: User, leadId: number, amountKopecks: number, comment: string): Promise<void> {
  const lead = await payload.findByID({ collection: 'bootcamp-leads', id: leadId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!lead) throw new EnrollmentInputError('Заявка не найдена', 404)
  if (lead.status !== 'admitted') throw new EnrollmentInputError(`Отметить оплату можно после допуска: заявка на этапе «${leadStatusLabel(lead.status)}»`, 409)
  const payment = await inTransaction(payload, admin, async (req) => {
    const tx = await txDb(req)
    const moved = rowsOf(await tx.execute(sql`update bootcamp_leads set status = 'paid', paid_at = now(), updated_at = now() where id = ${leadId} and status = 'admitted' returning id`))
    if (moved.length === 0) throw new EnrollmentInputError('Заявку только что изменили в другой вкладке. Обновите страницу.', 409)
    const now = new Date().toISOString()
    const created = await payload.create({
      collection: 'bootcamp-payments',
      data: { lead: leadId, amountKopecks, status: 'paid', method: 'manual', paidAt: now, processedAt: now, comment, markedBy: admin.id },
      overrideAccess: true,
      depth: 0,
      req,
    })
    await tx.execute(sql`update bootcamp_payments set status = 'cancelled', updated_at = now() where lead_id = ${leadId} and status = 'pending'`)
    await recordLeadEvent(payload, req, {
      lead: leadId, type: 'paid_manually', actor: admin, message: `Оплата ${formatRubles(amountKopecks)} отмечена вручную: ${comment}`, data: { invId: created.id },
      telegram: { title: `Оплата отмечена вручную: ${lead.email}`, lines: [`${formatRubles(amountKopecks)}: ${comment}`, 'Зачисление запускается автоматически'], link: leadAdminLink(leadId) },
    })
    return created
  })
  await afterPaid(payload, leadId, payment.id)
}

/** ResultURL. Ответ 'OK<InvId>' - только для проверенного и учтённого уведомления, иначе Робокасса повторит. */
export async function handleResultNotice(payload: Payload, params: Record<string, string>): Promise<{ status: number, body: string }> {
  const config = robokassaConfig()
  if (!config) {
    logger.warn('Robokassa notice received, but payments are not configured')
    return { status: 503, body: 'payments are not configured' }
  }
  const checked = verifyResultNotice(config, params)
  if (!checked.ok) {
    logger.warn('Robokassa notice rejected', { 'robokassa.reason': checked.reason, 'robokassa.inv_id': String(params.InvId ?? '').slice(0, 20) })
    if (checked.reason === 'signature' && alerts.take('all')) {
      await journal(payload, { lead: null, type: 'payment_alert', message: `Уведомление Робокассы с неверной подписью, счёт ${String(params.InvId ?? '').slice(0, 20)}`, telegram: { title: 'Робокасса: уведомление с неверной подписью', lines: [`Счёт ${String(params.InvId ?? '').slice(0, 20)}. Проверьте пароли ROBOKASSA_* и режим IsTest в Dokploy.`], link: leadAdminLink(null) } })
    }
    return { status: 400, body: 'bad request' }
  }
  return paidResponse(payload, checked.notice, 'robokassa')
}

async function paidResponse(payload: Payload, notice: RobokassaNotice, source: PaidDetails['source']): Promise<{ status: number, body: string }> {
  const { outcome, leadId } = await applyPaid(payload, notice.invId, { amountKopecks: notice.amountKopecks, paymentMethod: notice.paymentMethod, incCurrLabel: notice.incCurrLabel, fee: notice.fee, opKey: notice.opKey, source })
  if (outcome === 'unknown' || outcome === 'amount_mismatch') {
    logger.warn('Robokassa notice does not match a payment', { 'robokassa.outcome': outcome, 'robokassa.inv_id': notice.invId })
    if (alerts.take('all')) {
      await journal(payload, { lead: leadId, type: 'payment_alert', message: outcome === 'unknown' ? `Уведомление об оплате несуществующего счёта ${notice.invId}` : `Сумма в уведомлении не совпала со счётом ${notice.invId}`, telegram: { title: 'Робокасса: уведомление не совпало со счётом', lines: [`Счёт ${notice.invId}, ${formatRubles(notice.amountKopecks)}: ${outcome === 'unknown' ? 'такого счёта нет' : 'сумма другая'}`], link: leadAdminLink(leadId) } })
    }
    return { status: 400, body: 'bad request' }
  }
  return { status: 200, body: `OK${notice.invId}` }
}

export type ReturnState = { kind: 'paid' | 'pending' | 'invalid', amount: string | null, invId: number | null, test: boolean }

/** SuccessURL: подпись Пароля #1 говорит, что ссылку дала Робокасса, а итог берём из базы. */
export async function successReturnState(payload: Payload, params: Record<string, string>): Promise<ReturnState> {
  const config = robokassaConfig()
  const checked = config ? verifySuccessReturn(config, params) : null
  if (!checked?.ok) return { kind: 'invalid', amount: null, invId: null, test: false }
  const payment = await payload.findByID({ collection: 'bootcamp-payments', id: checked.notice.invId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!payment) return { kind: 'invalid', amount: null, invId: null, test: false }
  return { kind: payment.status === 'paid' ? 'paid' : 'pending', amount: formatRubles(payment.amountKopecks), invId: payment.id, test: payment.isTest === true }
}

/** FailURL: подписи нет, поэтому только отметка один раз на счёт, без раскрытия данных заявки. */
export async function noteFailReturn(payload: Payload, rawInvId: string | undefined): Promise<void> {
  const invId = /^\d{1,10}$/.test(rawInvId ?? '') ? Number(rawInvId) : NaN
  if (!Number.isSafeInteger(invId) || invId <= 0 || !failReturns.take('all')) return
  const [row] = rowsOf<{ lead_id: number }>(await db(payload).execute(sql`update bootcamp_payments set fail_return_at = now(), updated_at = now() where id = ${invId} and status = 'pending' and fail_return_at is null returning lead_id`))
  if (!row) return
  const lead = await payload.findByID({ collection: 'bootcamp-leads', id: row.lead_id, depth: 0, overrideAccess: true, disableErrors: true })
  await journal(payload, {
    lead: row.lead_id, type: 'payment_failed_return', message: `Оплата по счёту ${invId} не прошла или прервана`,
    telegram: { title: `Оплата не прошла: ${lead?.email ?? `заявка ${row.lead_id}`}`, lines: [`Счёт ${invId}. Кандидат вернулся со страницы ошибки Робокассы, деньги не списаны.`], link: leadAdminLink(row.lead_id) },
  })
}
