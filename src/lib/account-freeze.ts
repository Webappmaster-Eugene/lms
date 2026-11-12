/**
 * Заморозка аккаунта: периоды, когда ученик не может войти, а открытые сессии не действуют.
 * Чистые функции без базы: их используют хуки входа, экран администратора и плашка в LMS.
 */

export const FREEZE_REASONS = {
  vacation: 'отпуск',
  left: 'ушёл',
  'no-contact': 'не выходит на связь',
  term: 'срок обучения',
  other: 'другая причина',
} as const

export type FreezeReason = keyof typeof FREEZE_REASONS
export const freezeReasons = Object.keys(FREEZE_REASONS) as FreezeReason[]

/** Сроки заморозки на экране и в CLI. `forever` - бессрочно, до разморозки вручную. */
export const FREEZE_TERMS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, forever: null } as const
export type FreezeTerm = keyof typeof FREEZE_TERMS

/** Через сколько месяцев после создания учётки замораживается ученик. */
export const AUTOMATIC_FREEZE_MONTHS = 6
/** За сколько дней до плановой заморозки ученик видит плашку. */
export const FREEZE_NOTICE_DAYS = 14

export type FreezePeriod = {
  id: number
  startsAt: string
  endsAt: string | null
  reason: FreezeReason
  automatic: boolean
  note: string | null
}

export type FreezeState = {
  /** Действующий период; при нескольких - тот, что держит дольше. */
  active: FreezePeriod | null
  /** До какого момента ученик заморожен с учётом идущих подряд периодов; null - бессрочно. */
  frozenUntil: string | null
  /** Ближайший период, который ещё не начался. */
  planned: FreezePeriod | null
  /** Сессии, созданные не позже этой отметки, больше не действуют. */
  cutoff: number | null
}

const time = (value: string) => Date.parse(value)

export function freezeState(periods: readonly FreezePeriod[], now = Date.now()): FreezeState {
  const valid = periods.filter((period) => Number.isFinite(time(period.startsAt)) && (period.endsAt === null || time(period.endsAt) > time(period.startsAt)))
  const covers = (period: FreezePeriod, at: number) => time(period.startsAt) <= at && (period.endsAt === null || at < time(period.endsAt))
  const current = valid.filter((period) => covers(period, now))

  let active: FreezePeriod | null = null
  let frozenUntil: string | null = null
  if (current.length) {
    // Периоды встык или внахлёст ученик видит одной заморозкой: «до» - конец последнего из них.
    let end = Math.max(...current.map((period) => period.endsAt === null ? Number.POSITIVE_INFINITY : time(period.endsAt)))
    for (let changed = true; changed && end !== Number.POSITIVE_INFINITY;) {
      changed = false
      for (const period of valid) {
        const periodEnd = period.endsAt === null ? Number.POSITIVE_INFINITY : time(period.endsAt)
        if (time(period.startsAt) <= end && periodEnd > end) { end = periodEnd; changed = true }
      }
    }
    active = current.reduce((longest, period) => {
      const a = longest.endsAt === null ? Number.POSITIVE_INFINITY : time(longest.endsAt)
      const b = period.endsAt === null ? Number.POSITIVE_INFINITY : time(period.endsAt)
      return b > a ? period : longest
    })
    frozenUntil = end === Number.POSITIVE_INFINITY ? null : new Date(end).toISOString()
  }

  const planned = valid.filter((period) => time(period.startsAt) > now).sort((a, b) => time(a.startsAt) - time(b.startsAt))[0] ?? null

  let cutoff: number | null = null
  for (const period of valid) {
    for (const mark of [time(period.startsAt), period.endsAt === null ? Number.NaN : time(period.endsAt)]) {
      if (Number.isFinite(mark) && mark <= now && (cutoff === null || mark > cutoff)) cutoff = mark
    }
  }
  return { active, frozenUntil, planned, cutoff }
}

/** Сессия без даты создания при заморозке считается старой: оживлять её нельзя. */
export function sessionSurvivesFreeze(session: { createdAt?: string | null }, cutoff: number | null): boolean {
  if (cutoff === null) return true
  const created = session.createdAt ? time(session.createdAt) : Number.NaN
  return Number.isFinite(created) && created > cutoff
}

// Москва живёт без перехода на летнее время с 2014 года: сдвиг постоянный.
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

/** Плюс календарные месяцы по московскому календарю; 31 января + 1 месяц = 28 или 29 февраля. */
export function addMoscowMonths(value: string | number | Date, months: number): string {
  const moscow = new Date(new Date(value).getTime() + MOSCOW_OFFSET_MS)
  const day = moscow.getUTCDate()
  moscow.setUTCDate(1)
  moscow.setUTCMonth(moscow.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth() + 1, 0)).getUTCDate()
  moscow.setUTCDate(Math.min(day, lastDay))
  return new Date(moscow.getTime() - MOSCOW_OFFSET_MS).toISOString()
}

/** «2026-12-12» → полночь этого дня по Москве. */
export function moscowDayStart(day: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const utc = Date.UTC(year, month - 1, date)
  const check = new Date(utc)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) return null
  return new Date(utc - MOSCOW_OFFSET_MS).toISOString()
}

/** Дата для поля input[type=date] по Москве. */
export function moscowDayInput(value: string | number | Date): string {
  return new Date(new Date(value).getTime() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10)
}

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' })
export const formatFreezeDate = (value: string | number | Date) => dateFormat.format(new Date(value))

/** Текст ошибки входа. Его видит только тот, кто ввёл верный пароль. */
export function frozenLoginMessage(frozenUntil: string | null): string {
  const until = frozenUntil ? ` до ${formatFreezeDate(frozenUntil)}` : ''
  return `Доступ к платформе приостановлен${until}. Чтобы продолжить обучение, напишите наставнику.`
}

/** Плановая заморозка близко: пора показать ученику плашку. */
export function freezeNoticeDue(state: FreezeState, now = Date.now()): boolean {
  return !state.active && state.planned !== null && time(state.planned.startsAt) - now <= FREEZE_NOTICE_DAYS * 24 * 60 * 60 * 1000
}
