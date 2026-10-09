// Payload CLI loads collection hooks outside React's server module condition.
import { createHash, randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type CollectionAfterChangeHook, type Payload, type PayloadRequest } from 'payload'
import type { NotificationPreference, PushSubscription, User } from '@/payload-types'
import { relationId } from '@/lib/relation-id'
import { childReq } from '@/lib/payload-req'
import { logger } from '@/lib/telemetry'
import { dueReminderStage, safeNotificationLink } from '@/lib/notification-policy'
import { authSessionHash } from '@/payload/hooks/authSessionRevocations'
import { notificationLinkIsVisible } from '@/server/notification-visibility'
import { getTrainerAccess } from '@/server/trainer-access'
import { getLearningAccess } from '@/server/learning-access'
import { deliveryOutcome } from '@/lib/notification-policy'
import { sendEncryptedPush, vapidConfiguration } from '@/server/push-transport'
import { collectAllPages } from '@/lib/paginate'
import { readVideoPositions } from '@/lib/learning-state'

export class NotificationError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
type TransactionAdapter = { sessions: Record<string | number, { db: Executor } | undefined> }

async function lock(req: PayloadRequest, key: number) {
  const id = await req.transactionID
  const db = id === undefined ? undefined : (req.payload.db as unknown as TransactionAdapter).sessions[id]?.db
  if (!db) throw new Error('Notifications require a database transaction')
  // FK inserts also lock Users: acquire the row before the activity lock, matching reward hooks.
  if (key > 0) await db.execute(sql`select id from users where id = ${key} for update`)
  await db.execute(sql`select pg_advisory_xact_lock(7206, ${key})`)
}

async function transact<T>(payload: Payload, operation: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  try { const result = await operation(req); await commitTransaction(req); return result } catch (error) { await killTransaction(req); throw error }
}

export async function getNotificationPreferences(req: PayloadRequest, userId: number): Promise<NotificationPreference> {
  const found = await req.payload.find({ collection: 'notification-preferences', where: { user: { equals: userId } }, req, overrideAccess: true, depth: 0, limit: 1 })
  if (found.docs[0]) return found.docs[0]
  // Bootstrap from actual existing learning history, never from login or opening settings.
  const user = await req.payload.findByID({ collection: 'users', id: userId, req, overrideAccess: true, depth: 0 })
  const [lessons, trainer, videoStates] = await Promise.all([
    req.payload.find({ collection: 'user-progress', where: { and: [{ user: { equals: userId } }, { isCompleted: { equals: true } }] }, select: { completedAt: true }, sort: '-completedAt', req, overrideAccess: true, depth: 0, limit: 1 }),
    req.payload.find({ collection: 'user-trainer-progress', where: { and: [{ user: { equals: userId } }, { isCompleted: { equals: true } }] }, select: { completedAt: true }, sort: '-completedAt', req, overrideAccess: true, depth: 0, limit: 1 }),
    collectAllPages(({ page, limit }) => req.payload.find({ collection: 'lesson-learning-states', where: { user: { equals: userId } }, select: { positions: true }, req, overrideAccess: true, depth: 0, page, limit }), { label: 'Начальная дата учебной активности' }),
  ])
  let lastAt = Date.parse(user.createdAt)
  for (const completedAt of [lessons.docs[0]?.completedAt, trainer.docs[0]?.completedAt]) if (completedAt) lastAt = Math.max(lastAt, Date.parse(completedAt))
  for (const state of videoStates) for (const position of Object.values(readVideoPositions(state.positions))) if (position.seconds > 0) lastAt = Math.max(lastAt, position.at)
  const lastLearningAt = new Date(Math.min(Date.now(), lastAt)).toISOString()
  return req.payload.create({ collection: 'notification-preferences', data: { user: userId, lastLearningAt, timezone: 'Europe/Moscow', reminderHour: 18 }, req, overrideAccess: true, depth: 0 })
}

export async function recordLearningActivity(req: PayloadRequest, userId: number, eventAt = new Date()): Promise<void> {
  await lock(req, userId)
  const prefs = await getNotificationPreferences(req, userId)
  const at = Math.min(Date.now(), eventAt.getTime())
  if (!Number.isFinite(at) || at <= Date.parse(prefs.lastLearningAt ?? '')) return
  await req.payload.update({ collection: 'notification-preferences', id: prefs.id, data: { lastLearningAt: new Date(at).toISOString(), reminderStage: 0, lastReminderAt: null }, req, overrideAccess: true, depth: 0 })
  // Pending reminders become stale as soon as studying resumes; dispatch checks this again.
}

export async function changeNotificationPreferences(payload: Payload, user: User, data: Partial<Pick<NotificationPreference, 'pushEnabled' | 'remindersEnabled' | 'timezone' | 'reminderHour'>>) {
  return transact(payload, async (req) => {
    await lock(req, user.id)
    const prefs = await getNotificationPreferences(req, user.id)
    return payload.update({ collection: 'notification-preferences', id: prefs.id, data, req, overrideAccess: true, depth: 0 })
  })
}

export async function notificationSettings(payload: Payload, user: User) {
  return transact(payload, async (req) => {
    await lock(req, user.id)
    const prefs = await getNotificationPreferences(req, user.id)
    const devices = await payload.count({ collection: 'push-subscriptions', where: { and: [{ user: { equals: user.id } }, { enabled: { equals: true } }] }, req, overrideAccess: true })
    const config = vapidConfiguration()
    return { preferences: { pushEnabled: prefs.pushEnabled ?? false, remindersEnabled: prefs.remindersEnabled ?? true, timezone: prefs.timezone, reminderHour: prefs.reminderHour }, vapidPublicKey: config?.publicKey ?? null, pushConfigured: config !== null, devicesCount: devices.totalDocs }
  })
}

export async function registerPush(payload: Payload, user: User, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, sid: string) {
  if (!vapidConfiguration()) throw new NotificationError('Пуш-уведомления ещё не настроены администратором', 503)
  return transact(payload, async (req) => {
    // One global endpoint lock prevents concurrent accounts claiming the same browser endpoint.
    await lock(req, 0)
    await lock(req, user.id)
    const endpointHash = createHash('sha256').update(subscription.endpoint).digest('hex')
    const found = await payload.find({ collection: 'push-subscriptions', where: { endpointHash: { equals: endpointHash } }, limit: 1, req, depth: 0, overrideAccess: true })
    const existing = found.docs[0]
    if (existing && relationId(existing.user) !== user.id) throw new NotificationError('Это устройство связано с другим аккаунтом. Отключите прежнюю подписку в браузере', 409)
    const count = await payload.count({ collection: 'push-subscriptions', where: { and: [{ user: { equals: user.id } }, { enabled: { equals: true } }] }, req, overrideAccess: true })
    if (!existing && count.totalDocs >= 10) throw new NotificationError('Достигнут лимит устройств. Отключите уведомления на одном из них', 409)
    const data = { user: user.id, endpointHash, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, sessionHash: authSessionHash(sid), enabled: true }
    if (existing) await payload.update({ collection: 'push-subscriptions', id: existing.id, data, req, overrideAccess: true, depth: 0 })
    else await payload.create({ collection: 'push-subscriptions', data, req, overrideAccess: true, depth: 0 })
    const prefs = await getNotificationPreferences(req, user.id)
    await payload.update({ collection: 'notification-preferences', id: prefs.id, data: { pushEnabled: true }, req, overrideAccess: true, depth: 0 })
  })
}

export async function unregisterPush(payload: Payload, user: User, endpoint: string) {
  return transact(payload, async (req) => {
    await lock(req, 0)
    const found = await payload.find({ collection: 'push-subscriptions', where: { and: [{ user: { equals: user.id } }, { endpointHash: { equals: createHash('sha256').update(endpoint).digest('hex') } }] }, limit: 1, req, overrideAccess: true, depth: 0 })
    const subscription = found.docs[0]
    if (!subscription) return
    await payload.delete({ collection: 'notification-deliveries', where: { subscription: { equals: subscription.id } }, req, overrideAccess: true })
    await payload.delete({ collection: 'push-subscriptions', id: subscription.id, req, overrideAccess: true })
  })
}

export async function queuePushTest(payload: Payload, user: User): Promise<void> {
  if (!vapidConfiguration()) throw new NotificationError('Пуш-уведомления ещё не настроены', 503)
  await transact(payload, async (req) => {
    await lock(req, user.id)
    const subscriptions = await payload.count({ collection: 'push-subscriptions', where: { and: [{ user: { equals: user.id } }, { enabled: { equals: true } }] }, req, overrideAccess: true })
    if (!subscriptions.totalDocs) throw new NotificationError('Сначала включите уведомления на устройстве', 409)
    const recent = await payload.count({ collection: 'notifications', where: { and: [{ user: { equals: user.id } }, { title: { equals: 'Уведомления работают' } }, { createdAt: { greater_than: new Date(Date.now() - 60_000).toISOString() } }] }, req, overrideAccess: true })
    if (recent.totalDocs) throw new NotificationError('Пробное уведомление уже отправлено. Подождите минуту', 429)
    const prefs = await getNotificationPreferences(req, user.id)
    if (!prefs.pushEnabled) throw new NotificationError('Сначала включите уведомления на устройстве', 409)
    await payload.create({ collection: 'notifications', data: { user: user.id, title: 'Уведомления работают', message: 'Это пробное уведомление MentorCareer. Напоминания можно настроить в профиле.', type: 'info', link: '/profile' }, req, overrideAccess: true })
  })
}

export const queueNotificationPush: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create' || req.context.skipHooks) return doc
  const userId = relationId(doc.user)
  if (!userId) return doc
  const prefs = await req.payload.find({ collection: 'notification-preferences', where: { user: { equals: userId } }, req, overrideAccess: true, depth: 0, limit: 1 })
  if (!prefs.docs[0]?.pushEnabled) return doc
  const subscriptions = await req.payload.find({ collection: 'push-subscriptions', where: { and: [{ user: { equals: userId } }, { enabled: { equals: true } }] }, req, overrideAccess: true, depth: 0, limit: 10 })
  for (const subscription of subscriptions.docs) await req.payload.create({ collection: 'notification-deliveries', data: { user: userId, notification: doc.id, subscription: subscription.id, nextAttemptAt: new Date().toISOString(), status: 'pending', attempts: 0 }, req: childReq(req, { queueingNotification: true }), overrideAccess: true, depth: 0 })
  return doc
}

async function validSubscriptionSession(payload: Payload, subscription: PushSubscription): Promise<boolean> {
  const user = await payload.findByID({ collection: 'users', id: relationId(subscription.user), depth: 0, overrideAccess: true })
  return user.isActive !== false && Boolean(user.sessions?.some((session) => session.id && authSessionHash(session.id) === subscription.sessionHash && Date.parse(session.expiresAt) > Date.now()))
}

export async function runNotificationJobs(payload: Payload): Promise<{ skipped: boolean; reminders: number; deliveries: number }> {
  const claim = randomUUID()
  const job = await transact(payload, async (req) => {
    await lock(req, 0)
    const found = await payload.find({ collection: 'notification-job-state', where: { key: { equals: 'notifications' } }, limit: 1, req, overrideAccess: true, depth: 0 })
    const existing = found.docs[0]
    if (existing && Date.parse(existing.leaseUntil) > Date.now()) return null
    const data = { key: 'notifications', leaseUntil: new Date(Date.now() + 300_000).toISOString(), claimToken: claim }
    return existing ? payload.update({ collection: 'notification-job-state', id: existing.id, data, req, overrideAccess: true, depth: 0 }) : payload.create({ collection: 'notification-job-state', data, req, overrideAccess: true, depth: 0 })
  })
  if (!job) return { skipped: true, reminders: 0, deliveries: 0 }
  let reminders = 0
  let deliveries = 0
  const deadline = Date.now() + 90_000
  try {
    const users = await payload.find({ collection: 'users', where: { and: [{ id: { greater_than: job.userCursor ?? 0 } }, { role: { equals: 'student' } }, { isActive: { not_equals: false } }] }, sort: 'id', limit: 100, depth: 0, overrideAccess: true })
    let processedUser = job.userCursor ?? 0
    for (const user of users.docs) {
      if (Date.now() >= deadline - 15_000) break
      await transact(payload, async (req) => {
        await lock(req, user.id)
        const prefs = await getNotificationPreferences(req, user.id)
        if (prefs.remindersEnabled === false) return
        const stage = dueReminderStage({ lastLearningAt: prefs.lastLearningAt ?? user.createdAt, lastReminderAt: prefs.lastReminderAt, reminderStage: prefs.reminderStage ?? 0, timezone: prefs.timezone, reminderHour: prefs.reminderHour })
        if (stage === null) return
        const policy = await getLearningAccess(payload, user, req)
        const accessible = await payload.count({ collection: 'lessons', where: policy.lessonWhere, req, overrideAccess: true })
        const viewerReq = childReq(req, {})
        viewerReq.user = { ...user, collection: 'users' }
        const completed = await payload.count({ collection: 'user-progress', where: { isCompleted: { equals: true } }, req: viewerReq, overrideAccess: false })
        const trainer = await getTrainerAccess(payload, user, req)
        const completedTasks = trainer.hasAccess ? await payload.count({ collection: 'user-trainer-progress', where: { and: [{ user: { equals: user.id } }, { task: { in: trainer.accessibleTaskIds } }, { isCompleted: { equals: true } }] }, req, overrideAccess: true }) : { totalDocs: 0 }
        if (completed.totalDocs >= accessible.totalDocs && completedTasks.totalDocs >= trainer.accessibleTaskIds.length) return
        await payload.create({ collection: 'notifications', data: { user: user.id, title: 'Продолжим обучение?', message: 'Небольшой шаг тоже помогает двигаться вперёд. Вернитесь к последнему уроку, когда вам удобно.', type: 'learning_reminder', link: '/' }, req, overrideAccess: true, depth: 0 })
        await payload.update({ collection: 'notification-preferences', id: prefs.id, data: { reminderStage: stage, lastReminderAt: new Date().toISOString() }, req, overrideAccess: true, depth: 0 })
        reminders += 1
      })
      processedUser = user.id
    }
    await payload.update({ collection: 'notification-deliveries', where: { and: [{ status: { equals: 'processing' } }, { nextAttemptAt: { less_than_equal: new Date().toISOString() } }, { attempts: { greater_than_equal: 5 } }] }, data: { status: 'failed', claimToken: null }, overrideAccess: true, depth: 0 })
    const due = vapidConfiguration() ? await payload.find({ collection: 'notification-deliveries', where: { and: [{ status: { in: ['pending', 'processing'] } }, { nextAttemptAt: { less_than_equal: new Date().toISOString() } }, { attempts: { less_than: 5 } }] }, sort: 'nextAttemptAt', limit: 10, depth: 0, overrideAccess: true }) : null
    for (const candidate of due?.docs ?? []) {
      if (Date.now() >= deadline - 10_000) break
      const token = randomUUID()
      const delivery = await transact(payload, async (req) => {
        await lock(req, -candidate.id)
        const fresh = await payload.findByID({ collection: 'notification-deliveries', id: candidate.id, req, overrideAccess: true, depth: 0 })
        if (!['pending', 'processing'].includes(fresh.status) || Date.parse(fresh.nextAttemptAt) > Date.now() || fresh.attempts >= 5) return null
        return payload.update({ collection: 'notification-deliveries', id: fresh.id, data: { status: 'processing', attempts: fresh.attempts + 1, claimToken: token, nextAttemptAt: new Date(Date.now() + 300_000).toISOString() }, req, overrideAccess: true, depth: 0 })
      })
      if (!delivery) continue
      const [subscription, notification, prefs] = await Promise.all([
        payload.findByID({ collection: 'push-subscriptions', id: relationId(delivery.subscription), depth: 0, overrideAccess: true }),
        payload.findByID({ collection: 'notifications', id: relationId(delivery.notification), depth: 0, overrideAccess: true }),
        payload.find({ collection: 'notification-preferences', where: { user: { equals: relationId(delivery.user) } }, depth: 0, overrideAccess: true, limit: 1 }),
      ])
      const preference = prefs.docs[0]
      const reminder = notification.type === 'learning_reminder'
      const staleReminder = reminder && (preference?.remindersEnabled === false || Date.parse(preference?.lastLearningAt ?? '') >= Date.parse(notification.createdAt) || Date.now() - Date.parse(notification.createdAt) > 86_400_000)
      const sessionValid = await validSubscriptionSession(payload, subscription)
      const materialVisible = await notificationLinkIsVisible(payload, relationId(delivery.user), notification.link)
      const cancelled = !materialVisible || !subscription.enabled || !preference?.pushEnabled || staleReminder || !sessionValid || relationId(subscription.user) !== relationId(delivery.user) || relationId(notification.user) !== relationId(delivery.user)
      const localHour = preference ? Number(new Intl.DateTimeFormat('en', { timeZone: preference.timezone, hour: 'numeric', hourCycle: 'h23' }).format(new Date())) : null
      if (!cancelled && reminder && localHour !== preference?.reminderHour) {
        await payload.update({ collection: 'notification-deliveries', where: { and: [{ id: { equals: delivery.id } }, { claimToken: { equals: token } }] }, data: { status: 'pending', attempts: delivery.attempts - 1, claimToken: null, nextAttemptAt: new Date(Date.now() + 1_800_000).toISOString() }, overrideAccess: true, depth: 0 })
        continue
      }
      let code = 0
      if (!cancelled) {
        try { code = await sendEncryptedPush(subscription, { title: notification.title, body: notification.message, url: safeNotificationLink(notification.link), tag: `lms-${notification.id}` }) } catch { logger.warn('Push delivery transport failed', { 'delivery.id': delivery.id }) }
      }
      await transact(payload, async (req) => {
        await lock(req, -delivery.id)
        const fresh = await payload.findByID({ collection: 'notification-deliveries', id: delivery.id, req, depth: 0, overrideAccess: true })
        if (fresh.claimToken !== token) return
        const outcome = deliveryOutcome(code, delivery.attempts)
        await payload.update({ collection: 'notification-deliveries', id: fresh.id, data: { status: cancelled ? 'cancelled' : outcome.status, nextAttemptAt: new Date(Date.now() + outcome.retryDelay).toISOString(), lastStatusCode: code, claimToken: null }, req, overrideAccess: true, depth: 0 })
        if (outcome.removeSubscription || !sessionValid) await payload.update({ collection: 'push-subscriptions', id: subscription.id, data: { enabled: false }, req, overrideAccess: true, depth: 0 })
      })
      deliveries += 1
    }
    const completedPage = processedUser === (users.docs.at(-1)?.id ?? processedUser)
    await payload.update({ collection: 'notification-job-state', where: { and: [{ id: { equals: job.id } }, { claimToken: { equals: claim } }] }, data: { userCursor: completedPage && !users.hasNextPage ? 0 : processedUser }, overrideAccess: true, depth: 0 })
    return { skipped: false, reminders, deliveries }
  } finally {
    await payload.update({ collection: 'notification-job-state', where: { and: [{ id: { equals: job.id } }, { claimToken: { equals: claim } }] }, data: { leaseUntil: new Date().toISOString() }, overrideAccess: true, depth: 0 })
  }
}
