import { pluralize } from '@/lib/utils'
import { utcDay } from '@/lib/streak'

/** Сколько недель показывает календарь активности: около четырёх месяцев. */
export const ACTIVITY_WEEKS = 17

const DAY_MS = 24 * 60 * 60 * 1000

export type DayActivity = { lessons: number; tasks: number }

export type ActivityCell = {
  date: string
  lessons: number
  tasks: number
  /** 0 — ничего, 4 — самый насыщенный день. */
  level: 0 | 1 | 2 | 3 | 4
  /** Дни после сегодняшнего в последней неделе — пустые клетки. */
  future: boolean
}

/** Первый показываемый день: понедельник недели, начавшейся ACTIVITY_WEEKS недель назад. */
export function activityStart(now: Date, weeks = ACTIVITY_WEEKS): Date {
  const today = new Date(`${utcDay(now)}T00:00:00Z`)
  const weekday = (today.getUTCDay() + 6) % 7 // понедельник — 0
  return new Date(today.getTime() - (weekday + (weeks - 1) * 7) * DAY_MS)
}

/** Дни в UTC — как у серии, чтобы календарь и «дней подряд» не расходились. */
export function countByDay(lessonDates: (string | null | undefined)[], taskDates: (string | null | undefined)[]) {
  const days = new Map<string, DayActivity>()
  const add = (dates: (string | null | undefined)[], field: keyof DayActivity) => {
    for (const value of dates) {
      if (!value) continue
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) continue
      const day = utcDay(date)
      const entry = days.get(day) ?? { lessons: 0, tasks: 0 }
      entry[field] += 1
      days.set(day, entry)
    }
  }
  add(lessonDates, 'lessons')
  add(taskDates, 'tasks')
  return days
}

function level(total: number): ActivityCell['level'] {
  if (total === 0) return 0
  if (total === 1) return 1
  if (total <= 3) return 2
  if (total <= 5) return 3
  return 4
}

/** Недели-столбцы по семь дней, с понедельника. */
export function activityGrid(days: Map<string, DayActivity>, now: Date, weeks = ACTIVITY_WEEKS): ActivityCell[][] {
  const start = activityStart(now, weeks).getTime()
  const today = utcDay(now)
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = utcDay(new Date(start + (w * 7 + d) * DAY_MS))
      const { lessons, tasks } = days.get(date) ?? { lessons: 0, tasks: 0 }
      return { date, lessons, tasks, level: level(lessons + tasks), future: date > today }
    }),
  )
}

/** «2 урока, 1 задача» — подпись клетки и итог. */
export function describeActivity({ lessons, tasks }: DayActivity): string {
  const parts = [
    lessons > 0 ? pluralize(lessons, 'урок', 'урока', 'уроков') : null,
    tasks > 0 ? pluralize(tasks, 'задача', 'задачи', 'задач') : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : 'нет занятий'
}

export function activitySummary(grid: ActivityCell[][]) {
  const cells = grid.flat()
  return {
    activeDays: cells.filter((c) => c.lessons + c.tasks > 0).length,
    lessons: cells.reduce((sum, c) => sum + c.lessons, 0),
    tasks: cells.reduce((sum, c) => sum + c.tasks, 0),
  }
}
