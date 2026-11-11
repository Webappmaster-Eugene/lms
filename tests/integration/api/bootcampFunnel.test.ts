import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseFunnelFilter } from '@/lib/bootcamp-funnel'
import { adminTelegramTransport } from '@/server/admin-telegram'
import { rowsOf } from '@/server/bootcamp-lead-events'
import { actionQueue, bootcampFunnel, funnelPrograms, sendWeeklySummary } from '@/server/bootcamp-funnel'
import type { BootcampLead } from '@/payload-types'
import { createProgram } from '../helpers/bootcamp'
import { createAdmin, getTestPayload, uid } from '../helpers/payload'

let payload: Payload
const telegram: string[] = []
const TELEGRAM = { TELEGRAM_BOT_TOKEN: `123456:${'a'.repeat(32)}`, TELEGRAM_ADMIN_CHAT_ID: '42', TELEGRAM_PROXY_URL: undefined }
const saved = Object.fromEntries(Object.keys(TELEGRAM).map((key) => [key, process.env[key]]))

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = () => (payload.db as unknown as { drizzle: Db }).drizzle
const DAY = 86_400_000
// В базе бывают программы других файлов тестов: сводки сверяем только по своим.
const summaries = (title: string) => telegram.filter((text) => text.startsWith(`Буткемп ${title}:`))
const NODEJS = 'Node.js'

beforeAll(async () => {
  payload = await getTestPayload()
  for (const [key, value] of Object.entries(TELEGRAM)) {
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
  ;(globalThis as unknown as Record<symbol, number[]>)[Symbol.for('lms.adminTelegram.sent')] = []
})

async function lead(utmSource: string, program = 'nodejs'): Promise<BootcampLead> {
  return payload.create({
    collection: 'bootcamp-leads',
    data: { email: `${uid('funnel')}@mail.test`.toLowerCase(), program, status: 'new', consentVersion: '2026-10-31', consentAt: new Date().toISOString(), submissionCount: 1, entryTaskToken: uid('entry-token'), source: { utmSource } },
    overrideAccess: true,
  })
}

// Моменты шагов задаём в днях назад от текущего времени базы.
const ago = (days: number) => sql`now() - make_interval(secs => ${days * 86_400})`

async function enroll(leadId: number, finishedDaysAgo: number, gitlabDaysAgo: number | null) {
  const enrollment = await payload.create({
    collection: 'bootcamp-enrollments',
    data: { lead: leadId, email: `${uid('enr')}@mail.test`.toLowerCase(), firstName: 'Иван', lastName: 'Петров', gitlabUsername: uid('enr').toLowerCase().replace(/[^a-z0-9-]/g, '-'), streamGroup: 'nodejs-bootcamp', status: 'queued' },
    overrideAccess: true,
  })
  await db().execute(sql`update bootcamp_enrollments set status = 'done', finished_at = ${ago(finishedDaysAgo)}, gitlab_signed_in_at = ${gitlabDaysAgo === null ? null : ago(gitlabDaysAgo)} where id = ${enrollment.id}`)
}

async function pay(leadId: number, paidDaysAgo: number, isTest = false): Promise<number> {
  const payment = await payload.create({ collection: 'bootcamp-payments', data: { lead: leadId, amountKopecks: 4_500_000, status: 'pending', method: 'robokassa', isTest }, overrideAccess: true })
  await db().execute(sql`update bootcamp_payments set status = 'paid', paid_at = ${ago(paidDaysAgo)} where id = ${payment.id}`)
  return payment.id
}

async function refund(leadId: number, paymentId: number, amountKopecks: number, status: 'done' | 'processing' | 'cancelled', finishedAt: ReturnType<typeof sql> | null) {
  await db().execute(sql`insert into bootcamp_refunds (lead_id, payment_id, amount_kopecks, status, method, reason, finished_at, created_at, updated_at) values (${leadId}, ${paymentId}, ${amountKopecks}, ${status}, 'manual', 'фикстура', ${finishedAt ?? sql`null`}, now(), now())`)
}

async function event(leadId: number, type: string, daysAgo: number, data: Record<string, unknown> | null = null) {
  await db().execute(sql`insert into bootcamp_lead_events (lead_id, type, message, data, created_at, updated_at) values (${leadId}, ${type}, 'фикстура', ${data === null ? null : JSON.stringify(data)}::jsonb, ${ago(daysAgo)}, now())`)
}

describe('воронка буткемпа', () => {
  it('считает шаги по заявкам периода, без тестовых оплат, с медианами и деньгами', async () => {
    const source = uid('utm').toLowerCase()
    // Прошёл весь путь.
    const full = await lead(source)
    await db().execute(sql`update bootcamp_leads set created_at = ${ago(10)}, entry_submitted_at = ${ago(9)}, entry_passed = 8, entry_total = 10, admitted_at = ${ago(8)}, paid_at = ${ago(7)}, status = 'enrolled' where id = ${full.id}`)
    await event(full.id, 'admitted', 8)
    const fullPayment = await pay(full.id, 7)
    await enroll(full.id, 7 - 1 / 24, 6)
    // Выполненный возврат считается, выполняющийся и отменённый - нет.
    await refund(full.id, fullPayment, 2_000_000, 'done', ago(1))
    await refund(full.id, fullPayment, 500_000, 'processing', null)
    await refund(full.id, fullPayment, 700_000, 'cancelled', ago(1))
    await event(full.id, 'gitlab_event', 5, { event: 'Merge Request Hook' })
    await event(full.id, 'gitlab_event', 5.5, { event: 'Pipeline Hook' })
    // Оплатил тестовой картой: в «Оплатили» не попадает.
    const tested = await lead(source)
    await db().execute(sql`update bootcamp_leads set created_at = ${ago(5)}, entry_submitted_at = ${ago(4)}, entry_passed = 10, entry_total = 10, admitted_at = ${ago(3)}, paid_at = ${ago(2)}, status = 'paid' where id = ${tested.id}`)
    await pay(tested.id, 2, true)
    // Только заявка.
    const fresh = await lead(source)
    await db().execute(sql`update bootcamp_leads set created_at = ${ago(3)} where id = ${fresh.id}`)
    // Зачислен до появления шага допуска: ни отметки, ни события, ни оплаты.
    const legacy = await lead(source)
    await db().execute(sql`update bootcamp_leads set created_at = ${ago(20)}, entry_submitted_at = ${ago(19)}, entry_passed = 10, entry_total = 10, status = 'enrolled' where id = ${legacy.id}`)
    await enroll(legacy.id, 15, null)
    // За пределами 90 дней.
    const old = await lead(source)
    await db().execute(sql`update bootcamp_leads set created_at = ${ago(200)}, entry_submitted_at = ${ago(199)} where id = ${old.id}`)

    const filter = parseFunnelFilter({ period: '90', source: `utm:${source}` }, new Date())
    const report = await bootcampFunnel(payload, filter)
    const step = (key: string) => report.steps.find((item) => item.key === key)!
    expect(report.steps.map((item) => [item.key, item.count])).toEqual([['leads', 4], ['submitted', 3], ['admitted', 3], ['paid', 1], ['enrolled', 2], ['gitlab', 1], ['mr', 1]])
    expect(step('submitted')).toMatchObject({ fromPrevious: 75, fromLeads: 75 })
    expect(step('paid')).toMatchObject({ fromPrevious: 33, fromLeads: 25 })
    expect(step('submitted').median).toBeCloseTo(DAY, -3)
    // У зачисленного до шага допуска нет момента допуска: медиану считают двое с моментами.
    expect(step('admitted').median).toBeCloseTo(DAY, -3)
    expect(step('paid').median).toBeCloseTo(DAY, -3)
    expect(step('enrolled').median).toBeCloseTo(DAY / 24, -3)
    expect(step('mr').median).toBeCloseTo(DAY, -3)
    expect(report.entryScore).toBeCloseTo((0.8 + 1 + 1) / 3, 5)
    expect(report.revenue).toEqual({ kopecks: 4_500_000, payments: 1, refundedKopecks: 2_000_000, refunds: 1 })
    expect(report.sources.find((item) => item.key === `utm:${source}`)).toEqual({ key: `utm:${source}`, label: source, leads: 4, submitted: 3, admitted: 3, paid: 1, enrolled: 2 })

    const all = await bootcampFunnel(payload, parseFunnelFilter({ period: 'all', source: `utm:${source}` }, new Date()))
    expect(all.steps[0].count).toBe(5)
    const week = await bootcampFunnel(payload, parseFunnelFilter({ period: '7', source: `utm:${source}` }, new Date()))
    expect(week.steps.map((item) => item.count)).toEqual([2, 1, 1, 0, 0, 0, 0])
    expect(week.revenue.payments).toBe(0)
  })

  it('список дел: решение без ответа, просроченная оплата, оплата без зачисления, сбой зачисления', async () => {
    const source = uid('utm').toLowerCase()
    const review = await lead(source)
    await db().execute(sql`update bootcamp_leads set status = 'diagnostic', entry_submitted_at = ${ago(1000)} where id = ${review.id}`)
    const expired = await lead(source)
    await db().execute(sql`update bootcamp_leads set status = 'admitted', admitted_at = ${ago(1003)}, payment_due_at = ${ago(999)} where id = ${expired.id}`)
    const notEnrolled = await lead(source)
    await db().execute(sql`update bootcamp_leads set status = 'paid', paid_at = ${ago(998)} where id = ${notEnrolled.id}`)
    const failed = await lead(source)
    const enrollment = await payload.create({ collection: 'bootcamp-enrollments', data: { lead: failed.id, email: failed.email, firstName: 'Иван', lastName: 'Петров', gitlabUsername: uid('enr').toLowerCase().replace(/[^a-z0-9-]/g, '-'), streamGroup: 'nodejs-bootcamp', status: 'queued' }, overrideAccess: true })
    await db().execute(sql`update bootcamp_leads set status = 'enrolled' where id = ${failed.id}`)
    await db().execute(sql`update bootcamp_enrollments set status = 'failed', updated_at = ${ago(997)} where id = ${enrollment.id}`)
    const done = await lead(source)
    await db().execute(sql`update bootcamp_leads set status = 'rejected', next_action_at = ${ago(1001)} where id = ${done.id}`)

    const { queue, total } = await actionQueue(payload)
    const mine = queue.filter((item) => [review.id, expired.id, notEnrolled.id, failed.id, done.id].includes(item.id))
    // От самой давней: решение ждёт 1000 дней, оплата просрочена 999, оплачен 998, зачисление упало 997.
    // Отказ с назначенным действием в список не попадает: заявка закрыта.
    expect(mine.map((item) => [item.id, item.reason])).toEqual([[review.id, 'review'], [expired.id, 'payment_expired'], [notEnrolled.id, 'not_enrolled'], [failed.id, 'enrollment_failed']])
    expect(total).toBeGreaterThanOrEqual(4)
  })
})

describe('тестовые заявки', () => {
  it('админ ставит отметку в карточке; заявка уходит из воронки, денег и итогов недели, но остаётся в списке дел', async () => {
    const source = uid('utm').toLowerCase()
    const real = await lead(source)
    await db().execute(sql`update bootcamp_leads set created_at = ${ago(2)} where id = ${real.id}`)
    const check = await lead(source)
    const admin = await createAdmin(payload)
    // Отметку ставит админ через форму Payload: поле не закрыто, как серверные поля заявки.
    const marked = await payload.update({ collection: 'bootcamp-leads', id: check.id, data: { isTest: true }, user: admin, overrideAccess: false })
    expect(marked.isTest).toBe(true)
    await db().execute(sql`update bootcamp_leads set created_at = ${ago(2)}, status = 'paid', paid_at = ${ago(1)} where id = ${check.id}`)
    const payment = await payload.create({ collection: 'bootcamp-payments', data: { lead: check.id, amountKopecks: 4_500_000, status: 'pending', method: 'manual' }, overrideAccess: true })
    await db().execute(sql`update bootcamp_payments set status = 'paid', paid_at = ${ago(1)} where id = ${payment.id}`)

    const report = await bootcampFunnel(payload, parseFunnelFilter({ period: '7', source: `utm:${source}` }, new Date()))
    expect(report.steps.map((item) => item.count)).toEqual([1, 0, 0, 0, 0, 0, 0])
    expect(report.revenue).toEqual({ kopecks: 0, payments: 0, refundedKopecks: 0, refunds: 0 })
    expect(report.sources.find((item) => item.key === `utm:${source}`)?.leads).toBe(1)

    const withTest = await actionQueue(payload)
    expect(withTest.queue.find((item) => item.id === check.id)).toMatchObject({ reason: 'not_enrolled', test: true })
    const withoutTest = await actionQueue(payload, { withTest: false })
    expect(withoutTest.queue.some((item) => item.id === check.id)).toBe(false)
    expect(withoutTest.total).toBe(withTest.total - withTest.queue.filter((item) => item.test).length)
  })

  it('в итоги недели не попадают ни сама тестовая заявка, ни её оплата и допуск', async () => {
    // 16 марта 2020 - понедельник: неделя с 9 марта, в других тестах её нет.
    await db().execute(sql`delete from bootcamp_lead_events where type = 'weekly_summary' and data->>'week' = '2020-03-09'`)
    const inWeek = sql`${'2020-03-10T10:00:00Z'}::timestamptz`
    const real = await lead('summary-test')
    const check = await lead('summary-test')
    await db().execute(sql`update bootcamp_leads set created_at = ${inWeek} where id = ${real.id}`)
    await db().execute(sql`update bootcamp_leads set created_at = ${inWeek}, entry_submitted_at = ${inWeek}, is_test = true where id = ${check.id}`)
    await db().execute(sql`insert into bootcamp_lead_events (lead_id, type, message, created_at, updated_at) values (${check.id}, 'admitted', 'фикстура', ${inWeek}, now())`)
    const payment = await payload.create({ collection: 'bootcamp-payments', data: { lead: check.id, amountKopecks: 4_500_000, status: 'pending', method: 'manual' }, overrideAccess: true })
    await db().execute(sql`update bootcamp_payments set status = 'paid', paid_at = ${inWeek} where id = ${payment.id}`)

    expect(await sendWeeklySummary(payload, new Date('2020-03-16T08:00:00Z'))).toBeGreaterThan(0)
    await vi.waitFor(() => expect(summaries(NODEJS)).toHaveLength(1))
    expect(summaries(NODEJS)[0].split('\n').slice(1, 6)).toEqual(['Новых заявок: 1', 'Прислали решение: 0', 'Допущены: 0', 'Оплат не было', 'Зачислены: 0'])
  })
})

describe('итоги недели в Telegram', () => {
  // 2 марта 2020 - понедельник, 10:30 по Москве. Других данных в той неделе нет.
  const monday = new Date('2020-03-02T07:30:00Z')
  const at = (iso: string) => sql`${iso}::timestamptz`

  it('уходит один раз с числами прошлой недели и отметкой в журнале', async () => {
    await db().execute(sql`delete from bootcamp_lead_events where type = 'weekly_summary' and data->>'week' in ('2020-02-24', '2020-03-02')`)
    const first = await lead('summary')
    const second = await lead('summary')
    await db().execute(sql`update bootcamp_leads set created_at = ${at('2020-02-25T10:00:00Z')}, entry_submitted_at = ${at('2020-02-26T10:00:00Z')} where id = ${first.id}`)
    await db().execute(sql`update bootcamp_leads set created_at = ${at('2020-03-01T20:59:00Z')} where id = ${second.id}`)
    await db().execute(sql`insert into bootcamp_lead_events (lead_id, type, message, created_at, updated_at) values (${first.id}, 'admitted', 'фикстура', ${at('2020-02-27T10:00:00Z')}, now())`)
    const payment = await payload.create({ collection: 'bootcamp-payments', data: { lead: first.id, amountKopecks: 4_500_000, status: 'pending', method: 'manual' }, overrideAccess: true })
    await db().execute(sql`update bootcamp_payments set status = 'paid', paid_at = ${at('2020-02-28T10:00:00Z')} where id = ${payment.id}`)
    await db().execute(sql`insert into bootcamp_refunds (lead_id, payment_id, amount_kopecks, status, method, reason, finished_at, created_at, updated_at) values (${first.id}, ${payment.id}, 2000000, 'done', 'manual', 'фикстура', ${at('2020-02-29T10:00:00Z')}, now(), now())`)
    // Тестовая оплата и заявка следующей недели в сводку не попадают.
    const test = await payload.create({ collection: 'bootcamp-payments', data: { lead: second.id, amountKopecks: 100, status: 'pending', method: 'robokassa', isTest: true }, overrideAccess: true })
    await db().execute(sql`update bootcamp_payments set status = 'paid', paid_at = ${at('2020-02-28T11:00:00Z')} where id = ${test.id}`)
    const next = await lead('summary')
    await db().execute(sql`update bootcamp_leads set created_at = ${at('2020-03-01T21:00:00Z')} where id = ${next.id}`)

    expect(await sendWeeklySummary(payload, monday)).toBeGreaterThan(0)
    expect(await sendWeeklySummary(payload, new Date(monday.getTime() + 60_000))).toBe(0)
    await vi.waitFor(() => expect(summaries(NODEJS)).toHaveLength(1))
    const [text] = summaries(NODEJS)
    expect(text.split('\n').slice(0, 7)).toEqual([
      'Буткемп Node.js: итоги недели 24 февраля - 1 марта',
      'Новых заявок: 2',
      'Прислали решение: 1',
      'Допущены: 1',
      'Оплатили: 1 на 45 000 ₽',
      'Зачислены: 0',
      'Вернули деньги: 1 на 20 000 ₽',
    ])
    expect(text).toMatch(/Ждут вашего действия сейчас: \d+|Заявок, которые ждут вашего действия, нет/)
    expect(text).toContain('/admin/bootcamp-funnel?program=nodejs')
    expect(text).not.toMatch(/[—–]/)
    const marks = await payload.find({ collection: 'bootcamp-lead-events', where: { type: { equals: 'weekly_summary' } }, limit: 100, depth: 0, overrideAccess: true })
    expect(marks.docs.filter((doc) => { const data = doc.data as { week?: string, program?: string } | null; return data?.week === '2020-02-24' && data.program === 'nodejs' })).toHaveLength(1)
  })

  it('два запуска одновременно шлют одну сводку; не в понедельник и до 10:00 - ничего', async () => {
    const nextMonday = new Date('2020-03-09T08:00:00Z')
    await db().execute(sql`delete from bootcamp_lead_events where type = 'weekly_summary' and data->>'week' = '2020-03-02'`)
    const results = await Promise.all([sendWeeklySummary(payload, nextMonday), sendWeeklySummary(payload, nextMonday)])
    await vi.waitFor(() => expect(telegram).toHaveLength(results[0] + results[1]))
    expect(summaries(NODEJS)).toHaveLength(1)
    expect(summaries(NODEJS)[0]).toContain('Оплат не было')
    expect(await sendWeeklySummary(payload, new Date('2020-03-10T08:00:00Z'))).toBe(0)
    expect(await sendWeeklySummary(payload, new Date('2020-03-16T06:59:00Z'))).toBe(0)
    expect(summaries(NODEJS)).toHaveLength(1)
  })
})

describe('программы ведутся отдельно', () => {
  const program = async (shortTitle: string, data: { isActive?: boolean } = {}) => (await createProgram(payload, { shortTitle, ...data })).key

  it('шаги, деньги, источники и список дел считаются по выбранной программе', async () => {
    const source = uid('utm').toLowerCase()
    const key = await program('Python')
    const mine = await lead(source, key)
    const other = await lead(source)
    await db().execute(sql`update bootcamp_leads set created_at = ${ago(3)}, status = 'paid', paid_at = ${ago(2)} where id in (${mine.id}, ${other.id})`)
    for (const [leadId, amount] of [[mine.id, 7_000_000], [other.id, 4_500_000]]) {
      const payment = await payload.create({ collection: 'bootcamp-payments', data: { lead: leadId, amountKopecks: amount, status: 'pending', method: 'manual' }, overrideAccess: true })
      await db().execute(sql`update bootcamp_payments set status = 'paid', paid_at = ${ago(2)} where id = ${payment.id}`)
      if (leadId === mine.id) await refund(leadId, payment.id, 1_000_000, 'done', ago(1))
    }
    const report = (params: Record<string, string>) => bootcampFunnel(payload, parseFunnelFilter({ period: '7', source: `utm:${source}`, ...params }, new Date(), [key, 'nodejs']))

    const python = await report({ program: key })
    expect(python.steps.find((item) => item.key === 'leads')?.count).toBe(1)
    expect(python.steps.find((item) => item.key === 'paid')?.count).toBe(1)
    expect(python.revenue).toEqual({ kopecks: 7_000_000, payments: 1, refundedKopecks: 1_000_000, refunds: 1 })
    expect(python.sources.find((item) => item.key === `utm:${source}`)?.leads).toBe(1)
    expect(python.queue.map((item) => item.id)).toEqual([mine.id])
    expect(python.queueTotal).toBe(1)
    expect(python.queueElsewhere).toBeGreaterThanOrEqual(1)

    const nodejs = await report({ program: 'nodejs' })
    expect(nodejs.revenue).toEqual({ kopecks: 4_500_000, payments: 1, refundedKopecks: 0, refunds: 0 })
    expect(nodejs.queue.some((item) => item.id === mine.id)).toBe(false)
    expect(nodejs.queue.find((item) => item.id === other.id)?.program).toBe('nodejs')

    const all = await report({ program: '' })
    expect(all.revenue).toEqual({ kopecks: 11_500_000, payments: 2, refundedKopecks: 1_000_000, refunds: 1 })
    expect(all.queue.filter((item) => [mine.id, other.id].includes(item.id))).toHaveLength(2)
    expect(all.queueElsewhere).toBe(0)
  })

  it('открытые программы идут в списке раньше закрытых', async () => {
    const closed = await program('Закрытая', { isActive: false })
    const open = await program('Открытая')
    const keys = (await funnelPrograms(payload)).map((item) => item.key)
    expect(keys).toContain(closed)
    expect(keys.indexOf(open)).toBeLessThan(keys.indexOf(closed))
  })

  it('итоги недели: своё сообщение и своя отметка у каждой программы, числа не смешиваются', async () => {
    // 6 апреля 2020 - понедельник: неделя с 30 марта, в других тестах её нет.
    const monday = new Date('2020-04-06T08:00:00Z')
    const inWeek = sql`${'2020-04-01T10:00:00Z'}::timestamptz`
    await db().execute(sql`delete from bootcamp_lead_events where type = 'weekly_summary' and data->>'week' = '2020-03-30'`)
    const key = await program('Rust')
    const mine = await lead('summary-split', key)
    const other = await lead('summary-split')
    const another = await lead('summary-split', key)
    await db().execute(sql`update bootcamp_leads set created_at = ${inWeek} where id in (${mine.id}, ${other.id}, ${another.id})`)

    expect(await sendWeeklySummary(payload, monday)).toBeGreaterThanOrEqual(2)
    await vi.waitFor(() => expect(summaries('Rust')).toHaveLength(1))
    await vi.waitFor(() => expect(summaries(NODEJS)).toHaveLength(1))
    expect(summaries('Rust')[0].split('\n').slice(0, 2)).toEqual(['Буткемп Rust: итоги недели 30 марта - 5 апреля', 'Новых заявок: 2'])
    expect(summaries('Rust')[0]).toContain(`/admin/bootcamp-funnel?program=${key}`)
    expect(summaries(NODEJS)[0].split('\n')[1]).toBe('Новых заявок: 1')

    expect(await sendWeeklySummary(payload, new Date(monday.getTime() + 60_000))).toBe(0)
    expect(summaries('Rust')).toHaveLength(1)
    const marks = rowsOf<{ program: string }>(await db().execute(sql`select data->>'program' as program from bootcamp_lead_events where type = 'weekly_summary' and data->>'week' = '2020-03-30'`))
    expect(marks.map((row) => row.program)).toEqual(expect.arrayContaining(['nodejs', key]))
    expect(new Set(marks.map((row) => row.program)).size).toBe(marks.length)
  })

  it('закрытая программа без событий молчит, а с событием за неделю присылает итоги', async () => {
    const quietMonday = new Date('2020-04-20T08:00:00Z')
    const busyMonday = new Date('2020-04-27T08:00:00Z')
    await db().execute(sql`delete from bootcamp_lead_events where type = 'weekly_summary' and data->>'week' in ('2020-04-13', '2020-04-20')`)
    const key = await program('Архив', { isActive: false })
    await sendWeeklySummary(payload, quietMonday)
    await vi.waitFor(() => expect(summaries(NODEJS)).toHaveLength(1))
    expect(summaries('Архив')).toHaveLength(0)
    const late = await lead('summary-closed', key)
    await db().execute(sql`update bootcamp_leads set created_at = ${'2020-04-22T10:00:00Z'}::timestamptz where id = ${late.id}`)
    await sendWeeklySummary(payload, busyMonday)
    await vi.waitFor(() => expect(summaries('Архив')).toHaveLength(1))
    expect(summaries('Архив')[0].split('\n')[1]).toBe('Новых заявок: 1')
  })

  it('отметка без программы, сделанная до разделения, закрывает неделю для всех', async () => {
    const monday = new Date('2020-05-04T08:00:00Z')
    await db().execute(sql`delete from bootcamp_lead_events where type = 'weekly_summary' and data->>'week' = '2020-04-27'`)
    await db().execute(sql`insert into bootcamp_lead_events (type, message, data, created_at, updated_at) values ('weekly_summary', 'фикстура', ${'{"week":"2020-04-27"}'}::jsonb, now(), now())`)
    expect(await sendWeeklySummary(payload, monday)).toBe(0)
    expect(telegram).toHaveLength(0)
  })

  it('сбой одной программы не мешает другим, следующий запуск повторяет только её', async () => {
    const monday = new Date('2020-05-11T08:00:00Z')
    await db().execute(sql`delete from bootcamp_lead_events where type = 'weekly_summary' and data->>'week' = '2020-05-04'`)
    const key = await program('Сбой')
    const create = payload.create.bind(payload)
    const failing = vi.spyOn(payload, 'create').mockImplementation(((args: Parameters<typeof payload.create>[0]) => {
      const data = (args.data as { data?: { program?: string } }).data
      if (args.collection === 'bootcamp-lead-events' && data?.program === key) return Promise.reject(new Error('журнал недоступен'))
      return create(args)
    }) as typeof payload.create)
    await sendWeeklySummary(payload, monday)
    failing.mockRestore()
    await vi.waitFor(() => expect(summaries(NODEJS)).toHaveLength(1))
    expect(summaries('Сбой')).toHaveLength(0)

    await sendWeeklySummary(payload, new Date(monday.getTime() + 60_000))
    await vi.waitFor(() => expect(summaries('Сбой')).toHaveLength(1))
    expect(summaries(NODEJS)).toHaveLength(1)
  })
})
