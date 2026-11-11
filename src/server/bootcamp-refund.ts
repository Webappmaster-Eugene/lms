import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { formatRubles } from '@/lib/bootcamp-admission'
import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { leadStatusLabel } from '@/lib/bootcamp-leads'
import { REFUNDABLE_STAGES, receiptAdvice, refundRejectionText, type RefundFormInput } from '@/lib/bootcamp-refunds'
import { relationId } from '@/lib/relation-id'
import { logger } from '@/lib/telemetry'
import { bootcampRefundEmail } from '@/payload/emails/templates'
import { actorName, inTransaction, journal, leadAdminLink, recordLeadEvent, rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { programNames, requireProgram } from '@/server/bootcamp-programs'
import { contactReplyTo } from '@/server/contact-reply-to'
import { createRefund, fetchOperationState, fetchRefundState, robokassaConfig, type RefundCreateResult } from '@/server/robokassa'
import type { BootcampLead, User } from '@/payload-types'

/**
 * Возврат денег за буткемп (решение владельца 11.11.2026). Робокасса не сообщает о возвратах,
 * сделанных в её кабинете, а OpStateExt и после возврата отвечает «оплачено» (проверено на счёте 18).
 * Поэтому LMS узнаёт о возврате двумя путями: сама создаёт его через API возвратов и следит за
 * состоянием заявки или наставник отмечает возврат из кабинета вручную. Выполненный возврат
 * переводит заявку в «Деньги возвращены» и закрывает доступы: курс методичек в LMS сразу,
 * учётку GitLab блокирует исполнитель в VM GitLab.
 */

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = (payload: Payload) => (payload.db as unknown as { drizzle: Executor }).drizzle

// Заявку Робокассы спрашиваем не чаще раза в минуту, за один проход планировщика - не больше 20.
const CHECK_EVERY_MIN = 1
const CHECK_BATCH = 20

type PaidPayment = { id: number, amountKopecks: number, method: 'robokassa' | 'manual', opKey: string | null, refundedKopecks: number }

/** Оплата, по которой возвращают деньги: последняя настоящая. Тестовая оплата денег не списывала. */
async function paidPayment(executor: Executor, leadId: number): Promise<PaidPayment | null> {
  const [row] = rowsOf<{ id: number, amount_kopecks: string | number, method: 'robokassa' | 'manual', op_key: string | null, refunded: string | number | null }>(await executor.execute(sql`
    select p.id, p.amount_kopecks, p.method, p.op_key,
      (select sum(r.amount_kopecks) from bootcamp_refunds r where r.payment_id = p.id and r.status in ('processing', 'done')) as refunded
    from bootcamp_payments p
    where p.lead_id = ${leadId} and p.status = 'paid' and not coalesce(p.is_test, false)
    order by p.paid_at desc nulls last, p.id desc
    limit 1`))
  if (!row) return null
  return { id: Number(row.id), amountKopecks: Number(row.amount_kopecks), method: row.method, opKey: row.op_key, refundedKopecks: Number(row.refunded ?? 0) }
}

async function lockLead(executor: Executor, leadId: number): Promise<{ status: string, email: string }> {
  const [lead] = rowsOf<{ status: string, email: string }>(await executor.execute(sql`select status, email from bootcamp_leads where id = ${leadId} for update`))
  if (!lead) throw new EnrollmentInputError('Заявка не найдена', 404)
  if (!(REFUNDABLE_STAGES as readonly string[]).includes(lead.status)) {
    throw new EnrollmentInputError(`Вернуть деньги можно после оплаты: заявка на этапе «${leadStatusLabel(lead.status)}»`, 409)
  }
  return lead
}

function checkAmount(payment: PaidPayment, amountKopecks: number): void {
  const left = payment.amountKopecks - payment.refundedKopecks
  if (left <= 0) throw new EnrollmentInputError(`По счёту ${payment.id} уже возвращено всё: ${formatRubles(payment.amountKopecks)}`, 409)
  if (amountKopecks > left) throw new EnrollmentInputError(`Вернуть можно не больше ${formatRubles(left)}: оплачено ${formatRubles(payment.amountKopecks)}, уже возвращено ${formatRubles(payment.refundedKopecks)}`, 409)
}

export type RefundAvailability = { available: boolean, viaApi: boolean, leftKopecks: number, paymentId: number | null, note: string | null }

/** Что показывает панель: можно ли вернуть, сколько и через API или только отметкой. */
export async function refundAvailability(payload: Payload, lead: BootcampLead): Promise<RefundAvailability> {
  const payment = await paidPayment(db(payload), lead.id)
  if (!payment || !(REFUNDABLE_STAGES as readonly string[]).includes(lead.status)) return { available: false, viaApi: false, leftKopecks: 0, paymentId: null, note: null }
  const config = robokassaConfig()
  const leftKopecks = Math.max(0, payment.amountKopecks - payment.refundedKopecks)
  let note: string | null = null
  if (payment.method === 'manual') note = 'Оплата отмечена вручную, мимо Робокассы: верните деньги тем же способом и отметьте возврат.'
  else if (!config || config.isTest) note = 'Робокасса не в боевом режиме: возврат через API недоступен.'
  else if (!config.password3) note = 'В Dokploy не задан ROBOKASSA_PASSWORD3: возврат через API недоступен, только отметкой после возврата в кабинете.'
  return { available: leftKopecks > 0, viaApi: leftKopecks > 0 && note === null, leftKopecks, paymentId: payment.id, note }
}

class RefundConnectionError extends Error {}

/** Робокасса приняла заявку, а запись в LMS не сохранилась: повтор вернул бы деньги второй раз. */
class RefundNotRecordedError extends Error {
  constructor(readonly requestId: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
  }
}

/**
 * «Вернуть деньги»: заявка на возврат через API Робокассы. Строка заявки блокируется на время
 * запроса, поэтому двойной клик не создаст второй возврат: второй увидит первый в сумме возвращённого.
 */
export async function requestRefund(payload: Payload, admin: User, leadId: number, input: RefundFormInput, fetchImpl: typeof fetch = fetch): Promise<void> {
  const config = robokassaConfig()
  if (!config || config.isTest || !config.password3) {
    throw new EnrollmentInputError('Возврат через Робокассу недоступен: нужен боевой режим и ROBOKASSA_PASSWORD3 в Dokploy. Верните деньги в кабинете Робокассы и отметьте возврат вручную.', 409)
  }
  const password3 = config.password3
  try {
    await inTransaction(payload, admin, async (req) => {
      const tx = await txDb(req)
      const lead = await lockLead(tx, leadId)
      const payment = await paidPayment(tx, leadId)
      if (!payment) throw new EnrollmentInputError('Настоящей оплаты по заявке нет: возвращать нечего', 409)
      if (payment.method !== 'robokassa') throw new EnrollmentInputError('Оплата отмечена вручную, мимо Робокассы: верните деньги тем же способом и нажмите «Отметить возврат вручную»', 409)
      checkAmount(payment, input.amountKopecks)
      const program = await requireProgram(payload, (await payload.findByID({ collection: 'bootcamp-leads', id: leadId, depth: 0, overrideAccess: true, req })).program, req)

      let opKey = payment.opKey
      if (!opKey) {
        // В уведомлении об оплате ключа операции нет, он приходит только из OpStateExt.
        const state = await fetchOperationState(config, payment.id, fetchImpl)
        if (state.state !== 'paid' || !state.opKey) throw new EnrollmentInputError(`Робокасса не подтвердила оплату по счёту ${payment.id} (состояние ${state.stateCode ?? 'неизвестно'}): возврат через API невозможен`, 409)
        opKey = state.opKey
        await tx.execute(sql`update bootcamp_payments set op_key = ${opKey}, updated_at = now() where id = ${payment.id}`)
      }

      let result: RefundCreateResult
      try {
        result = await createRefund(password3, { opKey, amountKopecks: input.amountKopecks, paidKopecks: payment.amountKopecks, itemName: program.receiptItemName }, fetchImpl)
      } catch (error) {
        throw new RefundConnectionError(error instanceof Error ? error.message : String(error))
      }
      if (!result.ok) throw new EnrollmentInputError(refundRejectionText(result.message), 409)
      const requestId = result.requestId
      logger.info('Robokassa refund requested', { 'lead.id': leadId, 'robokassa.inv_id': payment.id, 'robokassa.refund_id': requestId })
      try {
        await payload.create({
          collection: 'bootcamp-refunds',
          data: { lead: leadId, payment: payment.id, amountKopecks: input.amountKopecks, status: 'processing', method: 'robokassa', reason: input.reason, requestId, requestedBy: admin.id },
          overrideAccess: true,
          depth: 0,
          req,
        })
        await recordLeadEvent(payload, req, {
          lead: leadId,
          type: 'refund_requested',
          actor: admin,
          message: `Возврат ${formatRubles(input.amountKopecks)} по счёту ${payment.id} запрошен в Робокассе: ${input.reason}`,
          data: { invId: payment.id, amountKopecks: input.amountKopecks, requestId },
          telegram: {
            title: `Возврат запрошен: ${lead.email}`,
            lines: [`${formatRubles(input.amountKopecks)} из ${formatRubles(payment.amountKopecks)}, счёт ${payment.id}`, `Причина: ${input.reason}`, 'Когда Робокасса выполнит возврат, LMS закроет доступы ученика', `Оформил: ${actorName(admin)}`],
            link: leadAdminLink(leadId),
          },
        })
      } catch (error) {
        throw new RefundNotRecordedError(requestId, error)
      }
    })
  } catch (error) {
    if (error instanceof RefundNotRecordedError) {
      logger.error('Robokassa refund was created but not recorded', error, { 'lead.id': leadId, 'robokassa.refund_id': error.requestId })
      const advice = 'Не повторяйте возврат: когда он выполнится в кабинете Робокассы, отметьте его вручную.'
      await journal(payload, {
        lead: leadId,
        type: 'refund_alert',
        actor: admin,
        message: `Робокасса приняла возврат ${formatRubles(input.amountKopecks)} (заявка ${error.requestId}), но LMS его не записала`,
        telegram: { title: 'Возврат создан в Робокассе, но не записан в LMS', lines: [`Заявка Робокассы ${error.requestId}`, advice], link: leadAdminLink(leadId) },
      })
      throw new EnrollmentInputError(`Робокасса приняла возврат (заявка ${error.requestId}), но LMS не смогла его записать. ${advice}`, 500)
    }
    if (!(error instanceof RefundConnectionError)) throw error
    logger.error('Robokassa refund request lost connection', error, { 'lead.id': leadId })
    await journal(payload, {
      lead: leadId,
      type: 'refund_alert',
      actor: admin,
      message: `Связь с Робокассой оборвалась на заявке на возврат ${formatRubles(input.amountKopecks)}: неизвестно, создан ли возврат`,
      telegram: { title: 'Возврат: связь с Робокассой оборвалась', lines: [error.message, 'Проверьте операцию в кабинете Робокассы. Если возврат там есть, отметьте его вручную, а не повторяйте.'], link: leadAdminLink(leadId) },
    })
    throw new EnrollmentInputError(`${error.message}. Неизвестно, создала ли Робокасса возврат: проверьте операцию в кабинете Робокассы. Если возврат там есть, отметьте его вручную, а не повторяйте.`, 502)
  }
}

/** «Отметить возврат вручную»: деньги вернули в кабинете Робокассы или переводом. Дальше как у выполненного возврата. */
export async function markRefundedManually(payload: Payload, admin: User, leadId: number, input: RefundFormInput): Promise<void> {
  const letter = await inTransaction(payload, admin, async (req) => {
    const tx = await txDb(req)
    await lockLead(tx, leadId)
    const payment = await paidPayment(tx, leadId)
    if (!payment) throw new EnrollmentInputError('Настоящей оплаты по заявке нет: возвращать нечего', 409)
    checkAmount(payment, input.amountKopecks)
    const now = new Date().toISOString()
    const created = await payload.create({
      collection: 'bootcamp-refunds',
      data: { lead: leadId, payment: payment.id, amountKopecks: input.amountKopecks, status: 'done', method: 'manual', reason: input.reason, requestedBy: admin.id, finishedAt: now },
      overrideAccess: true,
      depth: 0,
      req,
    })
    return completeRefund(payload, req, created.id, admin)
  })
  await sendRefundLetter(payload, letter)
}

/** Планировщик: состояние заявок на возврат в Робокассе. Возвращает число выполненных за проход. */
export async function checkRefunds(payload: Payload, fetchImpl: typeof fetch = fetch): Promise<number> {
  const due = rowsOf<{ id: number, request_id: string }>(await db(payload).execute(sql`
    update bootcamp_refunds set checked_at = now(), updated_at = now()
    where id in (
      select id from bootcamp_refunds
      where status = 'processing' and request_id is not null
        and (checked_at is null or checked_at < now() - make_interval(mins => ${CHECK_EVERY_MIN}))
      order by id limit ${CHECK_BATCH}
    )
    returning id, request_id`))
  let finished = 0
  for (const { id, request_id: requestId } of due) {
    let state: Awaited<ReturnType<typeof fetchRefundState>>
    try {
      state = await fetchRefundState(requestId, fetchImpl)
    } catch (error) {
      logger.warn('Robokassa refund state check failed', { 'robokassa.refund_id': requestId, error: error instanceof Error ? error.message : String(error) })
      continue
    }
    try {
      if (state.label === 'finished') {
        // Отметка «выполнен» и закрытие доступов откатываются вместе: при сбое возврат останется
        // «выполняется», и следующий проход планировщика повторит всё целиком.
        const letter = await inTransaction(payload, await anyAdmin(payload), async (req) => {
          const moved = rowsOf(await (await txDb(req)).execute(sql`update bootcamp_refunds set status = 'done', robokassa_label = ${state.rawLabel}, finished_at = now(), updated_at = now() where id = ${id} and status = 'processing' returning id`))
          return moved.length === 0 ? undefined : completeRefund(payload, req, id, null)
        })
        if (letter === undefined) continue
        finished += 1
        await sendRefundLetter(payload, letter)
      } else if (state.label === 'canceled') {
        const moved = rowsOf<{ lead_id: number, amount_kopecks: string | number }>(await db(payload).execute(sql`update bootcamp_refunds set status = 'cancelled', robokassa_label = ${state.rawLabel}, finished_at = now(), updated_at = now() where id = ${id} and status = 'processing' returning lead_id, amount_kopecks`))
        if (moved[0]) {
          await journal(payload, {
            lead: moved[0].lead_id,
            type: 'refund_cancelled',
            message: `Возврат ${formatRubles(Number(moved[0].amount_kopecks))} отменён в кабинете Робокассы, доступы не закрывались`,
            telegram: { title: 'Возврат отменён в кабинете Робокассы', lines: [`${formatRubles(Number(moved[0].amount_kopecks))}, заявка Робокассы ${requestId}`, 'Деньги не вернулись, доступы ученика остались'], link: leadAdminLink(moved[0].lead_id) },
          })
        }
      } else {
        await db(payload).execute(sql`update bootcamp_refunds set robokassa_label = ${state.rawLabel}, updated_at = now() where id = ${id}`)
        if (state.label === 'unknown') logger.warn('Robokassa refund state is unknown', { 'robokassa.refund_id': requestId, 'robokassa.label': state.rawLabel })
      }
    } catch (error) {
      logger.error('Bootcamp refund completion failed, will retry', error, { 'robokassa.refund_id': requestId })
    }
  }
  return finished
}

type RefundLetter = { leadId: number, email: string, name: string | null, program: string, amount: string, viaRobokassa: boolean }

/**
 * Возврат выполнен: вызывается в транзакции, которая отметила его выполненным. Первый выполненный
 * возврат переводит заявку в «Деньги возвращены» и закрывает доступы; следующий частичный (заявка
 * уже на этом этапе) только записывается в журнал. Возвращает письмо ученику, если оно нужно.
 */
async function completeRefund(payload: Payload, req: PayloadRequest, refundId: number, actor: User | null): Promise<RefundLetter | null> {
  const tx = await txDb(req)
  const refund = await payload.findByID({ collection: 'bootcamp-refunds', id: refundId, depth: 0, overrideAccess: true, req })
  const leadId = relationId(refund.lead)
  const amount = formatRubles(refund.amountKopecks)
  const viaRobokassa = refund.method === 'robokassa'
  const moved = rowsOf<{ id: number }>(await tx.execute(sql`update bootcamp_leads set status = 'refunded', updated_at = now() where id = ${leadId} and status in ('paid', 'enrolled') returning id`))
  const lead = await payload.findByID({ collection: 'bootcamp-leads', id: leadId, depth: 0, overrideAccess: true, req })
  const revoked = moved.length > 0 ? await revokeAccess(payload, req, lead, actor) : null
  const [money] = rowsOf<{ amount_kopecks: string | number, method: string, refunded: string | number }>(await tx.execute(sql`
    select p.amount_kopecks, p.method,
      (select coalesce(sum(r.amount_kopecks), 0) from bootcamp_refunds r where r.payment_id = p.id and r.status = 'done') as refunded
    from bootcamp_payments p where p.id = ${relationId(refund.payment)}`))
  const receipt = money ? receiptAdvice(money.method, Number(money.amount_kopecks) - Number(money.refunded)) : null
  await recordLeadEvent(payload, req, {
    lead: leadId,
    type: 'refunded',
    actor,
    message: `Деньги возвращены: ${amount}${viaRobokassa ? ', через Робокассу' : ', отмечено вручную'}. Причина: ${refund.reason}`,
    data: { refundId, amountKopecks: refund.amountKopecks, method: refund.method },
    telegram: {
      title: `Деньги возвращены: ${lead.email}`,
      lines: [
        `${amount}, ${viaRobokassa ? 'Робокасса выполнила возврат' : 'возврат отмечен вручную'}`,
        `Причина: ${refund.reason}`,
        revoked ?? 'Доступы закрыты при прошлом возврате',
        receipt,
      ].filter((line): line is string => line !== null),
      link: leadAdminLink(leadId),
    },
  })
  return moved.length > 0 ? { leadId, email: lead.email, name: lead.name ?? null, program: lead.program, amount, viaRobokassa } : null
}

/** Письмо ученику уходит после фиксации: откат транзакции не должен оставить письмо о несостоявшемся возврате. */
async function sendRefundLetter(payload: Payload, letter: RefundLetter | null): Promise<void> {
  if (!letter) return
  try {
    const replyTo = await contactReplyTo(payload)
    await payload.sendEmail({ to: letter.email, ...bootcampRefundEmail({ name: letter.name, program: (await programNames(payload, letter.program)).short, amount: letter.amount, viaRobokassa: letter.viaRobokassa, replyable: Boolean(replyTo) }), ...(replyTo ? { replyTo } : {}) })
  } catch (error) {
    logger.error('Bootcamp refund email failed', error, { 'lead.id': letter.leadId })
    await journal(payload, { lead: letter.leadId, type: 'refund_alert', message: 'Письмо о возврате ученику не ушло', telegram: { title: `Письмо о возврате не ушло: ${letter.email}`, lines: ['Подробности в журнале приложения. Напишите ученику вручную.'], link: leadAdminLink(letter.leadId) } })
  }
}

async function anyAdmin(payload: Payload): Promise<User | null> {
  const found = await payload.find({ collection: 'users', where: { and: [{ role: { equals: 'admin' } }, { isActive: { not_equals: false } }] }, sort: 'id', limit: 1, depth: 0, overrideAccess: true })
  return found.docs[0] ?? null
}

/**
 * Закрыть доступы после возврата, в транзакции выполненного возврата. Курс методичек снимается,
 * только если его выдало зачисление (заметка «Буткемп: …»): назначенный раньше и отдельно курс
 * не наш. Учётку GitLab блокирует исполнитель в VM GitLab; незапущенное зачисление
 * останавливается. Возвращает итог одной строкой.
 */
async function revokeAccess(payload: Payload, req: PayloadRequest, lead: BootcampLead, actor: User | null): Promise<string> {
  const tx = await txDb(req)
  const enrollment = (await payload.find({ collection: 'bootcamp-enrollments', where: { lead: { equals: lead.id } }, limit: 1, depth: 0, overrideAccess: true, req })).docs[0]
  if (!enrollment) {
    await recordLeadEvent(payload, req, { lead: lead.id, type: 'access_revoked', actor, message: 'Зачисления не было: закрывать нечего' })
    return 'Зачисления не было: закрывать нечего'
  }
  const notes: string[] = []
  const program = await requireProgram(payload, enrollment.program || lead.program, req)
  const userId = enrollment.lmsUser ? relationId(enrollment.lmsUser) : null
  if (userId && program.manualsCourseId) {
    const grant = (await payload.find({ collection: 'learning-access-grants', where: { ruleKey: { equals: `${userId}:courses:${program.manualsCourseId}` } }, limit: 1, depth: 0, overrideAccess: true, req })).docs[0]
    // Назначения меняются только от имени администратора: так их пишет журнал доступа.
    const admin = req.user?.role === 'admin' ? req.user : null
    if (!grant || grant.effect !== 'allow') notes.push('курса методичек в LMS у ученика нет')
    else if (!(grant.note ?? '').startsWith('Буткемп:')) notes.push('курс методичек назначен не зачислением, его не трогаю')
    else if (!admin) notes.push('курс методичек не снят: нет действующего администратора, снимите вручную')
    else {
      await payload.delete({ collection: 'learning-access-grants', id: grant.id, overrideAccess: false, user: admin, req })
      notes.push('курс методичек в LMS снят')
    }
  } else {
    notes.push('учётки LMS или курса методичек у зачисления нет')
  }

  const stopped = rowsOf(await tx.execute(sql`update bootcamp_enrollments set status = 'failed', error = 'Деньги возвращены: зачисление остановлено', revoke_requested_at = now(), revoked_at = now(), finished_at = now(), updated_at = now() where id = ${enrollment.id} and status = 'queued' returning id`))
  if (stopped.length > 0) notes.push('зачисление в GitLab ещё не начиналось, остановлено')
  else if (enrollment.gitlabUserId || enrollment.status === 'running') {
    await tx.execute(sql`update bootcamp_enrollments set revoke_requested_at = coalesce(revoke_requested_at, now()), revoke_error = null, updated_at = now() where id = ${enrollment.id}`)
    notes.push(`учётку GitLab ${enrollment.gitlabUsername} заблокирует исполнитель в VM GitLab`)
  } else {
    await tx.execute(sql`update bootcamp_enrollments set revoke_requested_at = coalesce(revoke_requested_at, now()), revoked_at = now(), updated_at = now() where id = ${enrollment.id}`)
    notes.push('учётки GitLab нет')
  }
  const summary = `Доступы: ${notes.join('; ')}`
  await recordLeadEvent(payload, req, { lead: lead.id, type: 'access_revoked', actor, message: summary })
  return summary
}

/** Исполнитель в VM GitLab отчитался о блокировке учётки после возврата. */
export async function reportGitlabRevoked(payload: Payload, enrollmentId: number, result: { ok: boolean, error: string | null }): Promise<void> {
  if (result.ok) {
    const [done] = rowsOf<{ lead_id: number, gitlab_username: string, email: string }>(await db(payload).execute(sql`update bootcamp_enrollments set revoked_at = now(), revoke_error = null, updated_at = now() where id = ${enrollmentId} and revoke_requested_at is not null and revoked_at is null returning lead_id, gitlab_username, email`))
    if (!done) return
    await journal(payload, {
      lead: done.lead_id,
      type: 'access_revoked',
      message: `Учётка GitLab ${done.gitlab_username} заблокирована`,
      telegram: { title: `Учётка GitLab заблокирована: ${done.gitlab_username}`, lines: [done.email, 'После возврата денег доступы ученика закрыты'], link: leadAdminLink(done.lead_id) },
    })
    return
  }
  const error = (result.error ?? 'исполнитель не указал причину').slice(0, 2000)
  const [failed] = rowsOf<{ lead_id: number, gitlab_username: string }>(await db(payload).execute(sql`update bootcamp_enrollments set revoke_error = ${error}, updated_at = now() where id = ${enrollmentId} and revoke_requested_at is not null and revoked_at is null and revoke_error is null returning lead_id, gitlab_username`))
  if (!failed) return
  await journal(payload, {
    lead: failed.lead_id,
    type: 'refund_alert',
    message: `Учётку GitLab ${failed.gitlab_username} заблокировать не удалось: ${error}`,
    telegram: { title: `Не удалось заблокировать учётку GitLab: ${failed.gitlab_username}`, lines: [error, 'Заблокируйте учётку в GitLab вручную: Admin, Users, Block'], link: leadAdminLink(failed.lead_id) },
  })
}
