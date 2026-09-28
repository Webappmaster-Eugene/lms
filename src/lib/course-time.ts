import { pluralize } from '@/lib/utils'

type TimedLesson = { id: number | string; estimatedMinutes?: number | null }

/** «2 ч 30 мин», «45 мин». */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (hours === 0) return `${rest} мин`
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`
}

/**
 * Сколько осталось до конца курса по оценкам уроков. У части уроков оценки
 * нет — их не выдумываем, а называем отдельно. null — считать нечего.
 */
export function remainingTime(lessons: TimedLesson[], completed: Set<string>): string | null {
  const left = lessons.filter((l) => !completed.has(String(l.id)))
  if (left.length === 0) return null
  const minutes = left.reduce((sum, l) => sum + (l.estimatedMinutes && l.estimatedMinutes > 0 ? l.estimatedMinutes : 0), 0)
  const unknown = left.filter((l) => !(l.estimatedMinutes && l.estimatedMinutes > 0)).length
  if (minutes === 0) return null
  const base = `Осталось ~${formatMinutes(minutes)}`
  return unknown > 0 ? `${base} и ${pluralize(unknown, 'урок', 'урока', 'уроков')} без оценки` : base
}
