import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type PayloadRequest, type Where } from 'payload'

import type { EmailBroadcast, EmailBroadcastDelivery, User } from '@/payload-types'
import { BROADCAST_LIMITS, broadcastCtaUrlError } from '@/lib/broadcast-markup'
import { collectAllPages } from '@/lib/paginate'
import { relationId } from '@/lib/relation-id'
import { logger } from '@/lib/telemetry'
import { captureThrottled } from '@/lib/error-reporting/capture'
import { broadcastEmail, emailBaseUrl } from '@/payload/emails/templates'
import { broadcastErrorLabel, broadcastSendOutcome, MAX_BROADCAST_ATTEMPTS } from '@/server/broadcasts/delivery-outcome'
import { createUnsubscribeToken } from '@/server/broadcasts/unsubscribe-token'

export class BroadcastError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export type BroadcastDraftInput = {
  subject: string
  body: string
  ctaLabel: string | null
  ctaUrl: string | null
  audience: 'all' | 'selected'
  recipients: number[]
}

export type BroadcastStatusCounts = Record<EmailBroadcastDelivery['status'], number>

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
type TransactionAdapter = { sessions: Record<string | number, { db: Executor } | undefined> }

const LOCK_NAMESPACE = 7212
const JOB_KEY = 'email-broadcasts'
const SENDS_PER_RUN = 20
const DELIVERY_STATUSES = ['pending', 'processing', 'sent', 'failed', 'cancelled', 'skipped'] as const

async function executor(req: PayloadRequest): Promise<Executor> {
  const id = await req.transactionID
  const db = id === undefined ? undefined : (req.payload.db as unknown as TransactionAdapter).sessions[id]?.db
  if (!db) throw new Error('Email broadcasts require a database transaction')
  return db
}

/** Ключ 0 — аренда фоновой задачи, положительный — рассылка, отрицательный — одно письмо. */
async function lock(req: PayloadRequest, key: number) {
  const db = await executor(req)
  if (key > 0) await db.execute(sql`select id from email_broadcasts where id = ${key} for update`)
  await db.execute(sql`select pg_advisory_xact_lock(${LOCK_NAMESPACE}, ${key})`)
}

async function transact<T>(payload: Payload, operation: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  try { const result = await operation(req); await commitTransaction(req); return result } catch (error) { await killTransaction(req); throw error }
}

function text(value: unknown, field: string, max: number, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new BroadcastError(`Заполните поле «${field}»`)
    return null
  }
  if (typeof value !== 'string') throw new BroadcastError(`Поле «${field}» заполнено неверно`)
  const trimmed = value.trim()
  if (!trimmed && required) throw new BroadcastError(`Заполните поле «${field}»`)
  if (trimmed.length > max) throw new BroadcastError(`Поле «${field}» длиннее ${max} символов`)
  return trimmed || null
}

export function validateBroadcastInput(raw: unknown): BroadcastDraftInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BroadcastError('Некорректные данные рассылки')
  const input = raw as Record<string, unknown>
  const subject = text(input.subject, 'Тема', BROADCAST_LIMITS.subject, true) as string
  const body = text(input.body, 'Текст письма', BROADCAST_LIMITS.body, true) as string
  const ctaLabel = text(input.ctaLabel, 'Текст кнопки', BROADCAST_LIMITS.ctaLabel, false)
  const ctaUrl = text(input.ctaUrl, 'Ссылка кнопки', BROADCAST_LIMITS.ctaUrl, false)
  if (Boolean(ctaLabel) !== Boolean(ctaUrl)) throw new BroadcastError('Для кнопки укажите и текст, и ссылку — или оставьте оба поля пустыми')
  const urlError = broadcastCtaUrlError(ctaUrl)
  if (urlError) throw new BroadcastError(urlError)
  if (input.audience !== 'all' && input.audience !== 'selected') throw new BroadcastError('Выберите получателей')
  const rawRecipients = input.recipients ?? []
  if (!Array.isArray(rawRecipients) || rawRecipients.length > BROADCAST_LIMITS.recipients || !rawRecipients.every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw new BroadcastError('Список получателей заполнен неверно')
  }
  const recipients = input.audience === 'selected' ? [...new Set(rawRecipients as number[])] : []
  if (input.audience === 'selected' && recipients.length === 0) throw new BroadcastError('Выберите хотя бы одного ученика')
  return { subject, body, ctaLabel, ctaUrl, audience: input.audience, recipients }
}

export async function findBroadcast(payload: Payload, id: number, req?: PayloadRequest): Promise<EmailBroadcast> {
  const found = await payload.find({ collection: 'email-broadcasts', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req })
  if (!found.docs[0]) throw new BroadcastError('Рассылка не найдена', 404)
  return found.docs[0]
}

export async function createBroadcastDraft(payload: Payload, user: Pick<User, 'id'>, input: BroadcastDraftInput): Promise<EmailBroadcast> {
  return payload.create({ collection: 'email-broadcasts', data: { ...input, status: 'draft', createdBy: user.id }, overrideAccess: true, depth: 0 })
}

export async function updateBroadcastDraft(payload: Payload, id: number, input: BroadcastDraftInput): Promise<EmailBroadcast> {
  return transact(payload, async (req) => {
    await lock(req, id)
    const broadcast = await findBroadcast(payload, id, req)
    if (broadcast.status !== 'draft') throw new BroadcastError('Запущенную рассылку изменить нельзя', 409)
    return payload.update({ collection: 'email-broadcasts', id, data: input, req, overrideAccess: true, depth: 0 })
  })
}

export async function deleteBroadcastDraft(payload: Payload, id: number): Promise<void> {
  await transact(payload, async (req) => {
    await lock(req, id)
    const broadcast = await findBroadcast(payload, id, req)
    if (broadcast.status !== 'draft') throw new BroadcastError('Удалить можно только черновик. Запущенную рассылку можно остановить', 409)
    await payload.delete({ collection: 'email-broadcasts', id, req, overrideAccess: true })
  })
}

async function optedOutUsers(payload: Payload, req?: PayloadRequest): Promise<Set<number>> {
  const rows = await collectAllPages(
    ({ page, limit }) => payload.find({ collection: 'notification-preferences', where: { emailBroadcastsEnabled: { equals: false } }, select: { user: true }, sort: 'id', depth: 0, overrideAccess: true, req, page, limit }),
    { label: 'отписавшиеся от рассылок' },
  )
  return new Set(rows.map((row) => relationId(row.user)))
}

const eligible = (user: Pick<User, 'email' | 'isActive'>) => user.isActive !== false && typeof user.email === 'string' && user.email.includes('@')

/** Кому уйдёт письмо прямо сейчас: активные, с адресом и не отписавшиеся. */
export async function resolveBroadcastAudience(payload: Payload, broadcast: Pick<EmailBroadcast, 'audience' | 'recipients'>, req?: PayloadRequest): Promise<{ userIds: number[]; excluded: number }> {
  const selected = broadcast.audience === 'selected' ? [...new Set((broadcast.recipients ?? []).map(relationId))] : null
  if (selected && selected.length === 0) return { userIds: [], excluded: 0 }
  const where: Where = selected ? { id: { in: selected } } : { role: { equals: 'student' } }
  const [users, optedOut] = await Promise.all([
    collectAllPages(
      ({ page, limit }) => payload.find({ collection: 'users', where, select: { email: true, isActive: true }, sort: 'id', depth: 0, overrideAccess: true, req, page, limit }),
      { label: 'получатели рассылки' },
    ),
    optedOutUsers(payload, req),
  ])
  const userIds = users.filter((user) => eligible(user) && !optedOut.has(user.id)).map((user) => user.id)
  // Для «всех учеников» отключённые аккаунты — не исключение, а не аудитория вовсе.
  const audienceSize = selected ? selected.length : users.filter((user) => user.isActive !== false).length
  return { userIds, excluded: Math.max(0, audienceSize - userIds.length) }
}

export async function queueBroadcast(payload: Payload, id: number): Promise<EmailBroadcast> {
  return transact(payload, async (req) => {
    await lock(req, id)
    const broadcast = await findBroadcast(payload, id, req)
    if (broadcast.status !== 'draft') throw new BroadcastError('Рассылка уже запущена', 409)
    const { userIds, excluded } = await resolveBroadcastAudience(payload, broadcast, req)
    if (userIds.length === 0) throw new BroadcastError('Некому отправить: у выбранных учеников нет адреса, аккаунт отключён или они отписались от рассылок', 409)
    if (userIds.length > BROADCAST_LIMITS.recipients) throw new BroadcastError(`За один раз можно отправить не больше ${BROADCAST_LIMITS.recipients} писем. Разделите получателей на несколько рассылок`, 409)
    // Тысячи payload.create в одной транзакции держали бы запрос десятки секунд.
    const db = await executor(req)
    await db.execute(sql`insert into email_broadcast_deliveries (broadcast_id, user_id, status, attempts, next_attempt_at)
      select ${id}::integer, recipient, 'pending'::enum_email_broadcast_deliveries_status, 0, now() from unnest(${`{${userIds.join(',')}}`}::integer[]) as recipient
      on conflict (broadcast_id, user_id) do nothing`)
    return payload.update({
      collection: 'email-broadcasts', id,
      data: { status: 'sending', queuedAt: new Date().toISOString(), recipientsTotal: userIds.length, excludedCount: excluded },
      req, overrideAccess: true, depth: 0,
    })
  })
}

export async function cancelBroadcast(payload: Payload, id: number): Promise<EmailBroadcast> {
  return transact(payload, async (req) => {
    await lock(req, id)
    const broadcast = await findBroadcast(payload, id, req)
    if (broadcast.status !== 'sending') throw new BroadcastError(broadcast.status === 'draft' ? 'Рассылка ещё не запущена' : 'Рассылка уже завершена', 409)
    const db = await executor(req)
    // Письма в обработке не трогаем: задача увидит остановку перед отправкой.
    await db.execute(sql`update email_broadcast_deliveries set status = 'cancelled', claim_token = null, last_error = 'cancelled', updated_at = now()
      where broadcast_id = ${id} and status = 'pending'`)
    return payload.update({ collection: 'email-broadcasts', id, data: { status: 'cancelled', completedAt: new Date().toISOString() }, req, overrideAccess: true, depth: 0 })
  })
}

export async function broadcastStatusCounts(payload: Payload, id: number): Promise<BroadcastStatusCounts> {
  const counts = await Promise.all(DELIVERY_STATUSES.map((status) => payload.count({ collection: 'email-broadcast-deliveries', where: { and: [{ broadcast: { equals: id } }, { status: { equals: status } }] }, overrideAccess: true })))
  return Object.fromEntries(DELIVERY_STATUSES.map((status, index) => [status, counts[index]?.totalDocs ?? 0])) as BroadcastStatusCounts
}

export async function broadcastProblems(payload: Payload, id: number, limit = 50): Promise<Array<{ id: number; name: string; email: string; status: EmailBroadcastDelivery['status']; reason: string }>> {
  const deliveries = await payload.find({ collection: 'email-broadcast-deliveries', where: { and: [{ broadcast: { equals: id } }, { status: { in: ['failed', 'skipped'] } }] }, sort: '-updatedAt', limit, depth: 0, overrideAccess: true })
  const userIds = deliveries.docs.map((delivery) => relationId(delivery.user))
  const users = userIds.length ? await payload.find({ collection: 'users', where: { id: { in: userIds } }, select: { firstName: true, lastName: true, email: true }, limit: userIds.length, depth: 0, overrideAccess: true }) : { docs: [] }
  const byId = new Map(users.docs.map((user) => [user.id, user]))
  return deliveries.docs.map((delivery) => {
    const user = byId.get(relationId(delivery.user))
    return {
      id: delivery.id,
      name: user ? `${user.firstName} ${user.lastName}`.trim() : 'Удалённый аккаунт',
      email: user?.email ?? '',
      status: delivery.status,
      reason: broadcastErrorLabel(delivery.lastError),
    }
  })
}

/** Без SMTP Payload подставляет консольный адаптер, и «отправка» молча проходит. */
export function emailTransportReady(payload: Payload): boolean {
  return Boolean(payload.email) && payload.email.name !== 'console'
}

async function replyToAddress(payload: Payload): Promise<string | undefined> {
  try {
    const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true })
    const address = settings.contacts?.email?.trim()
    return address && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ? address : undefined
  } catch (error) {
    logger.warn('Email broadcast reply-to is unavailable', { 'error.type': error instanceof Error ? error.name : 'unknown' })
    return undefined
  }
}

export function unsubscribePageUrl(userId: number): string {
  return `${emailBaseUrl()}/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(userId))}`
}

export function broadcastMessage(broadcast: Pick<EmailBroadcast, 'subject' | 'body' | 'ctaLabel' | 'ctaUrl'>, user: Pick<User, 'id' | 'email' | 'firstName'>, replyTo: string | undefined, subjectPrefix = '') {
  const token = encodeURIComponent(createUnsubscribeToken(user.id))
  const content = broadcastEmail({
    firstName: user.firstName ?? '',
    subject: broadcast.subject,
    body: broadcast.body,
    ctaLabel: broadcast.ctaLabel,
    ctaUrl: broadcast.ctaUrl,
    unsubscribeUrl: unsubscribePageUrl(user.id),
    replyable: Boolean(replyTo),
  })
  return {
    to: user.email,
    subject: `${subjectPrefix}${content.subject}`,
    html: content.html,
    text: content.text,
    ...(replyTo ? { replyTo } : {}),
    // RFC 8058: почтовые клиенты показывают кнопку «Отписаться» и шлют POST без браузера.
    headers: {
      'List-Unsubscribe': `<${emailBaseUrl()}/api/email/unsubscribe?token=${token}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}

/** То самое письмо, которое получит администратор при тестовой отправке. */
export async function broadcastPreview(payload: Payload, broadcast: EmailBroadcast, admin: Pick<User, 'id' | 'email' | 'firstName'>) {
  return broadcastMessage(broadcast, admin, await replyToAddress(payload))
}

export async function sendBroadcastTest(payload: Payload, id: number, admin: Pick<User, 'id' | 'email' | 'firstName'>): Promise<void> {
  if (!emailTransportReady(payload)) throw new BroadcastError('Почта на сервере не настроена: письмо не уйдёт', 503)
  const broadcast = await findBroadcast(payload, id)
  try {
    await payload.sendEmail(broadcastMessage(broadcast, admin, await replyToAddress(payload), '[Тест] '))
  } catch (error) {
    const outcome = broadcastSendOutcome(error, MAX_BROADCAST_ATTEMPTS)
    logger.warn('Email broadcast test failed', { 'broadcast.id': id, 'email.error': outcome.error ?? 'unknown' })
    throw new BroadcastError(`Почтовый сервер не принял письмо: ${broadcastErrorLabel(outcome.error)}`, 502)
  }
}

let transportWarningShown = false

type JobResult = { skipped: boolean; sent: number; failed: number; retried: number; skippedRecipients: number; completed: number }

async function finishBroadcasts(payload: Payload): Promise<number> {
  const active = await collectAllPages(
    ({ page, limit }) => payload.find({ collection: 'email-broadcasts', where: { status: { equals: 'sending' } }, sort: 'id', page, limit, depth: 0, overrideAccess: true, select: { status: true } }),
    { label: 'рассылки в отправке' },
  )
  let completed = 0
  for (const candidate of active) {
    const finished = await transact(payload, async (req) => {
      await lock(req, candidate.id)
      const broadcast = await findBroadcast(payload, candidate.id, req)
      if (broadcast.status !== 'sending') return false
      const open = await payload.count({ collection: 'email-broadcast-deliveries', where: { and: [{ broadcast: { equals: broadcast.id } }, { status: { in: ['pending', 'processing'] } }] }, req, overrideAccess: true })
      if (open.totalDocs > 0) return false
      const sent = await payload.count({ collection: 'email-broadcast-deliveries', where: { and: [{ broadcast: { equals: broadcast.id } }, { status: { equals: 'sent' } }] }, req, overrideAccess: true })
      await payload.update({ collection: 'email-broadcasts', id: broadcast.id, data: { status: sent.totalDocs > 0 ? 'sent' : 'failed', completedAt: new Date().toISOString() }, req, overrideAccess: true, depth: 0 })
      return true
    })
    if (finished) completed += 1
  }
  return completed
}

/**
 * Вызывается планировщиком уведомлений раз в минуту. Аренда в notification-job-state
 * не даёт двум прогонам отправить одно письмо дважды; захват письма до отправки
 * защищает от гонки с остановкой рассылки.
 */
export async function runEmailBroadcastJobs(payload: Payload, { deadline = Date.now() + 60_000 }: { deadline?: number } = {}): Promise<JobResult> {
  const result: JobResult = { skipped: false, sent: 0, failed: 0, retried: 0, skippedRecipients: 0, completed: 0 }
  const claim = randomUUID()
  const job = await transact(payload, async (req) => {
    await lock(req, 0)
    const found = await payload.find({ collection: 'notification-job-state', where: { key: { equals: JOB_KEY } }, limit: 1, req, overrideAccess: true, depth: 0 })
    const existing = found.docs[0]
    if (existing && Date.parse(existing.leaseUntil) > Date.now()) return null
    const data = { key: JOB_KEY, leaseUntil: new Date(Date.now() + 300_000).toISOString(), claimToken: claim }
    return existing ? payload.update({ collection: 'notification-job-state', id: existing.id, data, req, overrideAccess: true, depth: 0 }) : payload.create({ collection: 'notification-job-state', data, req, overrideAccess: true, depth: 0 })
  })
  if (!job) return { ...result, skipped: true }
  try {
    await payload.update({ collection: 'email-broadcast-deliveries', where: { and: [{ status: { equals: 'processing' } }, { nextAttemptAt: { less_than_equal: new Date().toISOString() } }, { attempts: { greater_than_equal: MAX_BROADCAST_ATTEMPTS } }] }, data: { status: 'failed', claimToken: null, lastError: 'timeout' }, overrideAccess: true, depth: 0 })
    if (!emailTransportReady(payload)) {
      if (!transportWarningShown) {
        transportWarningShown = true
        logger.warn('Email broadcasts are waiting: outgoing email is not configured')
      }
      return result
    }
    const due = await payload.find({ collection: 'email-broadcast-deliveries', where: { and: [{ status: { in: ['pending', 'processing'] } }, { nextAttemptAt: { less_than_equal: new Date().toISOString() } }, { attempts: { less_than: MAX_BROADCAST_ATTEMPTS } }] }, sort: 'nextAttemptAt', limit: SENDS_PER_RUN, depth: 0, overrideAccess: true })
    const replyTo = due.docs.length ? await replyToAddress(payload) : undefined
    for (const candidate of due.docs) {
      // Запас на таймаут SMTP-сокета: прогон обязан закончиться до таймаута планировщика.
      if (Date.now() >= deadline - 25_000) break
      const token = randomUUID()
      const delivery = await transact(payload, async (req) => {
        await lock(req, -candidate.id)
        // Ученика могли удалить вместе с доставками: пропускаем письмо, а не обрываем прогон.
        const fresh = await payload.findByID({ collection: 'email-broadcast-deliveries', id: candidate.id, req, overrideAccess: true, depth: 0, disableErrors: true })
        if (!fresh || !['pending', 'processing'].includes(fresh.status) || Date.parse(fresh.nextAttemptAt) > Date.now() || fresh.attempts >= MAX_BROADCAST_ATTEMPTS) return null
        return payload.update({ collection: 'email-broadcast-deliveries', id: fresh.id, data: { status: 'processing', attempts: fresh.attempts + 1, claimToken: token, nextAttemptAt: new Date(Date.now() + 300_000).toISOString() }, req, overrideAccess: true, depth: 0 })
      })
      if (!delivery) continue
      const userId = relationId(delivery.user)
      const [broadcast, users, preferences] = await Promise.all([
        payload.find({ collection: 'email-broadcasts', where: { id: { equals: relationId(delivery.broadcast) } }, limit: 1, depth: 0, overrideAccess: true }),
        payload.find({ collection: 'users', where: { id: { equals: userId } }, select: { email: true, firstName: true, isActive: true }, limit: 1, depth: 0, overrideAccess: true }),
        payload.find({ collection: 'notification-preferences', where: { user: { equals: userId } }, select: { emailBroadcastsEnabled: true }, limit: 1, depth: 0, overrideAccess: true }),
      ])
      const source = broadcast.docs[0]
      const user = users.docs[0]
      const skip = source?.status !== 'sending' ? 'cancelled'
        : !user || user.isActive === false ? 'inactive'
          : !user.email?.includes('@') ? 'no_email'
            : preferences.docs[0]?.emailBroadcastsEnabled === false ? 'unsubscribed' : null
      let sendError: unknown = null
      if (!skip && source && user) {
        try {
          await payload.sendEmail(broadcastMessage(source, { id: user.id, email: user.email, firstName: user.firstName }, replyTo))
        } catch (error) {
          sendError = error ?? new Error('unknown send failure')
        }
      }
      const outcome = broadcastSendOutcome(skip ? null : sendError, delivery.attempts)
      const status = skip === 'cancelled' ? 'cancelled' : skip ? 'skipped' : outcome.status
      await transact(payload, async (req) => {
        await lock(req, -delivery.id)
        const fresh = await payload.findByID({ collection: 'email-broadcast-deliveries', id: delivery.id, req, overrideAccess: true, depth: 0, disableErrors: true })
        if (!fresh || fresh.claimToken !== token) return
        await payload.update({
          collection: 'email-broadcast-deliveries', id: delivery.id,
          data: {
            status,
            claimToken: null,
            lastError: skip ?? outcome.error,
            // Почта лежит целиком — попытку получателю возвращаем.
            ...(!skip && outcome.transportDown ? { attempts: Math.max(0, delivery.attempts - 1) } : {}),
            nextAttemptAt: new Date(Date.now() + (skip ? 0 : outcome.retryDelay)).toISOString(),
            ...(status === 'sent' ? { sentAt: new Date().toISOString() } : {}),
          },
          req, overrideAccess: true, depth: 0,
        })
      })
      if (status === 'sent') result.sent += 1
      else if (status === 'pending') result.retried += 1
      else if (status === 'failed') result.failed += 1
      else result.skippedRecipients += 1
      if (sendError) {
        const attrs = { 'broadcast.id': relationId(delivery.broadcast), 'delivery.id': delivery.id, 'email.error': outcome.error ?? 'unknown', 'delivery.attempts': delivery.attempts }
        logger.warn('Email broadcast delivery was not accepted', attrs)
        // Отказ одного адреса — не дефект платформы, а недоступная почта — дефект: о ней одно событие в полчаса.
        if (outcome.transportDown) captureThrottled('smtp-transport-down', 30 * 60_000, sendError, { message: 'Рассылка приостановлена: почтовый сервер недоступен или не принял логин', tags: { component: 'smtp' }, attributes: { 'email.error': outcome.error ?? 'unknown' }, fingerprint: ['smtp-transport-down'] })
      }
      // Почтовый сервер недоступен целиком: остальные письма прогона лишь потратили бы попытки.
      if (sendError && outcome.transportDown) break
    }
    result.completed = await finishBroadcasts(payload)
    return result
  } finally {
    await payload.update({ collection: 'notification-job-state', where: { and: [{ id: { equals: job.id } }, { claimToken: { equals: claim } }] }, data: { leaseUntil: new Date().toISOString() }, overrideAccess: true, depth: 0 })
  }
}
