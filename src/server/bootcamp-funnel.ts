import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { formatRubles } from '@/lib/bootcamp-admission'
import { FUNNEL_STEPS, formatWeek, percent, sourceLabel, weeklySummaryWindow, type FunnelFilter, type FunnelStepKey, type SummaryWindow } from '@/lib/bootcamp-funnel'
import { collectAllPages } from '@/lib/paginate'
import { logger } from '@/lib/telemetry'
import { adminLink } from '@/server/admin-telegram'
import { inTransaction, recordLeadEvent, rowsOf, txDb } from '@/server/bootcamp-lead-events'

/**
 * Воронка считается по заявкам, созданным за период: сколько из них дошло до каждого шага.
 * Программы ведутся отдельно: страница открывает одну программу, итоги недели уходят по каждой.
 * Деньги за период - по дате оплаты. Тестовые заявки и тестовые оплаты Робокассы нигде не учитываются,
 * кроме списка дел: проверку тоже надо довести до конца.
 */

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = (payload: Payload) => (payload.db as unknown as { drizzle: Db }).drizzle

const iso = (value: Date | null) => value ? value.toISOString() : null
const num = (value: unknown) => value === null || value === undefined ? 0 : Number(value)
const ms = (seconds: unknown) => seconds === null || seconds === undefined ? null : Number(seconds) * 1000

// Источник заявки: та же схема ключей, что в sourceLabel (src/lib/bootcamp-funnel.ts).
const SOURCE = sql`case when coalesce(l.source_utm_source, '') <> '' then 'utm:' || l.source_utm_source
  when coalesce(l.source_referrer_host, '') <> '' then 'ref:' || l.source_referrer_host
  else 'direct' end`

// Каждая заявка периода с моментами шагов. Допущенным считается и тот, кого зачислили до появления
// шага допуска: у таких заявок нет ни отметки, ни события, но этап уже дальше.
const cohort = (filter: FunnelFilter) => sql`
  select l.id, l.created_at, l.entry_submitted_at, l.entry_passed, l.entry_total, ${SOURCE} as source,
    coalesce(l.admitted_at, adm.at) as admitted_at,
    (l.admitted_at is not null or adm.at is not null or l.status in ('admitted', 'paid', 'enrolled') or en.id is not null) as admitted,
    pay.at as paid_at,
    case when en.status = 'done' then coalesce(en.finished_at, en.updated_at) end as enrolled_at,
    en.gitlab_signed_in_at as gitlab_at,
    mr.at as mr_at
  from bootcamp_leads l
  left join bootcamp_enrollments en on en.lead_id = l.id
  left join lateral (select min(e.created_at) as at from bootcamp_lead_events e where e.lead_id = l.id and e.type = 'admitted') adm on true
  left join lateral (select min(p.paid_at) as at from bootcamp_payments p where p.lead_id = l.id and p.status = 'paid' and not coalesce(p.is_test, false)) pay on true
  left join lateral (select min(e.created_at) as at from bootcamp_lead_events e where e.lead_id = l.id and e.type = 'gitlab_event' and e.data->>'event' = 'Merge Request Hook') mr on true
  where not coalesce(l.is_test, false)
    and (${filter.program}::text is null or l.program = ${filter.program}::text)
    and (${iso(filter.from)}::timestamptz is null or l.created_at >= ${iso(filter.from)}::timestamptz)
    and l.created_at < ${iso(filter.to)}::timestamptz`

const median = (later: string, earlier: string) => sql.raw(`percentile_cont(0.5) within group (order by greatest(0, extract(epoch from ${later} - ${earlier}))) filter (where ${later} is not null and ${earlier} is not null)`)

export type FunnelStep = { key: FunnelStepKey, label: string, count: number, fromPrevious: number | null, fromLeads: number | null, median: number | null }
export type FunnelSource = { key: string, label: string, leads: number, submitted: number, admitted: number, paid: number, enrolled: number }
export type FunnelQueueItem = { id: number, email: string, name: string | null, program: string, reason: string, since: string | null, test: boolean }
export type FunnelReport = {
  steps: FunnelStep[]
  entryScore: number | null
  revenue: { kopecks: number, payments: number }
  sources: FunnelSource[]
  queue: FunnelQueueItem[]
  queueTotal: number
  // Сколько заявок ждут действия в других программах: дела не должны теряться за фильтром.
  queueElsewhere: number
}

export type FunnelProgram = { key: string, shortTitle: string, isActive: boolean }

/** Программы для переключателя и итогов недели: сначала открытые, в порядке создания. */
export async function funnelPrograms(payload: Payload): Promise<FunnelProgram[]> {
  const docs = await collectAllPages(({ page, limit }) => payload.find({ collection: 'bootcamp-programs', sort: 'id', page, limit, depth: 0, overrideAccess: true }), { label: 'программы буткемпов' })
  return docs.map(({ key, shortTitle, isActive }) => ({ key, shortTitle, isActive: isActive === true })).sort((a, b) => Number(b.isActive) - Number(a.isActive))
}

type StepRow = Record<FunnelStepKey, string | number> & { entry_score: string | number | null } & Record<`m_${Exclude<FunnelStepKey, 'leads'>}`, string | number | null>

export async function bootcampFunnel(payload: Payload, filter: FunnelFilter): Promise<FunnelReport> {
  const [stats] = rowsOf<StepRow>(await db(payload).execute(sql`
    with cohort as (${cohort(filter)})
    select count(*) as leads,
      count(*) filter (where entry_submitted_at is not null) as submitted,
      count(*) filter (where admitted) as admitted,
      count(*) filter (where paid_at is not null) as paid,
      count(*) filter (where enrolled_at is not null) as enrolled,
      count(*) filter (where gitlab_at is not null) as gitlab,
      count(*) filter (where mr_at is not null) as mr,
      ${median('entry_submitted_at', 'created_at')} as m_submitted,
      ${median('admitted_at', 'entry_submitted_at')} as m_admitted,
      ${median('paid_at', 'admitted_at')} as m_paid,
      ${median('enrolled_at', 'paid_at')} as m_enrolled,
      ${median('gitlab_at', 'enrolled_at')} as m_gitlab,
      ${median('mr_at', 'gitlab_at')} as m_mr,
      avg(entry_passed::float / nullif(entry_total, 0)) filter (where entry_submitted_at is not null) as entry_score
    from cohort
    where ${filter.source}::text is null or source = ${filter.source}::text`))

  const total = num(stats?.leads)
  const steps = FUNNEL_STEPS.map((step, index): FunnelStep => {
    const count = num(stats?.[step.key])
    const previous = index > 0 ? num(stats?.[FUNNEL_STEPS[index - 1].key]) : null
    return {
      key: step.key,
      label: step.label,
      count,
      fromPrevious: previous === null ? null : percent(count, previous),
      fromLeads: index > 0 ? percent(count, total) : null,
      median: step.key === 'leads' ? null : ms(stats?.[`m_${step.key}`]),
    }
  })

  const sources = rowsOf<{ source: string, leads: string, submitted: string, admitted: string, paid: string, enrolled: string }>(await db(payload).execute(sql`
    with cohort as (${cohort(filter)})
    select source, count(*) as leads,
      count(*) filter (where entry_submitted_at is not null) as submitted,
      count(*) filter (where admitted) as admitted,
      count(*) filter (where paid_at is not null) as paid,
      count(*) filter (where enrolled_at is not null) as enrolled
    from cohort group by source order by count(*) desc, source`)).map((row) => ({
    key: row.source, label: sourceLabel(row.source), leads: num(row.leads), submitted: num(row.submitted), admitted: num(row.admitted), paid: num(row.paid), enrolled: num(row.enrolled),
  }))

  const [money] = rowsOf<{ kopecks: string | null, payments: string }>(await db(payload).execute(sql`
    select sum(p.amount_kopecks) as kopecks, count(*) as payments
    from bootcamp_payments p join bootcamp_leads l on l.id = p.lead_id
    where p.status = 'paid' and not coalesce(p.is_test, false) and not coalesce(l.is_test, false)
      and (${filter.program}::text is null or l.program = ${filter.program}::text)
      and (${iso(filter.from)}::timestamptz is null or p.paid_at >= ${iso(filter.from)}::timestamptz) and p.paid_at < ${iso(filter.to)}::timestamptz
      and (${filter.source}::text is null or ${SOURCE} = ${filter.source}::text)`))

  const { queue, total: queueTotal } = await actionQueue(payload, { program: filter.program })
  const queueElsewhere = filter.program === null ? 0 : (await actionQueue(payload)).total - queueTotal
  return {
    steps,
    entryScore: stats?.entry_score === null || stats?.entry_score === undefined ? null : Number(stats.entry_score),
    revenue: { kopecks: num(money?.kopecks), payments: num(money?.payments) },
    sources,
    queue,
    queueTotal,
    queueElsewhere,
  }
}

const QUEUE_LIMIT = 50

/**
 * Заявки, где следующий шаг за командой: от самой давней. Период и источник на список дел
 * не влияют, а программа влияет: у каждой свой список.
 * Тестовые заявки в нём есть с пометкой; в число для итогов недели они не входят.
 */
export async function actionQueue(payload: Payload, { withTest = true, program = null }: { withTest?: boolean, program?: string | null } = {}): Promise<{ queue: FunnelQueueItem[], total: number }> {
  const rows = rowsOf<{ id: number, email: string, name: string | null, program: string, reason: string, since: string | null, test: boolean, total: string }>(await db(payload).execute(sql`
    select id, email, name, program, reason, since, test, count(*) over () as total from (
      select l.id, l.email, l.name, l.program, coalesce(l.is_test, false) as test,
        case
          when l.status in ('new', 'contacted', 'diagnostic') and l.entry_submitted_at is not null then 'review'
          when l.status = 'admitted' and l.paid_at is null and l.payment_due_at < now() then 'payment_expired'
          when l.status = 'paid' and en.id is null then 'not_enrolled'
          when en.status = 'failed' then 'enrollment_failed'
          when l.next_action_at <= now() and l.status not in ('enrolled', 'rejected', 'withdrawn') then 'next_action'
        end as reason,
        case
          when l.status in ('new', 'contacted', 'diagnostic') and l.entry_submitted_at is not null then l.entry_submitted_at
          when l.status = 'admitted' and l.paid_at is null and l.payment_due_at < now() then l.payment_due_at
          when l.status = 'paid' and en.id is null then l.paid_at
          when en.status = 'failed' then en.updated_at
          else l.next_action_at
        end as since
      from bootcamp_leads l left join bootcamp_enrollments en on en.lead_id = l.id
    ) waiting
    where reason is not null and (${withTest}::boolean or not test) and (${program}::text is null or program = ${program}::text)
    order by since asc nulls last, id
    limit ${QUEUE_LIMIT}`))
  return {
    queue: rows.map(({ id, email, name, program: key, reason, since, test }) => ({ id: Number(id), email, name, program: key, reason, since: since ? new Date(since).toISOString() : null, test: test === true })),
    total: num(rows[0]?.total),
  }
}

export type WeekActivity = { leads: number, submitted: number, admitted: number, paid: number, paidKopecks: number, enrolled: number }

export async function weekActivity(payload: Payload, window: SummaryWindow, program: string): Promise<WeekActivity> {
  const from = window.from.toISOString()
  const to = window.to.toISOString()
  // Счета, события и зачисления без заявки (заявка удалена) тоже не считаем: проверить, тестовая ли она, нельзя.
  const [row] = rowsOf<Record<keyof WeekActivity, string | null>>(await db(payload).execute(sql`
    with counted as (select id, created_at, entry_submitted_at from bootcamp_leads where program = ${program} and not coalesce(is_test, false)),
    paid as (select p.amount_kopecks from bootcamp_payments p join counted on counted.id = p.lead_id
      where p.status = 'paid' and not coalesce(p.is_test, false) and p.paid_at >= ${from}::timestamptz and p.paid_at < ${to}::timestamptz)
    select
      (select count(*) from counted where created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz) as leads,
      (select count(*) from counted where entry_submitted_at >= ${from}::timestamptz and entry_submitted_at < ${to}::timestamptz) as submitted,
      (select count(distinct e.lead_id) from bootcamp_lead_events e join counted on counted.id = e.lead_id where e.type = 'admitted' and e.created_at >= ${from}::timestamptz and e.created_at < ${to}::timestamptz) as admitted,
      (select count(*) from paid) as paid,
      (select sum(amount_kopecks) from paid) as "paidKopecks",
      (select count(*) from bootcamp_enrollments en join counted on counted.id = en.lead_id where en.status = 'done' and en.finished_at >= ${from}::timestamptz and en.finished_at < ${to}::timestamptz) as enrolled`))
  return { leads: num(row?.leads), submitted: num(row?.submitted), admitted: num(row?.admitted), paid: num(row?.paid), paidKopecks: num(row?.paidKopecks), enrolled: num(row?.enrolled) }
}

export const FUNNEL_ADMIN_PATH = '/admin/bootcamp-funnel'
// Номер замка сводки: два процесса приложения во время выката не должны прислать её дважды.
const SUMMARY_LOCK = 107_031

/**
 * Итоги прошлой недели в Telegram по понедельникам: отдельное сообщение на каждую программу.
 * Закрытая программа без дел и событий за неделю молчит. Сбой одной программы не мешает другим:
 * её отметки нет, поэтому следующий запуск планировщика повторит только её.
 * Возвращает, сколько сводок отправлено.
 */
export async function sendWeeklySummary(payload: Payload, now = new Date()): Promise<number> {
  const window = weeklySummaryWindow(now)
  if (!window) return 0
  let sent = 0
  for (const program of await funnelPrograms(payload)) {
    try {
      if (await sendProgramSummary(payload, program, window)) sent += 1
    } catch (error) {
      logger.error('Bootcamp weekly summary failed', error, { 'program.key': program.key, 'summary.week': window.week })
    }
  }
  return sent
}

/**
 * Отметка - событие журнала с неделей и программой: его пишем в той же транзакции под замком,
 * поэтому повторный запуск ничего не шлёт. Отметка без программы (до разделения) закрывает неделю для всех.
 */
async function sendProgramSummary(payload: Payload, program: FunnelProgram, window: SummaryWindow): Promise<boolean> {
  return inTransaction(payload, null, async (req) => {
    const tx = await txDb(req)
    await tx.execute(sql`select pg_advisory_xact_lock(${SUMMARY_LOCK})`)
    const sent = rowsOf(await tx.execute(sql`select 1 from bootcamp_lead_events where type = 'weekly_summary' and data->>'week' = ${window.week} and coalesce(data->>'program', ${program.key}) = ${program.key} limit 1`))
    if (sent.length > 0) return false
    const week = await weekActivity(payload, window, program.key)
    const { total: waiting } = await actionQueue(payload, { withTest: false, program: program.key })
    const quiet = week.leads + week.submitted + week.admitted + week.paid + week.enrolled + waiting === 0
    if (quiet && !program.isActive) return false
    const lines = [
      `Новых заявок: ${week.leads}`,
      `Прислали решение: ${week.submitted}`,
      `Допущены: ${week.admitted}`,
      week.paid > 0 ? `Оплатили: ${week.paid} на ${formatRubles(week.paidKopecks)}` : 'Оплат не было',
      `Зачислены: ${week.enrolled}`,
      waiting > 0 ? `Ждут вашего действия сейчас: ${waiting}` : 'Заявок, которые ждут вашего действия, нет',
    ]
    await recordLeadEvent(payload, req, {
      lead: null,
      type: 'weekly_summary',
      message: `Итоги недели ${formatWeek(window)}, ${program.shortTitle}: ${lines.join(', ').toLowerCase()}`,
      data: { week: window.week, program: program.key },
      telegram: { title: `Буткемп ${program.shortTitle}: итоги недели ${formatWeek(window)}`, lines, link: adminLink(`${FUNNEL_ADMIN_PATH}?program=${encodeURIComponent(program.key)}`) },
    })
    return true
  })
}
