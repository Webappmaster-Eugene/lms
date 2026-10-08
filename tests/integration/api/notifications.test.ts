import { createECDH, createHash, randomBytes } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, initTransaction, killTransaction, commitTransaction, type Payload } from 'payload'
import webPush from 'web-push'
import { GET as settingsGET, PATCH as settingsPATCH } from '@/app/api/push/settings/route'
import { POST as subscribePOST, DELETE as subscribeDELETE } from '@/app/api/push/subscriptions/route'
import { POST as pushTest } from '@/app/api/push/test/route'
import { POST as jobPOST } from '@/app/api/internal/notifications/run/route'
import { changeNotificationPreferences, getNotificationPreferences, recordLearningActivity, runNotificationJobs } from '@/server/notification-service'
import { sendEncryptedPush } from '@/server/push-transport'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, uid, type TestUser } from '../helpers/payload'

vi.mock('@/server/push-transport', async (original) => ({ ...await original<typeof import('@/server/push-transport')>(), sendEncryptedPush: vi.fn(async () => 201) }))

let payload: Payload
let student: TestUser
let other: TestUser
let admin: TestUser
let token: string
let otherToken: string
let subscriptionId: number
const recipient = createECDH('prime256v1'); recipient.generateKeys()
const subscription = { endpoint: `https://fcm.googleapis.com/fcm/send/${uid('push')}`, keys: { p256dh: recipient.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } }
const request = (path: string, method = 'GET', body?: unknown, auth = token, origin?: string) => new Request(`http://lms.test/api/${path}`, { method, headers: { ...(auth ? { Authorization: `JWT ${auth}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
const delivery = async (notificationId: number) => (await payload.find({ collection: 'notification-deliveries', where: { notification: { equals: notificationId } }, depth: 0, limit: 1 })).docs[0]
const notify = () => payload.create({ collection: 'notifications', data: { user: student.id, title: uid('message'), message: 'Учебное уведомление', type: 'info', link: '/profile' } })
async function dispatch(notificationId: number, processed: (row: Awaited<ReturnType<typeof delivery>>) => boolean = (row) => Boolean(row && row.status !== 'pending' && row.status !== 'processing')) {
  // Schema/access suites leave real queued fixture rows. Exercise the bounded worker until this owner is reached.
  for (let batch = 0; batch < 20; batch += 1) {
    await runNotificationJobs(payload)
    const row = await delivery(notificationId)
    if (processed(row)) return row
  }
  throw new Error(`Delivery ${notificationId} was not reached in twenty bounded batches`)
}

beforeAll(async () => {
  const keys = webPush.generateVAPIDKeys()
  vi.stubEnv('PUSH_VAPID_PUBLIC_KEY', keys.publicKey)
  vi.stubEnv('PUSH_VAPID_PRIVATE_KEY', keys.privateKey)
  vi.stubEnv('PUSH_VAPID_SUBJECT', 'mailto:push@lms.test')
  payload = await getTestPayload()
  student = await createStudent(payload)
  other = await createStudent(payload)
  admin = await createAdmin(payload)
  token = await login(payload, student)
  otherToken = await login(payload, other)
  await createCourseTree(payload, { lessons: 1 })
  // Other owners can have older work. This fixture guarantees a batch boundary even in an isolated run.
  const staleEndpoint = `https://fcm.googleapis.com/fcm/send/${uid('stale')}`
  const staleSubscription = await payload.create({ collection: 'push-subscriptions', data: { user: other.id, endpoint: staleEndpoint, endpointHash: createHash('sha256').update(staleEndpoint).digest('hex'), p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, sessionHash: '0'.repeat(64), enabled: true } })
  for (let index = 0; index < 12; index += 1) {
    const notification = await payload.create({ collection: 'notifications', data: { user: other.id, title: uid('older-work'), message: 'Изолированная старая подписка', type: 'info' }, context: { skipHooks: true } })
    await payload.create({ collection: 'notification-deliveries', data: { user: other.id, notification: notification.id, subscription: staleSubscription.id, status: 'pending', attempts: 0, nextAttemptAt: new Date(Date.now() - 60_000).toISOString() } })
  }
})

afterAll(async () => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  for (const user of [student, other, admin]) if (user) await payload.delete({ collection: 'users', id: user.id })
})
afterEach(() => { vi.useRealTimers() })

describe('реальные уведомления, подписки и scheduler в PostgreSQL', () => {
  it('requires authentication, rejects foreign Origin and keeps preference internals private', async () => {
    expect((await settingsGET(request('push/settings', 'GET', undefined, ''))).status).toBe(401)
    expect((await settingsPATCH(request('push/settings', 'PATCH', { remindersEnabled: false }, token, 'https://evil.example'))).status).toBe(403)
    const response = await settingsGET(request('push/settings'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ preferences: { pushEnabled: false, remindersEnabled: true, timezone: 'Europe/Moscow', reminderHour: 18 }, pushConfigured: true, devicesCount: 0 })
    expect((await rest('GET', '/notification-preferences', { token })).status).toBe(403)
    expect((await settingsPATCH(request('push/settings', 'PATCH', { timezone: 'Bad/Zone' }))).status).toBe(400)
    expect((await settingsPATCH(request('push/settings', 'PATCH', { reminderHour: 23 }))).status).toBe(400)
  })
  it('registers one owned browser device, refuses a different account claiming it and rejects SSRF', async () => {
    expect((await subscribePOST(request('push/subscriptions', 'POST', subscription))).status).toBe(200)
    const existing = (await payload.find({ collection: 'push-subscriptions', where: { user: { equals: student.id } }, depth: 0 })).docs[0]
    expect(existing).toBeDefined()
    subscriptionId = existing.id
    expect(existing.sessionHash).toMatch(/^[a-f0-9]{64}$/)
    expect((await subscribePOST(request('push/subscriptions', 'POST', subscription, otherToken))).status).toBe(409)
    expect((await subscribePOST(request('push/subscriptions', 'POST', { ...subscription, endpoint: 'https://127.0.0.1/private' }))).status).toBe(400)
    expect((await subscribeDELETE(request('push/subscriptions', 'DELETE', { endpoint: subscription.endpoint }, otherToken))).status).toBe(200)
    expect((await payload.findByID({ collection: 'push-subscriptions', id: subscriptionId, depth: 0 })).user).toBe(student.id)
    const response = await settingsGET(request('push/settings'))
    const body = await response.json()
    expect(body).toMatchObject({ preferences: { pushEnabled: true }, devicesCount: 1 })
    expect(JSON.stringify(body)).not.toContain(subscription.endpoint)
    expect(JSON.stringify(body)).not.toContain(subscription.keys.auth)
    expect((await rest('GET', '/push-subscriptions', { token })).status).toBe(403)
  })
  it('allows an administrator to send a notification, students can only mark their own read', async () => {
    const adminToken = await login(payload, admin)
    const created = await rest('POST', '/notifications', { token: adminToken, body: { user: student.id, title: 'Объявление преподавателя', message: 'Новый материал', type: 'info', link: '/profile' } })
    expect(created.status).toBe(201)
    const doc = created.json.doc
    if (!doc || typeof doc !== 'object' || !('id' in doc) || typeof doc.id !== 'number') throw new Error('Notification creation returned no document')
    const id = doc.id
    const changed = await rest('PATCH', `/notifications/${id}`, { token, body: { isRead: true, user: other.id, title: 'Подмена', message: 'Подмена', type: 'achievement', link: 'https://evil.example' } })
    expect(changed.status).toBe(200)
    expect(await payload.findByID({ collection: 'notifications', id, depth: 0 })).toMatchObject({ user: student.id, title: 'Объявление преподавателя', message: 'Новый материал', type: 'info', link: '/profile', isRead: true })
    expect([403, 404]).toContain((await rest('PATCH', `/notifications/${id}`, { token: otherToken, body: { isRead: true } })).status)
    expect((await rest('POST', '/notifications', { token, body: { user: student.id, title: 'Подмена', message: 'Подмена', type: 'info' } })).status).toBe(403)
    expect(await delivery(id)).toMatchObject({ status: 'pending', attempts: 0, user: student.id })
  })
  it('commits notification and durable outbox together; rollback leaves neither', async () => {
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    const title = uid('rolled-back')
    await payload.create({ collection: 'notifications', data: { user: student.id, title, message: 'Не должно сохраниться', type: 'info' }, req })
    await killTransaction(req)
    expect((await payload.count({ collection: 'notifications', where: { title: { equals: title } } })).totalDocs).toBe(0)
    expect((await payload.find({ collection: 'notification-deliveries', where: { 'notification.title': { equals: title } } })).docs).toEqual([])
  })
  it('limits even concurrent explicit test sends to one per minute atomically', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => pushTest(request('push/test', 'POST'))))
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1)
    expect(responses.filter((response) => response.status === 429)).toHaveLength(7)
  })
  it('delivers outside the hook transaction and recovers final-attempt abandoned claims', async () => {
    vi.mocked(sendEncryptedPush).mockResolvedValue(201)
    const notification = await notify()
    await dispatch(notification.id)
    expect(await delivery(notification.id)).toMatchObject({ status: 'sent', attempts: 1, lastStatusCode: 201 })
    const abandoned = await notify()
    const row = await delivery(abandoned.id)
    await payload.update({ collection: 'notification-deliveries', id: row.id, data: { status: 'processing', attempts: 5, nextAttemptAt: new Date(Date.now() - 1000).toISOString(), claimToken: 'abandoned' } })
    await dispatch(abandoned.id)
    expect(await delivery(abandoned.id)).toMatchObject({ status: 'failed', attempts: 5, claimToken: null })
  })
  it('disables a gone provider subscription after 410 without endless retries', async () => {
    vi.mocked(sendEncryptedPush).mockResolvedValue(410)
    const notification = await notify()
    await dispatch(notification.id)
    expect(await delivery(notification.id)).toMatchObject({ status: 'failed', attempts: 1, lastStatusCode: 410 })
    expect((await payload.findByID({ collection: 'push-subscriptions', id: subscriptionId })).enabled).toBe(false)
    expect((await subscribePOST(request('push/subscriptions', 'POST', subscription))).status).toBe(200)
  })
  it('retries temporary provider outages but cancels queued pushes after opt-out', async () => {
    vi.mocked(sendEncryptedPush).mockResolvedValue(503)
    const notification = await notify()
    await dispatch(notification.id, (row) => Boolean(row && row.attempts > 0))
    expect(await delivery(notification.id)).toMatchObject({ status: 'pending', attempts: 1, lastStatusCode: 503 })
    const queued = await notify()
    await changeNotificationPreferences(payload, student, { pushEnabled: false })
    vi.mocked(sendEncryptedPush).mockClear()
    await dispatch(queued.id)
    expect(await delivery(queued.id)).toMatchObject({ status: 'cancelled' })
    expect(sendEncryptedPush).not.toHaveBeenCalled()
    await changeNotificationPreferences(payload, student, { pushEnabled: true })
  })
  it('rejects browser calls to the protected job and prevents duplicate reminder runs', async () => {
    expect((await jobPOST(request('internal/notifications/run', 'POST'))).status).toBe(403)
    const now = new Date(); now.setUTCHours(15, 0, 0, 0)
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
    // Moving the clock earlier must not preserve the previous real-time lease.
    await payload.update({ collection: 'notification-job-state', where: { key: { equals: 'notifications' } }, data: { leaseUntil: new Date(now.getTime() - 1000).toISOString() } })
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    const prefs = await getNotificationPreferences(req, student.id)
    await payload.update({ collection: 'notification-preferences', id: prefs.id, data: { lastLearningAt: new Date(now.getTime() - 4 * 86_400_000).toISOString(), remindersEnabled: true, reminderStage: 0, lastReminderAt: null }, req })
    await commitTransaction(req)
    vi.mocked(sendEncryptedPush).mockResolvedValue(201)
    const runs = await Promise.all([runNotificationJobs(payload), runNotificationJobs(payload)])
    expect(runs.filter((run) => run.skipped)).toHaveLength(1)
    expect((await payload.count({ collection: 'notifications', where: { user: { equals: student.id }, type: { equals: 'learning_reminder' } } })).totalDocs).toBe(1)
    await runNotificationJobs(payload)
    expect((await payload.count({ collection: 'notifications', where: { user: { equals: student.id }, type: { equals: 'learning_reminder' } } })).totalDocs).toBe(1)
    vi.useRealTimers()
  })
  it('resets inactivity stages only through a genuine learning event and respects monotonic time', async () => {
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    await recordLearningActivity(req, student.id, new Date())
    const current = await getNotificationPreferences(req, student.id)
    expect(current.reminderStage).toBe(0)
    expect(current.lastReminderAt).toBeNull()
    await recordLearningActivity(req, student.id, new Date(Date.now() - 5 * 86_400_000))
    expect((await getNotificationPreferences(req, student.id)).lastLearningAt).toBe(current.lastLearningAt)
    await commitTransaction(req)
  })
  it('revoked login cannot receive a queued push on the shared device', async () => {
    const notification = await notify()
    expect((await rest('POST', '/users/logout', { token })).status).toBe(200)
    vi.mocked(sendEncryptedPush).mockClear()
    await dispatch(notification.id)
    expect(await delivery(notification.id)).toMatchObject({ status: 'cancelled' })
    expect(sendEncryptedPush).not.toHaveBeenCalled()
    expect((await payload.findByID({ collection: 'push-subscriptions', id: subscriptionId })).enabled).toBe(false)
  })
})
