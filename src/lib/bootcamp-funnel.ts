/**
 * Воронка буткемпа: шаги, фильтры страницы и окно еженедельной сводки. Расчёт по базе -
 * src/server/bootcamp-funnel.ts, здесь только то, что проверяется без базы.
 */

const DAY_MS = 24 * 60 * 60_000
const HOUR_MS = 60 * 60_000
const MOSCOW_OFFSET_MS = 3 * HOUR_MS

export const FUNNEL_PERIODS = [
  { value: '7', label: '7 дней', days: 7 },
  { value: '30', label: '30 дней', days: 30 },
  { value: '90', label: '90 дней', days: 90 },
  { value: '365', label: 'Год', days: 365 },
  { value: 'all', label: 'Всё время', days: null },
] as const
export type FunnelPeriod = (typeof FUNNEL_PERIODS)[number]['value']
const DEFAULT_PERIOD = FUNNEL_PERIODS[2]

export const FUNNEL_STEPS = [
  { key: 'leads', label: 'Заявки' },
  { key: 'submitted', label: 'Прислали решение входного задания' },
  { key: 'admitted', label: 'Допущены' },
  { key: 'paid', label: 'Оплатили' },
  { key: 'enrolled', label: 'Зачислены' },
  { key: 'gitlab', label: 'Вошли в GitLab' },
  { key: 'mr', label: 'Открыли первый MR' },
] as const
export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]['key']

export const ACTION_REASONS = [
  { value: 'review', label: 'Решение ждёт ответа' },
  { value: 'payment_expired', label: 'Срок оплаты истёк' },
  { value: 'not_enrolled', label: 'Оплачен, зачисление не начато' },
  { value: 'enrollment_failed', label: 'Зачисление не удалось' },
  { value: 'next_action', label: 'Подошло назначенное действие' },
] as const
export type ActionReason = (typeof ACTION_REASONS)[number]['value']
export const actionReasonLabel = (reason: string) => ACTION_REASONS.find((item) => item.value === reason)?.label ?? reason

export type FunnelFilter = { period: FunnelPeriod, from: Date | null, to: Date, source: string | null }

type SearchParams = Record<string, string | string[] | undefined> | undefined
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

/**
 * Источник заявки одной строкой: метка utm_source, иначе сайт перехода, иначе прямой заход.
 * Тот же ключ строит SQL в src/server/bootcamp-funnel.ts.
 */
const SOURCE_KEY = /^(?:utm:.{1,100}|ref:.{1,255}|direct)$/su

export function parseFunnelFilter(params: SearchParams, now: Date): FunnelFilter {
  const raw = first(params?.period)
  const period = FUNNEL_PERIODS.find((item) => item.value === raw) ?? DEFAULT_PERIOD
  const source = first(params?.source)
  return {
    period: period.value,
    from: period.days === null ? null : new Date(now.getTime() - period.days * DAY_MS),
    to: now,
    source: SOURCE_KEY.test(source) ? source : null,
  }
}

export function sourceLabel(key: string): string {
  if (key.startsWith('utm:')) return key.slice(4)
  if (key.startsWith('ref:')) return `переход с ${key.slice(4)}`
  return 'прямой заход'
}

/** Доля в процентах; null, когда делить не на что. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}

function days(count: number): string {
  const whole = Math.abs(count) % 100
  const last = whole % 10
  if (whole > 10 && whole < 20) return 'дней'
  if (last === 1) return 'день'
  return last >= 2 && last <= 4 ? 'дня' : 'дней'
}

/** Сколько прошло между шагами: минуты, часы до двух суток, дальше дни с одним знаком. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return 'нет данных'
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / 60_000))} мин`
  if (ms < 2 * DAY_MS) return `${Math.round(ms / HOUR_MS)} ч`
  const value = Math.round((ms / DAY_MS) * 10) / 10
  return Number.isInteger(value) ? `${value} ${days(value)}` : `${String(value).replace('.', ',')} дня`
}

export type SummaryWindow = { week: string, from: Date, to: Date }

/**
 * Сводка уходит в понедельник с 10:00 до конца дня по Москве и описывает прошлую неделю
 * с понедельника по воскресенье. В другие дни пропущенную сводку не досылаем: она устарела.
 */
export function weeklySummaryWindow(now: Date): SummaryWindow | null {
  const moscow = now.getTime() + MOSCOW_OFFSET_MS
  const day = Math.floor(moscow / DAY_MS)
  const isMonday = new Date(day * DAY_MS).getUTCDay() === 1
  if (!isMonday || moscow - day * DAY_MS < 10 * HOUR_MS) return null
  const to = new Date(day * DAY_MS - MOSCOW_OFFSET_MS)
  const from = new Date(to.getTime() - 7 * DAY_MS)
  return { week: new Date((day - 7) * DAY_MS).toISOString().slice(0, 10), from, to }
}

const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })

/** «26 октября - 1 ноября»: последний день недели - воскресенье, поэтому от конца отнимаем миллисекунду. */
export function formatWeek(window: SummaryWindow): string {
  return `${dayMonth.format(window.from)} - ${dayMonth.format(new Date(window.to.getTime() - 1))}`
}
