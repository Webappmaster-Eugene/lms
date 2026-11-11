import { createHmac, randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET as pathState, POST as pathAction } from '@/app/api/bootcamp/leads/[id]/path/route'
import { POST as retryRoute } from '@/app/api/bootcamp/enrollments/[id]/retry/route'
import { POST as startRoute } from '@/app/api/bootcamp/pay/[token]/start/route'
import { POST as resultRoute } from '@/app/api/bootcamp/robokassa/result/route'
import { POST as claimRoute } from '@/app/api/internal/bootcamp-enrollments/claim/route'
import { POST as reportRoute } from '@/app/api/internal/bootcamp-enrollments/[id]/report/route'
import { POST as revokedRoute } from '@/app/api/internal/bootcamp-enrollments/[id]/revoked/route'
import { adminTelegramTransport } from '@/server/admin-telegram'
import { checkRefunds } from '@/server/bootcamp-refund'
import { noticeSignatureBase, signatureHash } from '@/server/robokassa'
import type { BootcampLead } from '@/payload-types'
import { captureEmails, createAdmin, getTestPayload, login, uid, type TestUser } from '../helpers/payload'
import { ensureNodejsProgramCourse } from '../helpers/bootcamp'

let payload: Payload
let admin: TestUser
let adminToken: string
let emails: ReturnType<typeof captureEmails>
const telegram: string[] = []
const ROBOKASSA = { ROBOKASSA_MERCHANT_LOGIN: 'bootcamp-test', ROBOKASSA_PASSWORD1: 'live-one', ROBOKASSA_PASSWORD2: 'live-two', ROBOKASSA_PASSWORD3: 'live-three', ROBOKASSA_TEST_PASSWORD1: 'test-one', ROBOKASSA_TEST_PASSWORD2: 'test-two', ROBOKASSA_IS_TEST: '0', ROBOKASSA_HASH: 'sha256' }
const TELEGRAM = { TELEGRAM_BOT_TOKEN: `123456:${'a'.repeat(32)}`, TELEGRAM_ADMIN_CHAT_ID: '42', TELEGRAM_PROXY_URL: undefined }
const saved = Object.fromEntries([...Object.keys(ROBOKASSA), ...Object.keys(TELEGRAM)].map((key) => [key, process.env[key]]))

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = () => (payload.db as unknown as { drizzle: Db }).drizzle
const rows = <T>(result: unknown) => (result as { rows: T[] }).rows

/** Робокасса в тестах: OpStateExt, создание возврата и его состояние. Ответы задаёт каждый тест. */
const robokassa = {
  create: { status: 200, body: {} as Record<string, unknown> } as { status: number, body: Record<string, unknown> } | 'down',
  label: 'processing',
  calls: [] as { url: string, body: string | null }[],
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  await ensureNodejsProgramCourse(payload)
  for (const [key, value] of Object.entries({ ...ROBOKASSA, ...TELEGRAM })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.spyOn(adminTelegramTransport, 'send').mockImplementation(async (_cfg, _chat, text) => { telegram.push(text) })
  emails = captureEmails(payload)
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    robokassa.calls.push({ url, body: typeof init?.body === 'string' ? init.body : null })
    if (url.includes('/OpStateExt')) {
      const inv = new URL(url).searchParams.get('InvoiceID')
      return new Response(`<OperationStateResponse><Result><Code>0</Code></Result><State><Code>100</Code></State><Info><OutSum>45000.000000</OutSum><OpKey>OPKEY-${inv}</OpKey></Info></OperationStateResponse>`, { status: 200 })
    }
    if (url.endsWith('/RefundService/Refund/Create')) {
      if (robokassa.create === 'down') throw new TypeError('fetch failed')
      return new Response(JSON.stringify(robokassa.create.body), { status: robokassa.create.status })
    }
    if (url.includes('/RefundService/Refund/GetState')) {
      const id = new URL(url).searchParams.get('id')
      return new Response(JSON.stringify({ requestId: id, amount: 1, label: robokassa.label }), { status: 200 })
    }
    throw new Error(`Неожиданный запрос в тесте возвратов: ${url}`)
  })
})

afterAll(() => {
  emails.restore()
  vi.restoreAllMocks()
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

beforeEach(() => {
  telegram.length = 0
  emails.sent.length = 0
  robokassa.calls.length = 0
  robokassa.create = { status: 200, body: { success: true, message: null, requestId: randomUUID() } }
  robokassa.label = 'processing'
  ;(globalThis as unknown as Record<symbol, number[]>)[Symbol.for('lms.adminTelegram.sent')] = []
})

const asAdmin = () => ({ 'Content-Type': 'application/json', Authorization: `JWT ${adminToken}` })
const act = (leadId: number, body: Record<string, unknown>) => pathAction(new Request('http://lms.test/api/x', { method: 'POST', headers: asAdmin(), body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(leadId) }) })
type PathJson = { lead: { status: string }, refunds: { status: string, amount: string, method: string }[], refund: { available: boolean, viaApi: boolean, left: string, note: string | null }, events: { type: string, message: string }[], error?: string }
const state = async (leadId: number) => (await pathState(new Request('http://lms.test/api/x', { headers: asAdmin() }), { params: Promise.resolve({ id: String(leadId) }) })).json() as Promise<PathJson>
const reload = (id: number) => payload.findByID({ collection: 'bootcamp-leads', id, depth: 0, overrideAccess: true })
const workerKey = () => createHmac('sha256', process.env.PAYLOAD_SECRET ?? '').update('lms-bootcamp-enroll-worker-v1').digest('hex')
const worker = (route: typeof revokedRoute, id: number, body: unknown) => route(new Request('http://lms.test/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lms-worker-key': workerKey() }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(id) }) })
const claim = async () => (await claimRoute(new Request('http://lms.test/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lms-worker-key': workerKey() }, body: '{}' }))).json() as Promise<{ revoke: { id: number, gitlabUserId: number, username: string }[] }>
const newUsername = () => uid('rf').toLowerCase().replace(/[^a-z0-9-]/g, '-')

async function admittedLead(): Promise<BootcampLead> {
  const lead = await payload.create({
    collection: 'bootcamp-leads',
    data: { email: `${uid('refund')}@mail.test`.toLowerCase(), name: 'Иван Петров', program: 'nodejs', status: 'diagnostic', consentVersion: '2026-10-31', consentAt: new Date().toISOString(), submissionCount: 1, entryTaskToken: uid('entry-token'), entrySubmittedAt: new Date().toISOString() },
    overrideAccess: true,
  })
  const admitted = await act(lead.id, { action: 'admit', firstName: 'Иван', lastName: 'Петров', username: newUsername(), group: 'nodejs-bootcamp', accessUntil: '', amount: '45000', dueDays: '7' })
  expect(admitted.status).toBe(200)
  return reload(lead.id)
}

/** Оплата через Робокассу: переход к оплате и уведомление. Автозачисление выдаёт учётку и курс. */
async function paidByRobokassa(): Promise<BootcampLead> {
  const lead = await admittedLead()
  const started = await startRoute(new Request('http://lms.test/api/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acceptOffer: true }) }), { params: Promise.resolve({ token: lead.paymentToken ?? '' }) })
  const invId = Number(new URL(((await started.json()) as { url: string }).url).searchParams.get('InvId'))
  const params: Record<string, string> = { OutSum: '45000.000000', InvId: String(invId), IncCurrLabel: 'BankCardPSR' }
  params.SignatureValue = signatureHash('sha256', noticeSignatureBase(params.OutSum, params.InvId, ROBOKASSA.ROBOKASSA_PASSWORD2, params)).toUpperCase()
  expect(await (await resultRoute(new Request('http://lms.test/api/x', { method: 'POST', body: new URLSearchParams(params) }))).text()).toBe(`OK${invId}`)
  return reload(lead.id)
}

async function paidManually(): Promise<BootcampLead> {
  const lead = await admittedLead()
  expect((await act(lead.id, { action: 'mark-paid', amount: '45000', comment: 'Перевод на карту' })).status).toBe(200)
  return reload(lead.id)
}

const enrollmentOf = async (leadId: number) => (await payload.find({ collection: 'bootcamp-enrollments', where: { lead: { equals: leadId } }, depth: 0, overrideAccess: true })).docs[0]
const courseGrants = async (userId: number) => (await payload.find({ collection: 'learning-access-grants', where: { user: { equals: userId } }, pagination: false, depth: 0, overrideAccess: true })).docs.filter((grant) => grant.ruleKey.startsWith(`${userId}:courses:`)).length
const refundsOf = async (leadId: number) => (await payload.find({ collection: 'bootcamp-refunds', where: { lead: { equals: leadId } }, sort: 'createdAt', depth: 0, overrideAccess: true })).docs
// Планировщик спрашивает Робокассу не чаще раза в минуту: тест сдвигает отметку проверки назад.
const recheck = async () => {
  await db().execute(sql`update bootcamp_refunds set checked_at = now() - interval '2 minutes' where status = 'processing'`)
  return checkRefunds(payload)
}

describe('возврат через API Робокассы', () => {
  it('заявка в Робокассе, затем выполнение: этап, курс методичек, зачисление, письмо и журнал', async () => {
    const lead = await paidByRobokassa()
    const before = await enrollmentOf(lead.id)
    expect(before?.status).toBe('queued')
    const userId = Number(before?.lmsUser)
    expect(await courseGrants(userId)).toBe(1)
    expect((await state(lead.id)).refund).toMatchObject({ available: true, viaApi: true, left: '45000' })

    const requested = await act(lead.id, { action: 'refund', amount: '27000', reason: 'Отказ после 8-й недели' })
    expect(requested.status).toBe(200)
    const [refund] = await refundsOf(lead.id)
    expect(refund).toMatchObject({ status: 'processing', method: 'robokassa', amountKopecks: 2_700_000, reason: 'Отказ после 8-й недели' })
    expect(refund.requestId).toMatch(/^[0-9a-f-]{36}$/)
    // Ключ операции пришёл из OpStateExt и сохранён у оплаты.
    const payment = (await payload.find({ collection: 'bootcamp-payments', where: { lead: { equals: lead.id } }, depth: 0, overrideAccess: true })).docs.find((doc) => doc.status === 'paid')
    expect(payment?.opKey).toBe(`OPKEY-${payment?.id}`)
    const createCall = robokassa.calls.find((call) => call.url.endsWith('/Refund/Create'))
    const jwt = JSON.parse(createCall?.body ?? '""') as string
    const body = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>
    expect(body).toMatchObject({ OpKey: `OPKEY-${payment?.id}`, RefundSum: 27000, InvoiceItems: [{ Quantity: 0.6, Cost: 45000 }] })
    expect(telegram.some((text) => text.includes('Возврат запрошен'))).toBe(true)
    expect((await reload(lead.id)).status).toBe('paid')

    // Пока Робокасса выполняет, ничего не меняется.
    expect(await recheck()).toBe(0)
    expect((await refundsOf(lead.id))[0].robokassaLabel).toBe('processing')

    robokassa.label = 'finished'
    expect(await recheck()).toBe(1)
    expect((await refundsOf(lead.id))[0]).toMatchObject({ status: 'done', robokassaLabel: 'finished' })
    expect((await reload(lead.id)).status).toBe('refunded')
    expect(await courseGrants(userId)).toBe(0)
    // Задание GitLab ещё не начиналось: оно остановлено, блокировать нечего.
    expect(await enrollmentOf(lead.id)).toMatchObject({ status: 'failed', error: 'Деньги возвращены: зачисление остановлено' })
    expect((await enrollmentOf(lead.id))?.revokedAt).toBeTruthy()
    const letter = emails.sent.find((mail) => mail.to === lead.email && /Возврат за буткемп/.test(String(mail.subject)))
    expect(letter?.text).toContain('Мы вернули 27 000 ₽')
    const types = (await state(lead.id)).events.map((event) => event.type)
    expect(types).toEqual(expect.arrayContaining(['refund_requested', 'refunded', 'access_revoked']))
    expect(telegram.some((text) => text.includes('Деньги возвращены'))).toBe(true)
    expect(telegram.some((text) => text.includes('нет чека на оставшиеся 18 000 ₽'))).toBe(true)

    // Остаток можно вернуть вторым возвратом; доступы уже закрыты, второе письмо не уходит.
    emails.sent.length = 0
    expect((await act(lead.id, { action: 'refund', amount: '18001', reason: 'Остаток' })).status).toBe(409)
    expect((await act(lead.id, { action: 'refund', amount: '18000', reason: 'Остаток' })).status).toBe(200)
    robokassa.label = 'finished'
    expect(await recheck()).toBe(1)
    expect((await state(lead.id)).refund).toMatchObject({ available: false, left: '0' })
    expect(emails.sent.filter((mail) => mail.to === lead.email && /Возврат за буткемп/.test(String(mail.subject)))).toHaveLength(0)
    // Вернули всё: чек Робочеки аннулируют сами, напоминания нет.
    expect(telegram.filter((text) => text.includes('Чек:'))).toHaveLength(1)
  })

  it('пока возврат выполняется, его сумма уже занята: двойной клик не вернёт деньги дважды', async () => {
    const lead = await paidByRobokassa()
    expect((await act(lead.id, { action: 'refund', amount: '45000', reason: 'Отказ до старта' })).status).toBe(200)
    const again = await act(lead.id, { action: 'refund', amount: '45000', reason: 'Отказ до старта' })
    expect(again.status).toBe(409)
    expect(((await again.json()) as { error: string }).error).toContain('уже возвращено всё')
    expect(await refundsOf(lead.id)).toHaveLength(1)
  })

  it('отказ Робокассы объясняется, возврат не записывается', async () => {
    const lead = await paidByRobokassa()
    robokassa.create = { status: 200, body: { success: false, message: 'NotEnoughOperationFunds', requestId: null } }
    const response = await act(lead.id, { action: 'refund', amount: '45000', reason: 'Отказ' })
    expect(response.status).toBe(409)
    expect(((await response.json()) as { error: string }).error).toContain('на балансе магазина не хватает денег')
    expect(await refundsOf(lead.id)).toHaveLength(0)
    expect((await reload(lead.id)).status).toBe('paid')
  })

  it('обрыв связи: неизвестно, создан ли возврат, - тревога и совет проверить кабинет', async () => {
    const lead = await paidByRobokassa()
    robokassa.create = 'down'
    const response = await act(lead.id, { action: 'refund', amount: '45000', reason: 'Отказ' })
    expect(response.status).toBe(502)
    expect(((await response.json()) as { error: string }).error).toContain('проверьте операцию в кабинете Робокассы')
    expect(await refundsOf(lead.id)).toHaveLength(0)
    expect((await state(lead.id)).events.some((event) => event.type === 'refund_alert')).toBe(true)
    expect(telegram.some((text) => text.includes('связь с Робокассой оборвалась'))).toBe(true)
  })

  it('возврат, отменённый в кабинете Робокассы, доступы не трогает', async () => {
    const lead = await paidByRobokassa()
    expect((await act(lead.id, { action: 'refund', amount: '45000', reason: 'Отказ' })).status).toBe(200)
    robokassa.label = 'canceled'
    expect(await recheck()).toBe(0)
    expect((await refundsOf(lead.id))[0].status).toBe('cancelled')
    expect((await reload(lead.id)).status).toBe('paid')
    expect((await state(lead.id)).refund.left).toBe('45000')
    expect(telegram.some((text) => text.includes('Возврат отменён'))).toBe(true)
  })

  it('сбой закрытия доступов откатывает отметку «выполнен»: следующий проход повторяет всё', async () => {
    const lead = await paidByRobokassa()
    const userId = Number((await enrollmentOf(lead.id))?.lmsUser)
    expect((await act(lead.id, { action: 'refund', amount: '45000', reason: 'Отказ' })).status).toBe(200)
    robokassa.label = 'finished'
    const original = payload.delete.bind(payload)
    const broken = vi.spyOn(payload, 'delete').mockImplementation(((args: Parameters<Payload['delete']>[0]) => args.collection === 'learning-access-grants' ? Promise.reject(new Error('сбой базы')) : original(args)) as Payload['delete'])
    try {
      expect(await recheck()).toBe(0)
    } finally {
      broken.mockRestore()
    }
    expect((await refundsOf(lead.id))[0].status).toBe('processing')
    expect((await reload(lead.id)).status).toBe('paid')
    expect(await courseGrants(userId)).toBe(1)
    expect((await state(lead.id)).events.some((event) => event.type === 'refunded')).toBe(false)

    expect(await recheck()).toBe(1)
    expect((await reload(lead.id)).status).toBe('refunded')
    expect(await courseGrants(userId)).toBe(0)
  })

  it('Робокасса приняла возврат, а LMS не записала: тревога и совет не повторять', async () => {
    const lead = await paidByRobokassa()
    const original = payload.create.bind(payload)
    const broken = vi.spyOn(payload, 'create').mockImplementation(((args: Parameters<Payload['create']>[0]) => args.collection === 'bootcamp-refunds' ? Promise.reject(new Error('сбой базы')) : original(args)) as Payload['create'])
    let response: Response
    try {
      response = await act(lead.id, { action: 'refund', amount: '45000', reason: 'Отказ' })
    } finally {
      broken.mockRestore()
    }
    expect(response.status).toBe(500)
    expect(((await response.json()) as { error: string }).error).toContain('Не повторяйте возврат')
    expect(await refundsOf(lead.id)).toHaveLength(0)
    expect((await state(lead.id)).events.find((event) => event.type === 'refund_alert')?.message).toContain('но LMS его не записала')
    expect(telegram.some((text) => text.includes('не записан в LMS'))).toBe(true)
  })

  it('без пароля 3 возврат через API недоступен, отметка вручную - да', async () => {
    const lead = await paidByRobokassa()
    delete process.env.ROBOKASSA_PASSWORD3
    try {
      expect((await state(lead.id)).refund).toMatchObject({ available: true, viaApi: false })
      expect((await act(lead.id, { action: 'refund', amount: '45000', reason: 'Отказ' })).status).toBe(409)
    } finally {
      process.env.ROBOKASSA_PASSWORD3 = ROBOKASSA.ROBOKASSA_PASSWORD3
    }
  })
})

describe('возврат, отмеченный вручную', () => {
  it('оплата мимо Робокассы: API не предлагается, отметка сразу закрывает доступы', async () => {
    const lead = await paidManually()
    const view = await state(lead.id)
    expect(view.refund).toMatchObject({ available: true, viaApi: false })
    expect(view.refund.note).toContain('мимо Робокассы')
    expect((await act(lead.id, { action: 'refund', amount: '45000', reason: 'Отказ' })).status).toBe(409)
    expect((await act(lead.id, { action: 'mark-refunded', amount: '45000', reason: '' })).status).toBe(400)

    const marked = await act(lead.id, { action: 'mark-refunded', amount: '45000', reason: 'Вернули переводом 11.11' })
    expect(marked.status).toBe(200)
    expect((await refundsOf(lead.id))[0]).toMatchObject({ status: 'done', method: 'manual' })
    expect((await reload(lead.id)).status).toBe('refunded')
    expect(robokassa.calls.some((call) => call.url.includes('RefundService'))).toBe(false)
    expect(emails.sent.find((mail) => mail.to === lead.email && /Возврат за буткемп/.test(String(mail.subject)))?.text).toContain('способом, о котором мы договорились')
    expect(telegram.some((text) => text.includes('Чек: аннулируйте его в «Мой налог»'))).toBe(true)
    // Деньги возвращены - зачислять снова и повторять остановленное зачисление нельзя.
    const enroll = await act(lead.id, { action: 'enroll', firstName: 'Иван', lastName: 'Петров', username: newUsername(), group: 'nodejs-bootcamp' })
    expect(enroll.status).toBe(409)
    const stopped = await enrollmentOf(lead.id)
    expect(stopped?.status).toBe('failed')
    const retry = await retryRoute(new Request('http://lms.test/api/x', { method: 'POST', headers: asAdmin() }), { params: Promise.resolve({ id: String(stopped?.id) }) })
    expect(retry.status).toBe(409)
    expect(((await retry.json()) as { error: string }).error).toContain('Деньги по заявке возвращены')
    expect((await enrollmentOf(lead.id))?.status).toBe('failed')
  })

  it('без настоящей оплаты возвращать нечего', async () => {
    const lead = await admittedLead()
    expect((await act(lead.id, { action: 'mark-refunded', amount: '100', reason: 'Отказ' })).status).toBe(409)
  })
})

describe('исполнитель в VM GitLab блокирует учётку', () => {
  async function refundedWithGitlab(gitlabUserId: number) {
    const lead = await paidManually()
    const enrollment = await enrollmentOf(lead.id)
    await db().execute(sql`update bootcamp_enrollments set status = 'done', gitlab_user_id = ${gitlabUserId}, finished_at = now() where id = ${enrollment?.id}`)
    expect((await act(lead.id, { action: 'mark-refunded', amount: '45000', reason: 'Отказ' })).status).toBe(200)
    return { lead, enrollment: await enrollmentOf(lead.id) }
  }

  it('задание на блокировку, отчёт и запись в журнал; повторно не выдаётся', async () => {
    const gitlabUserId = 900_000 + Math.floor(Math.random() * 99_999)
    const { lead, enrollment } = await refundedWithGitlab(gitlabUserId)
    expect(enrollment?.revokeRequestedAt).toBeTruthy()
    expect(enrollment?.revokedAt).toBeFalsy()
    const item = (await claim()).revoke.find((entry) => entry.id === enrollment?.id)
    expect(item).toEqual({ id: enrollment?.id, gitlabUserId, username: enrollment?.gitlabUsername })

    expect((await worker(revokedRoute, enrollment?.id ?? 0, { ok: true })).status).toBe(200)
    expect((await enrollmentOf(lead.id))?.revokedAt).toBeTruthy()
    expect((await state(lead.id)).events.some((event) => event.message.includes(`Учётка GitLab ${enrollment?.gitlabUsername} заблокирована`))).toBe(true)
    expect((await claim()).revoke.some((entry) => entry.id === enrollment?.id)).toBe(false)
  })

  it('ошибка блокировки: тревога наставнику, задание больше не повторяется', async () => {
    const { lead, enrollment } = await refundedWithGitlab(800_000 + Math.floor(Math.random() * 99_999))
    expect((await worker(revokedRoute, enrollment?.id ?? 0, { error: 'GitLab POST /users/1/block: 403' })).status).toBe(200)
    expect((await enrollmentOf(lead.id))?.revokeError).toContain('403')
    expect(telegram.some((text) => text.includes('Не удалось заблокировать учётку GitLab'))).toBe(true)
    expect((await claim()).revoke.some((entry) => entry.id === enrollment?.id)).toBe(false)
    expect((await worker(revokedRoute, enrollment?.id ?? 0, {})).status).toBe(400)
  })

  it('задание, закончившееся после возврата, не возвращает заявку в «Зачислен»', async () => {
    const lead = await paidManually()
    const enrollment = await enrollmentOf(lead.id)
    await db().execute(sql`update bootcamp_enrollments set status = 'running', started_at = now() where id = ${enrollment?.id}`)
    expect((await act(lead.id, { action: 'mark-refunded', amount: '45000', reason: 'Отказ' })).status).toBe(200)
    expect((await enrollmentOf(lead.id))?.revokeRequestedAt).toBeTruthy()
    const done = await worker(reportRoute as typeof revokedRoute, enrollment?.id ?? 0, { status: 'done', steps: [], gitlabUserId: 700_000 + Math.floor(Math.random() * 99_999), gitlabProjectUrl: 'https://git.test/nodejs-bootcamp/x' })
    expect(done.status).toBe(200)
    expect((await reload(lead.id)).status).toBe('refunded')
    expect((await claim()).revoke.some((entry) => entry.id === enrollment?.id)).toBe(true)
  })
})

describe('учёт возвратов', () => {
  it('записи возвратов не меняются и не удаляются даже администратором', async () => {
    const lead = await paidManually()
    expect((await act(lead.id, { action: 'mark-refunded', amount: '100', reason: 'Компенсация' })).status).toBe(200)
    const [refund] = await refundsOf(lead.id)
    await expect(payload.update({ collection: 'bootcamp-refunds', id: refund.id, data: { amountKopecks: 1 }, overrideAccess: false, user: admin })).rejects.toThrow()
    await expect(payload.delete({ collection: 'bootcamp-refunds', id: refund.id, overrideAccess: false, user: admin })).rejects.toThrow()
    const count = rows<{ count: string }>(await db().execute(sql`select count(*) from bootcamp_refunds where id = ${refund.id}`))[0].count
    expect(Number(count)).toBe(1)
  })
})
