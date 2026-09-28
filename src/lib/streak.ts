/**
 * Серия дней с пройденными уроками — как её видит ученик.
 *
 * Хук `updateStreak` пересчитывает серию только при прохождении урока, поэтому
 * после перерыва в базе остаётся старое число. Прервалась серия или нет,
 * решается здесь по дате последней активности. Дни — в UTC, как в хуке:
 * иначе экран и начисление разошлись бы около полуночи.
 */

export type StreakLike = {
  currentStreak?: number | null
  longestStreak?: number | null
  lastActivityDate?: string | null
} | null | undefined

/** today — урок сегодня уже был; at-risk — был вчера, сегодня ещё нет; none — серии нет. */
export type StreakStatus = 'today' | 'at-risk' | 'none'

export type StreakView = {
  days: number
  status: StreakStatus
  longest: number
}

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function streakView(streak: StreakLike, now: Date = new Date()): StreakView {
  const longest = streak?.longestStreak ?? 0
  const last = streak?.lastActivityDate?.slice(0, 10) ?? null
  const current = streak?.currentStreak ?? 0
  if (!last || current <= 0) return { days: 0, status: 'none', longest }

  const today = utcDay(now)
  const yesterday = utcDay(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  if (last === today) return { days: current, status: 'today', longest }
  if (last === yesterday) return { days: current, status: 'at-risk', longest }
  return { days: 0, status: 'none', longest }
}
