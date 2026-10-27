import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { DELETE as broadcastDELETE } from '@/app/api/manage/broadcasts/[id]/route'
import { POST as testPOST } from '@/app/api/manage/broadcasts/[id]/test/route'
import { DELETE as unsubscribeDevice } from '@/app/api/push/subscriptions/route'
import { logger } from '@/lib/telemetry'
import { broadcastPreview, broadcastProblems, broadcastStatusCounts, validateBroadcastInput } from '@/server/broadcasts/service'
import type { EmailBroadcast, EmailBroadcastDelivery } from '@/payload-types'
import { captureEmails, createAdmin, createStudent, getTestPayload, login, uid, type TestUser } from '../helpers/payload'

/**
 * Страница рассылки (счётчики, проблемные адреса, предпросмотр), сбои почтового
 * сервера при тестовой отправке и отвязка устройства от пушей.
 */
let payload: Payload
let admin: TestUser
let adminToken: string
let originalAdapterName: string
let originalContactEmail: string | null | undefined

const json = (path: string, method: string, token: string = adminToken, body: unknown = {}) => new Request(`http://lms.test/api/${path}`, {
  method, headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const context = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })

async function broadcast(): Promise<EmailBroadcast> {
  return payload.create({ collection: 'email-broadcasts', data: { subject: `Рассылка ${uid()}`, body: 'Текст рассылки', audience: 'all', status: 'draft', createdBy: admin.id }, overrideAccess: true })
}
async function delivery(broadcastId: number, user: number, status: EmailBroadcastDelivery['status'], lastError?: string) {
  return payload.create({ collection: 'email-broadcast-deliveries', data: { broadcast: broadcastId, user, status, attempts: 1, nextAttemptAt: new Date().toISOString(), ...(lastError ? { lastError } : {}) }, overrideAccess: true })
}
async function setContactEmail(email: string | null) {
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
  await payload.updateGlobal({ slug: 'site-settings', data: { contacts: { ...settings.contacts, email } }, depth: 0 })
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload, { firstName: 'Админ' })
  adminToken = await login(payload, admin)
  originalAdapterName = payload.email.name
  originalContactEmail = (await payload.findGlobal({ slug: 'site-settings', depth: 0 })).contacts?.email
})
afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => {
  ;(payload.email as { name: string }).name = originalAdapterName
  await setContactEmail(originalContactEmail ?? null)
})

describe('страница рассылки: счётчики и проблемные адреса', () => {
  it('считает доставки по каждому статусу только своей рассылки', async () => {
    const [mine, foreign] = [await broadcast(), await broadcast()]
    const students = await Promise.all(Array.from({ length: 4 }, () => createStudent(payload)))
    await delivery(mine.id, students[0].id, 'sent')
    await delivery(mine.id, students[1].id, 'sent')
    await delivery(mine.id, students[2].id, 'failed', 'smtp_550')
    await delivery(mine.id, students[3].id, 'skipped', 'unsubscribed')
    await delivery(foreign.id, students[0].id, 'pending')
    expect(await broadcastStatusCounts(payload, mine.id)).toEqual({ pending: 0, processing: 0, sent: 2, failed: 1, cancelled: 0, skipped: 1 })
    expect(await broadcastStatusCounts(payload, foreign.id)).toMatchObject({ pending: 1, sent: 0 })
  })

  it('проблемные адреса — только неудачные и пропущенные, с именем и понятной причиной', async () => {
    const item = await broadcast()
    const [rejected, unsubscribed, fine] = [
      await createStudent(payload, { firstName: 'Ирина', lastName: 'Отказ' }),
      await createStudent(payload, { firstName: 'Олег', lastName: 'Отписка' }),
      await createStudent(payload),
    ]
    await delivery(item.id, rejected.id, 'failed', 'smtp_550')
    await delivery(item.id, unsubscribed.id, 'skipped', 'unsubscribed')
    await delivery(item.id, fine.id, 'sent')
    const problems = await broadcastProblems(payload, item.id)
    expect(problems).toHaveLength(2)
    expect(problems).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Ирина Отказ', email: rejected.email, status: 'failed', reason: 'адрес отклонён почтовым сервером (550)' }),
      expect.objectContaining({ name: 'Олег Отписка', email: unsubscribed.email, status: 'skipped', reason: 'получатель отписался от рассылок' }),
    ]))
    expect(await broadcastProblems(payload, item.id, 1)).toHaveLength(1)
    expect(await broadcastProblems(payload, (await broadcast()).id)).toEqual([])
  })
})

describe('предпросмотр письма и адрес для ответа', () => {
  it('корректный контакт поддержки становится Reply-To, некорректный — нет', async () => {
    const item = await broadcast()
    await setContactEmail('help@lms.test')
    expect(await broadcastPreview(payload, item, admin)).toMatchObject({ to: admin.email, subject: item.subject, replyTo: 'help@lms.test' })
    await setContactEmail('не адрес <script>')
    const preview = await broadcastPreview(payload, item, admin)
    expect(preview).not.toHaveProperty('replyTo')
    expect(preview.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })

  it('недоступные настройки сайта не ломают предпросмотр: письмо без Reply-To и предупреждение в лог', async () => {
    const item = await broadcast()
    const warn = vi.spyOn(logger, 'warn')
    vi.spyOn(payload, 'findGlobal').mockRejectedValueOnce(new TypeError('settings unavailable'))
    const preview = await broadcastPreview(payload, item, admin)
    expect(preview).not.toHaveProperty('replyTo')
    expect(warn).toHaveBeenCalledWith('Email reply-to is unavailable', { 'error.type': 'TypeError' })
  })
})

describe('тестовая отправка и удаление: сбои', () => {
  it('почтовый сервер отклонил тестовое письмо — 502 с причиной, статистика рассылки не меняется', async () => {
    const item = await broadcast()
    ;(payload.email as { name: string }).name = 'integration-smtp'
    const mail = captureEmails(payload)
    try {
      vi.mocked(payload.sendEmail).mockRejectedValueOnce(Object.assign(new Error('550 mailbox unavailable'), { responseCode: 550 }))
      const response = await testPOST(json(`manage/broadcasts/${item.id}/test`, 'POST'), context(item.id))
      expect(response.status).toBe(502)
      expect(await response.json()).toEqual({ error: 'Почтовый сервер не принял письмо: адрес отклонён почтовым сервером (550)' })
      expect(await broadcastStatusCounts(payload, item.id)).toMatchObject({ sent: 0, failed: 0 })
    } finally {
      mail.restore()
      ;(payload.email as { name: string }).name = originalAdapterName
    }
  })

  it('сбой базы при удалении черновика — 500 с общим текстом, черновик остаётся', async () => {
    const item = await broadcast()
    const errors = vi.spyOn(logger, 'error')
    const find = payload.find.bind(payload)
    vi.spyOn(payload, 'find').mockImplementation(((args: Parameters<Payload['find']>[0]) => args.collection === 'email-broadcasts'
      ? Promise.reject(new Error('could not serialize access'))
      : find(args)) as Payload['find'])
    const response = await broadcastDELETE(json(`manage/broadcasts/${item.id}`, 'DELETE'), context(item.id))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Не удалось выполнить действие с рассылкой. Попробуйте ещё раз' })
    expect(errors).toHaveBeenCalledWith('Email broadcast API failed', expect.any(Error))
    vi.restoreAllMocks()
    expect((await payload.count({ collection: 'email-broadcasts', where: { id: { equals: item.id } }, overrideAccess: true })).totalDocs).toBe(1)
  })

  it.each([
    ['получатели не массив', { recipients: 'all' }],
    ['отрицательный номер', { recipients: [-1] }],
    ['дробный номер', { recipients: [1.5] }],
    ['больше лимита', { recipients: Array.from({ length: 5001 }, (_, index) => index + 1) }],
  ])('%s — ошибка списка получателей', (_, extra) => {
    expect(() => validateBroadcastInput({ subject: 'Тема', body: 'Текст', audience: 'selected', ...extra })).toThrow('Список получателей заполнен неверно')
  })
})

describe('DELETE /api/push/subscriptions — отвязка устройства', () => {
  const endpoint = () => `https://fcm.googleapis.com/fcm/send/${uid('device')}`
  async function subscribe(user: TestUser, href: string) {
    const subscription = await payload.create({ collection: 'push-subscriptions', overrideAccess: true, data: {
      user: user.id, endpoint: href, endpointHash: createHash('sha256').update(href).digest('hex'),
      p256dh: 'fixture-public-key', auth: 'fixture-auth-key', sessionHash: createHash('sha256').update(uid('sid')).digest('hex'),
    } })
    const notification = await payload.create({ collection: 'notifications', context: { skipHooks: true }, overrideAccess: true, data: { user: user.id, title: 'Пуш', message: 'Текст', type: 'info' } })
    await payload.create({ collection: 'notification-deliveries', overrideAccess: true, data: { user: user.id, notification: notification.id, subscription: subscription.id, status: 'pending', attempts: 0, nextAttemptAt: new Date().toISOString() } })
    return subscription
  }
  const remove = async (token: string, body: unknown) => unsubscribeDevice(new Request('http://lms.test/api/push/subscriptions', { method: 'DELETE', headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

  it('удаляет своё устройство вместе с очередью доставок', async () => {
    const student = await createStudent(payload)
    const href = endpoint()
    const subscription = await subscribe(student, href)
    const response = await remove(await login(payload, student), { endpoint: href })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ subscribed: false })
    expect((await payload.count({ collection: 'push-subscriptions', where: { id: { equals: subscription.id } }, overrideAccess: true })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'notification-deliveries', where: { subscription: { equals: subscription.id } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('чужое устройство с тем же адресом не трогает; адрес не браузерного провайдера — 400', async () => {
    const [owner, stranger] = [await createStudent(payload), await createStudent(payload)]
    const href = endpoint()
    const subscription = await subscribe(owner, href)
    const token = await login(payload, stranger)
    expect((await remove(token, { endpoint: href })).status).toBe(200)
    expect((await payload.count({ collection: 'push-subscriptions', where: { id: { equals: subscription.id } }, overrideAccess: true })).totalDocs).toBe(1)
    const invalid = await remove(token, { endpoint: 'https://evil.example/push' })
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'Некорректная подписка устройства' })
  })
})
