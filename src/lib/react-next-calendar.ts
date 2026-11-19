import program from './react-next-calendar-data.json'

/** Календарь и технические номера сдач различаются: две сдачи могут иметь один срок. */
export function reactNextStreamDeadlines(startsAt: string): { week: number; dueAt: string }[] {
  const start = Date.parse(startsAt)
  if (!Number.isFinite(start)) throw new Error('Нужна корректная дата начала потока')
  const day = 86_400_000
  const moscowDayStart = Math.floor((start + 3 * 3_600_000) / day) * day - 3 * 3_600_000
  return program.calendar.flatMap(calendar => calendar.stages.filter(stage => stage > 0).map(stage => ({
    week: stage, dueAt: new Date(moscowDayStart + calendar.number * 7 * day).toISOString(),
  })))
}
