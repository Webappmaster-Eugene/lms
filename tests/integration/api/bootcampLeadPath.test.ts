import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as pathState, POST as pathAction } from '@/app/api/bootcamp/leads/[id]/path/route'
import { POST as startRoute } from '@/app/api/bootcamp/pay/[token]/start/route'
import { POST as resultRoute } from '@/app/api/bootcamp/robokassa/result/route'
import { BOOTCAMP_MANUALS_COURSE_SLUG } from '@/lib/bootcamp-enrollment'
import { adminTelegramTransport } from '@/server/admin-telegram'
import { noteFailReturn, paymentPageState } from '@/server/bootcamp-payment'
import { runBootcampSchedule } from '@/server/bootcamp-schedule'
import { noticeSignatureBase, signatureHash } from '@/server/robokassa'
import type { BootcampLead } from '@/payload-types'
import { captureEmails, createAdmin, createCourseTree, getTestPayload, login, uid, type TestUser } from '../helpers/payload'

let payload: Payload
let admin: TestUser
let adminToken: string
const telegram: string[] = []
const ROBOKASSA = { ROBOKASSA_MERCHANT_LOGIN: 'bootcamp-test', ROBOKASSA_TEST_PASSWORD1: 'test-one', ROBOKASSA_TEST_PASSWORD2: 'test-two', ROBOKASSA_IS_TEST: '1', ROBOKASSA_HASH: 'sha256' }
const TELEGRAM = { TELEGRAM_BOT_TOKEN: `123456:${'a'.repeat(32)}`, TELEGRAM_ADMIN_CHAT_ID: '42', TELEGRAM_PROXY_URL: undefined }
const saved = Object.fromEntries([...Object.keys(ROBOKASSA), ...Object.keys(TELEGRAM)].map((key) => [key, process.env[key]]))

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = () => (payload.db as unknown as { drizzle: Db }).drizzle

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  const existing = await payload.find({ collection: 'courses', where: { slug: { equals: BOOTCAMP_MANUALS_COURSE_SLUG } }, limit: 1, overrideAccess: true })
  if (!existing.docs[0]) {
    const { course } = await createCourseTree(payload, { lessons: 1 })
    await payload.update({ collection: 'courses', id: course.id, data: { slug: BOOTCAMP_MANUALS_COURSE_SLUG }, overrideAccess: true })
  }
  for (const [key, value] of Object.entries({ ...ROBOKASSA, ...TELEGRAM })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.spyOn(adminTelegramTransport, 'send').mockImplementation(async (_cfg, _chat, text) => { telegram.push(text) })
})

afterAll(() => {
  vi.restoreAllMocks()
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

beforeEach(() => {
  telegram.length = 0
  // Предел 40 сообщений в минуту общий на процесс: тесты шлют больше, а проверяют каждое.
  ;(globalThis as unknown as Record<symbol, number[]>)[Symbol.for('lms.adminTelegram.sent')] = []
})

async function newLead(extra: Partial<BootcampLead> = {}): Promise<BootcampLead> {
  return payload.create({
    collection: 'bootcamp-leads',
    data: { email: `${uid('path')}@mail.test`.toLowerCase(), name: 'Иван Петров', program: 'nodejs', status: 'diagnostic', consentVersion: '2026-10-31', consentAt: new Date().toISOString(), submissionCount: 1, entryTaskToken: uid('entry-token'), entrySubmittedAt: new Date().toISOString(), ...extra },
    overrideAccess: true,
  })
}

const headers = { 'Content-Type': 'application/json', Authorization: '' }
const asAdmin = () => ({ ...headers, Authorization: `JWT ${adminToken}` })
const act = (leadId: number, body: Record<string, unknown>) => pathAction(new Request('http://lms.test/api/x', { method: 'POST', headers: asAdmin(), body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(leadId) }) })
const state = async (leadId: number) => (await pathState(new Request('http://lms.test/api/x', { headers: asAdmin() }), { params: Promise.resolve({ id: String(leadId) }) })).json() as Promise<{ lead: { status: string, paymentUrl: string | null, paidAt: string | null }, enrollment: { status: string } | null, events: { type: string }[] }>
const start = (token: string, body: unknown = { acceptOffer: true }) => startRoute(new Request('http://lms.test/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ token }) })
const reload = (id: number) => payload.findByID({ collection: 'bootcamp-leads', id, depth: 0, overrideAccess: true })
const newUsername = () => uid('st').toLowerCase().replace(/[^a-z0-9-]/g, '-')
const admitBody = (username = newUsername()) => ({ action: 'admit', firstName: 'Иван', lastName: 'Петров', username, group: 'nodejs-bootcamp', accessUntil: '', amount: '45000', dueDays: '7', comment: 'Ждём на потоке' })

function notice(invId: number, outSum: string, password = ROBOKASSA.ROBOKASSA_TEST_PASSWORD2) {
  const params: Record<string, string> = { OutSum: outSum, InvId: String(invId), IncCurrLabel: 'BankCardPSR', PaymentMethod: 'BankCard' }
  params.SignatureValue = signatureHash('sha256', noticeSignatureBase(outSum, String(invId), password, params)).toUpperCase()
  return resultRoute(new Request('http://lms.test/api/bootcamp/robokassa/result', { method: 'POST', body: new URLSearchParams(params) }))
}

async function admitted(): Promise<{ lead: BootcampLead, token: string }> {
  const lead = await newLead()
  expect((await act(lead.id, admitBody())).status).toBe(200)
  const fresh = await reload(lead.id)
  return { lead: fresh, token: fresh.paymentToken ?? '' }
}

async function checkout(token: string): Promise<number> {
  const response = await start(token)
  expect(response.status).toBe(200)
  const { url } = await response.json() as { url: string }
  const params = new URL(url).searchParams
  expect(params.get('MerchantLogin')).toBe('bootcamp-test')
  expect(params.get('IsTest')).toBe('1')
  return Number(params.get('InvId'))
}

describe('путь заявки: этап только кнопками', () => {
  it('этап нельзя поменять сохранением карточки, даже администратору', async () => {
    const lead = await newLead()
    await payload.update({ collection: 'bootcamp-leads', id: lead.id, data: { status: 'enrolled', note: 'заметка' }, overrideAccess: false, user: admin })
    const fresh = await reload(lead.id)
    expect(fresh.status).toBe('diagnostic')
    expect(fresh.note).toBe('заметка')
  })

  it('«Допустить»: письмо со ссылкой, Telegram, журнал; повтор и чужой логин - 409', async () => {
    const mail = captureEmails(payload)
    try {
      const username = newUsername()
      const lead = await newLead()
      const response = await act(lead.id, admitBody(username))
      expect(response.status).toBe(200)
      const body = await response.json() as { lead: { status: string, paymentUrl: string } }
      expect(body.lead.status).toBe('admitted')
      const letter = mail.sent.find((message) => message.to === lead.email)
      expect(letter?.subject).toContain('Вы допущены')
      expect(letter?.text).toContain(body.lead.paymentUrl)
      expect(letter?.text).toContain('45 000 ₽')
      expect(letter?.text).toContain('Ждём на потоке')
      await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`Допущен: ${lead.email}`))).toContain(username))
      expect((await state(lead.id)).events.map((event) => event.type)).toEqual(expect.arrayContaining(['admitted', 'payment_link_sent']))

      expect((await act(lead.id, admitBody())).status).toBe(409)
      expect((await act((await newLead()).id, admitBody(username))).status).toBe(409)
    } finally {
      mail.restore()
    }
  })

  it('решения: подготовка требует текст и пишет кандидату, отказ и отзыв, возврат на рассмотрение', async () => {
    const mail = captureEmails(payload)
    try {
      const lead = await newLead()
      expect((await act(lead.id, { action: 'prepare', message: '' })).status).toBe(400)
      expect((await act(lead.id, { action: 'prepare', message: 'Повторите замыкания и промисы' })).status).toBe(200)
      expect((await reload(lead.id)).status).toBe('preparation')
      expect(mail.sent.find((message) => message.to === lead.email)?.text).toContain('Повторите замыкания и промисы')
      expect((await act(lead.id, admitBody())).status).toBe(409)
      expect((await act(lead.id, { action: 'reopen' })).status).toBe(200)
      expect((await reload(lead.id)).status).toBe('diagnostic')
      expect((await act(lead.id, { action: 'reject' })).status).toBe(200)
      expect(mail.sent.filter((message) => message.to === lead.email).map((message) => message.subject)).toEqual(expect.arrayContaining([expect.stringContaining('Решение по заявке')]))

      const other = await newLead()
      const before = mail.sent.length
      expect((await act(other.id, { action: 'withdraw' })).status).toBe(200)
      expect((await reload(other.id)).status).toBe('withdrawn')
      expect(mail.sent.length).toBe(before)
      expect((await act(other.id, { action: 'unknown' })).status).toBe(400)
    } finally {
      mail.restore()
    }
  })
})

describe('оплата через Робокассу', () => {
  it('без согласия с офертой счёт не создаётся, с ним - ссылка на тестовую Робокассу', async () => {
    const { lead, token } = await admitted()
    expect((await start(token, { acceptOffer: false })).status).toBe(400)
    expect((await start('A'.repeat(32))).status).toBe(404)
    await checkout(token)
    const payments = await payload.find({ collection: 'bootcamp-payments', where: { lead: { equals: lead.id } }, overrideAccess: true })
    expect(payments.docs).toHaveLength(1)
    expect(payments.docs[0]).toMatchObject({ status: 'pending', isTest: true, offerVersion: '2026-10-31', amountKopecks: 4_500_000 })
    expect((await reload(lead.id)).paymentStartedAt).toBeTruthy()
  })

  it('подписанное уведомление: OK, этап «Оплачен», письма, автозачисление; повтор ничего не меняет', async () => {
    const mail = captureEmails(payload)
    try {
      const { lead, token } = await admitted()
      const invId = await checkout(token)
      const response = await notice(invId, '45000.000000')
      expect(response.status).toBe(200)
      expect(await response.text()).toBe(`OK${invId}`)
      const fresh = await state(lead.id)
      expect(fresh.lead.status).toBe('paid')
      expect(fresh.lead.paidAt).toBeTruthy()
      expect(fresh.enrollment?.status).toBe('queued')
      expect(mail.sent.find((message) => message.to === lead.email && message.subject.includes('получена'))).toBeTruthy()
      await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`Тестовая оплата: ${lead.email}`))).toBeTruthy())

      const again = await notice(invId, '45000.000000')
      expect(await again.text()).toBe(`OK${invId}`)
      const events = (await state(lead.id)).events.filter((event) => event.type === 'paid')
      expect(events).toHaveLength(1)
      expect((await payload.find({ collection: 'bootcamp-enrollments', where: { lead: { equals: lead.id } }, overrideAccess: true })).totalDocs).toBe(1)
      expect((await paymentPageState(payload, await reload(lead.id))).kind).toBe('paid')
      expect((await start(token)).status).toBe(409)
    } finally {
      mail.restore()
    }
  })

  it('неверная подпись и чужая сумма отклоняются и ничего не меняют', async () => {
    const { lead, token } = await admitted()
    const invId = await checkout(token)
    expect((await notice(invId, '45000.000000', 'wrong-password')).status).toBe(400)
    expect((await notice(invId, '1.000000')).status).toBe(400)
    expect((await notice(999_999_999, '45000.000000')).status).toBe(400)
    expect((await reload(lead.id)).status).toBe('admitted')
  })

  it('вторая оплата той же заявки - тревога, заявка остаётся оплаченной', async () => {
    const { lead, token } = await admitted()
    const first = await checkout(token)
    const second = await checkout(token)
    expect((await notice(first, '45000.00')).status).toBe(200)
    expect(await (await notice(second, '45000.00')).text()).toBe(`OK${second}`)
    await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`Двойная оплата: ${lead.email}`))).toBeTruthy())
    expect((await reload(lead.id)).status).toBe('paid')
  })

  it('отменённый допуск закрывает ссылку и отменяет висящие счета', async () => {
    const { lead, token } = await admitted()
    const invId = await checkout(token)
    expect((await act(lead.id, { action: 'cancel-admission' })).status).toBe(200)
    expect((await reload(lead.id)).status).toBe('diagnostic')
    expect((await payload.findByID({ collection: 'bootcamp-payments', id: invId, overrideAccess: true })).status).toBe('cancelled')
    expect((await paymentPageState(payload, await reload(lead.id))).kind).toBe('closed')
    expect((await start(token)).status).toBe(409)
  })

  it('ручная отметка оплаты запускает тот же путь', async () => {
    const { lead } = await admitted()
    expect((await act(lead.id, { action: 'mark-paid', amount: '45000', comment: '' })).status).toBe(400)
    expect((await act(lead.id, { action: 'mark-paid', amount: '45000', comment: 'перевод на карту' })).status).toBe(200)
    const fresh = await state(lead.id)
    expect(fresh.lead.status).toBe('paid')
    expect(fresh.enrollment?.status).toBe('queued')
  })

  it('возврат со страницы ошибки отмечается один раз', async () => {
    const { lead, token } = await admitted()
    const invId = await checkout(token)
    await noteFailReturn(payload, String(invId))
    await noteFailReturn(payload, String(invId))
    await noteFailReturn(payload, 'abc')
    expect((await state(lead.id)).events.filter((event) => event.type === 'payment_failed_return')).toHaveLength(1)
  })

  it('просроченная ссылка не принимает оплату, «Отправить ещё раз» продлевает срок', async () => {
    const mail = captureEmails(payload)
    try {
      const { lead, token } = await admitted()
      await db().execute(sql`update bootcamp_leads set payment_due_at = now() - interval '1 hour' where id = ${lead.id}`)
      expect((await start(token)).status).toBe(409)
      expect((await act(lead.id, { action: 'resend-payment', dueDays: '3' })).status).toBe(200)
      expect(Date.parse((await reload(lead.id)).paymentDueAt ?? '')).toBeGreaterThan(Date.now())
      expect(mail.sent.filter((message) => message.to === lead.email && message.subject.includes('Ссылка на оплату'))).toHaveLength(1)
      await checkout(token)
    } finally {
      mail.restore()
    }
  })
})

describe('планировщик буткемпа', () => {
  it('напоминание за 2 дня один раз, истечение срока и тревога о решении без ответа', async () => {
    const mail = captureEmails(payload)
    try {
      const soon = (await admitted()).lead
      await db().execute(sql`update bootcamp_leads set payment_due_at = now() + interval '1 day' where id = ${soon.id}`)
      const late = (await admitted()).lead
      await db().execute(sql`update bootcamp_leads set payment_due_at = now() - interval '1 minute' where id = ${late.id}`)
      const waiting = await newLead({ entrySubmittedAt: new Date(Date.now() - 5 * 86_400_000).toISOString() })

      await runBootcampSchedule(payload)
      await runBootcampSchedule(payload)
      expect(mail.sent.filter((message) => message.to === soon.email && message.subject.includes('Напоминание'))).toHaveLength(1)
      expect((await reload(late.id)).paymentExpiredNoticeAt).toBeTruthy()
      expect((await reload(waiting.id)).reviewAlertAt).toBeTruthy()
      await vi.waitFor(() => expect(telegram.filter((text) => text.startsWith(`Срок оплаты истёк: ${late.email}`))).toHaveLength(1))
      await vi.waitFor(() => expect(telegram.filter((text) => text.includes(waiting.email) && text.startsWith('Решение ждёт ответа'))).toHaveLength(1))
    } finally {
      mail.restore()
    }
  })
})
