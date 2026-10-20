import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { POST as createPOST } from '@/app/api/manage/broadcasts/route'
import { DELETE as broadcastDELETE, PATCH as broadcastPATCH } from '@/app/api/manage/broadcasts/[id]/route'
import { POST as sendPOST } from '@/app/api/manage/broadcasts/[id]/send/route'
import { POST as cancelPOST } from '@/app/api/manage/broadcasts/[id]/cancel/route'
import { POST as testPOST } from '@/app/api/manage/broadcasts/[id]/test/route'
import { GET as unsubscribeGET, POST as unsubscribePOST } from '@/app/api/email/unsubscribe/route'
import { GET as settingsGET } from '@/app/api/push/settings/route'
import { emailBroadcastConsent } from '@/server/broadcasts/consent'
import { resolveBroadcastAudience, runEmailBroadcastJobs } from '@/server/broadcasts/service'
import { createUnsubscribeToken } from '@/server/broadcasts/unsubscribe-token'
import type { EmailBroadcastDelivery } from '@/payload-types'
import { captureEmails, createAdmin, createStudent, getTestPayload, login, type CapturedEmail, type TestUser } from '../helpers/payload'

type Sent = CapturedEmail & { headers?: Record<string, string>; replyTo?: string }

let payload: Payload
let admin: TestUser
let adminToken: string
let student: TestUser
let optedOut: TestUser
let inactive: TestUser
let mail: ReturnType<typeof captureEmails>
let originalAdapterName: string
let originalContactEmail: string | null | undefined

const json = (path: string, method: string, body?: unknown, token: string | null = adminToken, headers: Record<string, string> = {}) => new Request(`http://lms.test/api/${path}`, {
  method,
  headers: { ...(token ? { Authorization: `JWT ${token}` } : {}), 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body ?? {}),
})
const context = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })
const form = (fields: Record<string, string>, query = '') => new Request(`http://lms.test/api/email/unsubscribe${query}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
})

async function createDraft(recipients: number[], extra: Record<string, unknown> = {}): Promise<number> {
  const response = await createPOST(json('manage/broadcasts', 'POST', { subject: 'Новый курс по Node.js', body: 'Курс уже на **платформе**.\n\nСмотрите https://lms.test/courses', audience: 'selected', recipients, ...extra }))
  expect(response.status).toBe(201)
  return ((await response.json()) as { doc: { id: number } }).doc.id
}

const deliveries = async (broadcastId: number) => (await payload.find({ collection: 'email-broadcast-deliveries', where: { broadcast: { equals: broadcastId } }, depth: 0, limit: 100, overrideAccess: true })).docs
const broadcast = (id: number) => payload.findByID({ collection: 'email-broadcasts', id, depth: 0, overrideAccess: true })

async function releaseLease() {
  await payload.update({ collection: 'notification-job-state', where: { key: { equals: 'email-broadcasts' } }, data: { leaseUntil: new Date(Date.now() - 1000).toISOString() }, overrideAccess: true })
}

/** Другие наборы тестов могут оставить свои письма в очереди — крутим задачу, пока не дойдёт до нашего. */
async function dispatch(broadcastId: number, done: (rows: EmailBroadcastDelivery[]) => boolean = (rows) => rows.every((row) => !['pending', 'processing'].includes(row.status))) {
  for (let run = 0; run < 15; run += 1) {
    await releaseLease()
    await runEmailBroadcastJobs(payload)
    const rows = await deliveries(broadcastId)
    if (done(rows)) return rows
  }
  throw new Error(`Рассылка ${broadcastId} не обработана за 15 прогонов`)
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload, { firstName: 'Админ' })
  adminToken = await login(payload, admin)
  student = await createStudent(payload, { firstName: 'Мария' })
  optedOut = await createStudent(payload)
  inactive = await createStudent(payload, { isActive: false })
  // Без SMTP Payload ставит консольный адаптер; рассылка его честно не считает почтой.
  originalAdapterName = payload.email.name
  ;(payload.email as { name: string }).name = 'integration-smtp'
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  originalContactEmail = settings.contacts?.email
  await payload.updateGlobal({ slug: 'site-settings', data: { contacts: { ...settings.contacts, email: 'support@lms.test' } }, depth: 0 })
})

beforeEach(() => {
  mail?.restore()
  mail = captureEmails(payload)
})

afterAll(async () => {
  mail?.restore()
  ;(payload.email as { name: string }).name = originalAdapterName
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  await payload.updateGlobal({ slug: 'site-settings', data: { contacts: { ...settings.contacts, email: originalContactEmail ?? null } }, depth: 0 })
  for (const user of [admin, student, optedOut, inactive]) if (user) await payload.delete({ collection: 'users', id: user.id })
})

describe('email-рассылки: права и черновики', () => {
  it('управляет только администратор', async () => {
    const studentToken = await login(payload, student)
    expect((await createPOST(json('manage/broadcasts', 'POST', {}, studentToken))).status).toBe(403)
    expect((await createPOST(json('manage/broadcasts', 'POST', {}, null))).status).toBe(401)
    const cookie = (headers: Record<string, string>) => createPOST(new Request('http://lms.test/api/manage/broadcasts', { method: 'POST', headers: { Cookie: `payload-token=${adminToken}`, 'Content-Type': 'application/json', ...headers }, body: '{}' }))
    // Со страницы платформы кука работает: дальше срабатывает уже проверка полей.
    expect((await cookie({ Origin: 'http://lms.test', 'Sec-Fetch-Site': 'same-origin' })).status).toBe(400)
    // Та же кука с чужой страницы или без Origin — подделка запроса.
    expect([401, 403]).toContain((await cookie({ Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' })).status)
    expect([401, 403]).toContain((await cookie({})).status)
  })

  it('проверяет поля и кнопку', async () => {
    expect((await createPOST(json('manage/broadcasts', 'POST', { subject: '', body: 'x', audience: 'all' }))).status).toBe(400)
    const halfButton = await createPOST(json('manage/broadcasts', 'POST', { subject: 'Тема', body: 'x', audience: 'all', ctaLabel: 'Открыть' }))
    expect(halfButton.status).toBe(400)
    expect((await halfButton.json()).error).toContain('кнопки')
    expect((await createPOST(json('manage/broadcasts', 'POST', { subject: 'Тема', body: 'x', audience: 'all', ctaLabel: 'Открыть', ctaUrl: 'javascript:alert(1)' }))).status).toBe(400)
    expect((await createPOST(json('manage/broadcasts', 'POST', { subject: 'Тема', body: 'x', audience: 'selected', recipients: [] }))).status).toBe(400)
  })

  it('черновик можно менять и удалять, запущенную рассылку — нет', async () => {
    const id = await createDraft([student.id])
    const patched = await broadcastPATCH(json(`manage/broadcasts/${id}`, 'PATCH', { subject: 'Исправленная тема', body: 'Текст', audience: 'selected', recipients: [student.id] }), context(id))
    expect(patched.status).toBe(200)
    expect((await broadcast(id)).subject).toBe('Исправленная тема')
    expect((await broadcastDELETE(json(`manage/broadcasts/${id}`, 'DELETE'), context(id))).status).toBe(200)
    expect((await payload.find({ collection: 'email-broadcasts', where: { id: { equals: id } }, overrideAccess: true })).totalDocs).toBe(0)
    expect((await broadcastPATCH(json('manage/broadcasts/999999999', 'PATCH', { subject: 'x', body: 'x', audience: 'all' }), context(999999999))).status).toBe(404)
  })
})

describe('email-рассылки: отписка', () => {
  it('GET ничего не меняет, форма отписывает и возвращает подписку', async () => {
    const token = createUnsubscribeToken(optedOut.id)
    const get = unsubscribeGET(new Request(`http://lms.test/api/email/unsubscribe?token=${encodeURIComponent(token)}`))
    expect(get.status).toBe(303)
    expect(get.headers.get('location')).toBe(`/unsubscribe?token=${encodeURIComponent(token)}`)
    expect(await emailBroadcastConsent(payload, optedOut.id)).toBe(true)

    const off = await unsubscribePOST(form({ token, action: 'unsubscribe' }))
    expect(off.status).toBe(303)
    expect(off.headers.get('location')).toContain('done=unsubscribed')
    expect(await emailBroadcastConsent(payload, optedOut.id)).toBe(false)

    const on = await unsubscribePOST(form({ token, action: 'resubscribe' }))
    expect(on.headers.get('location')).toContain('done=resubscribed')
    expect(await emailBroadcastConsent(payload, optedOut.id)).toBe(true)

    // RFC 8058: кнопка почтового клиента — POST с токеном в адресе.
    const oneClick = await unsubscribePOST(form({ 'List-Unsubscribe': 'One-Click' }, `?token=${encodeURIComponent(token)}`))
    expect(oneClick.status).toBe(200)
    expect(await emailBroadcastConsent(payload, optedOut.id)).toBe(false)
  })

  it('чужая или испорченная ссылка не меняет ничего', async () => {
    const forged = `${student.id}.${createUnsubscribeToken(optedOut.id).split('.')[1]}`
    expect((await unsubscribePOST(form({ 'List-Unsubscribe': 'One-Click' }, `?token=${encodeURIComponent(forged)}`))).status).toBe(400)
    const page = await unsubscribePOST(form({ token: forged, action: 'unsubscribe' }))
    expect(page.headers.get('location')).toContain('error=invalid')
    expect(await emailBroadcastConsent(payload, student.id)).toBe(true)
  })

  it('настройки уведомлений показывают согласие на рассылки', async () => {
    const response = await settingsGET(new Request('http://lms.test/api/push/settings', { headers: { Authorization: `JWT ${await login(payload, optedOut)}` } }))
    expect((await response.json()).preferences).toMatchObject({ emailBroadcastsEnabled: false })
  })
})

describe('email-рассылки: очередь и отправка', () => {
  it('исключает отписавшихся и отключённых, отправляет письмо с отпиской и ответом в поддержку', async () => {
    const id = await createDraft([student.id, optedOut.id, inactive.id], { ctaLabel: 'Открыть курс', ctaUrl: '/courses' })
    const audience = await resolveBroadcastAudience(payload, await broadcast(id))
    expect(audience).toEqual({ userIds: [student.id], excluded: 2 })

    const queued = await sendPOST(json(`manage/broadcasts/${id}/send`, 'POST'), context(id))
    expect(queued.status).toBe(200)
    expect((await queued.json()).doc).toMatchObject({ status: 'sending', recipientsTotal: 1, excludedCount: 2 })
    expect((await sendPOST(json(`manage/broadcasts/${id}/send`, 'POST'), context(id))).status).toBe(409)
    expect((await broadcastPATCH(json(`manage/broadcasts/${id}`, 'PATCH', { subject: 'x', body: 'x', audience: 'all' }), context(id))).status).toBe(409)

    const [row] = await dispatch(id)
    expect(row).toMatchObject({ status: 'sent', attempts: 1, claimToken: null })
    expect(row?.sentAt).toBeTruthy()
    const message = mail.sent.find((item) => item.to === student.email) as Sent | undefined
    expect(message?.subject).toBe('Новый курс по Node.js')
    expect(message?.replyTo).toBe('support@lms.test')
    expect(message?.html).toContain('Привет, Мария!')
    expect(message?.html).toContain('href="http://lms.test/courses"')
    expect(message?.text).toContain('Отписаться от рассылок: http://lms.test/unsubscribe?token=')
    expect(message?.headers?.['List-Unsubscribe']).toBe(`<http://lms.test/api/email/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(student.id))}>`)
    expect(message?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(mail.sent.some((item) => item.to === optedOut.email || item.to === inactive.email)).toBe(false)
    expect(await broadcast(id)).toMatchObject({ status: 'sent' })
    expect((await broadcast(id)).completedAt).toBeTruthy()
  })

  it('отписка после запуска останавливает письмо этому ученику', async () => {
    const id = await createDraft([student.id])
    expect((await sendPOST(json(`manage/broadcasts/${id}/send`, 'POST'), context(id))).status).toBe(200)
    await unsubscribePOST(form({ token: createUnsubscribeToken(student.id), action: 'unsubscribe' }))
    try {
      const [row] = await dispatch(id)
      expect(row).toMatchObject({ status: 'skipped', lastError: 'unsubscribed' })
      expect(mail.sent.some((item) => item.to === student.email)).toBe(false)
      expect(await broadcast(id)).toMatchObject({ status: 'failed' })
    } finally {
      await unsubscribePOST(form({ token: createUnsubscribeToken(student.id), action: 'resubscribe' }))
    }
  })

  it('отказ адреса — окончательная ошибка, недоступный SMTP — пауза без списания попытки', async () => {
    const rejected = await createDraft([student.id])
    await sendPOST(json(`manage/broadcasts/${rejected}/send`, 'POST'), context(rejected))
    vi.mocked(payload.sendEmail).mockRejectedValueOnce(Object.assign(new Error('550 mailbox unavailable student@lms.test'), { responseCode: 550 }))
    const [failed] = await dispatch(rejected)
    expect(failed).toMatchObject({ status: 'failed', lastError: 'smtp_550' })
    expect(await broadcast(rejected)).toMatchObject({ status: 'failed' })

    const flaky = await createDraft([student.id])
    await sendPOST(json(`manage/broadcasts/${flaky}/send`, 'POST'), context(flaky))
    vi.mocked(payload.sendEmail).mockRejectedValueOnce(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNECTION' }))
    const [retry] = await dispatch(flaky, (rows) => rows[0]?.lastError === 'network' && rows[0].status === 'pending')
    // Почтовый сервер лежит целиком: попытка получателю не засчитывается, отправка ждёт.
    expect(retry).toMatchObject({ status: 'pending', lastError: 'network', attempts: 0 })
    expect(Date.parse(retry?.nextAttemptAt ?? '')).toBeGreaterThan(Date.now() + 5 * 60_000)
    expect(await broadcast(flaky)).toMatchObject({ status: 'sending' })

    const cancelled = await cancelPOST(json(`manage/broadcasts/${flaky}/cancel`, 'POST'), context(flaky))
    expect(cancelled.status).toBe(200)
    expect((await deliveries(flaky))[0]).toMatchObject({ status: 'cancelled', lastError: 'cancelled' })
    expect(await broadcast(flaky)).toMatchObject({ status: 'cancelled' })
    expect((await cancelPOST(json(`manage/broadcasts/${flaky}/cancel`, 'POST'), context(flaky))).status).toBe(409)
  })

  it('без настроенной почты письма ждут, а не считаются отправленными', async () => {
    const id = await createDraft([student.id])
    await sendPOST(json(`manage/broadcasts/${id}/send`, 'POST'), context(id))
    ;(payload.email as { name: string }).name = 'console'
    try {
      await releaseLease()
      await runEmailBroadcastJobs(payload)
      expect((await deliveries(id))[0]).toMatchObject({ status: 'pending', attempts: 0 })
      expect((await testPOST(json(`manage/broadcasts/${id}/test`, 'POST'), context(id))).status).toBe(503)
    } finally {
      ;(payload.email as { name: string }).name = 'integration-smtp'
    }
    await dispatch(id)
    expect((await deliveries(id))[0]).toMatchObject({ status: 'sent' })
  })

  it('тест уходит только администратору и не попадает в статистику', async () => {
    const id = await createDraft([student.id])
    const response = await testPOST(json(`manage/broadcasts/${id}/test`, 'POST'), context(id))
    expect(response.status).toBe(200)
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0]).toMatchObject({ to: admin.email, subject: '[Тест] Новый курс по Node.js' })
    expect(await deliveries(id)).toEqual([])
    expect(await broadcast(id)).toMatchObject({ status: 'draft' })
  })

  it('параллельные прогоны не отправляют одно письмо дважды', async () => {
    const id = await createDraft([student.id])
    await sendPOST(json(`manage/broadcasts/${id}/send`, 'POST'), context(id))
    await releaseLease()
    const runs = await Promise.all([runEmailBroadcastJobs(payload), runEmailBroadcastJobs(payload)])
    expect(runs.filter((run) => run.skipped)).toHaveLength(1)
    await dispatch(id)
    expect(mail.sent.filter((item) => item.to === student.email)).toHaveLength(1)
  })
})
