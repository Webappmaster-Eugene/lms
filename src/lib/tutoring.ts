export const TUTORING_MEETING_MINUTES = 120
export const TUTORING_INTRODUCTION_MINUTES = 60
export const TUTORING_GITLAB_ATTEMPTS = 5

export const tutoringPrograms = {
  nodejs: { label: 'Node.js', meetings: 32 },
  'react-next': { label: 'React + Next.js', meetings: 24 },
} as const
export type TutoringProgram = keyof typeof tutoringPrograms

export const tutoringStatuses = {
  assigned: 'Задано',
  submitted: 'На проверке',
  changes: 'На доработке',
  accepted: 'Принято',
} as const
export type TutoringStatus = keyof typeof tutoringStatuses

export const isTutoringProgram = (value: unknown): value is TutoringProgram =>
  typeof value === 'string' && Object.hasOwn(tutoringPrograms, value)

export const isTutoringStatus = (value: unknown): value is TutoringStatus =>
  typeof value === 'string' && Object.hasOwn(tutoringStatuses, value)

export function isTutoringMeeting(value: unknown, program?: TutoringProgram): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= (program ? tutoringPrograms[program].meetings : 32)
}

export function tutoringMeetingDate(startsAt: string, meeting: number) {
  const days = Math.floor((meeting - 1) / 2) * 7 + (meeting % 2 === 0 ? 2 : 0)
  return new Date(Date.parse(startsAt) + days * 86_400_000)
}

type StreamSchedule = {
  startsAt: string
  scheduleDates?: { meeting: number; startsAt: string }[] | null
  scheduleOverrides?: { meeting: number; startsAt: string }[] | null
}

export function scheduledTutoringMeeting(stream: StreamSchedule, meeting: number) {
  const regular = stream.scheduleDates?.find(row => row.meeting === meeting)
  const original = regular ? new Date(regular.startsAt) : tutoringMeetingDate(stream.startsAt, meeting)
  const override = stream.scheduleOverrides?.find(row => row.meeting === meeting)
  const start = override ? new Date(override.startsAt) : original
  const end = new Date(start.getTime() + TUTORING_MEETING_MINUTES * 60_000)
  return { original, start, end, moved: start.getTime() !== original.getTime() }
}

export function parseMoscowMeetingTime(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const timestamp = Date.parse(`${date}T${time}:00+03:00`)
  if (!Number.isFinite(timestamp) || moscowMeetingInput(new Date(timestamp)) !== `${date}T${time}`) return null
  return new Date(timestamp).toISOString()
}

export function moscowMeetingInput(date: Date) {
  return new Date(date.getTime() + 3 * 3_600_000).toISOString().slice(0, 16)
}

export const tutoringDateLabel = (date: Date) => new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
}).format(date)

export function isMoscowTuesday(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return false
  return new Date(Date.parse(value) + 3 * 3_600_000).getUTCDay() === 2
}

export function tutoringHttpsUrl(input: string): boolean {
  if (input.length > 1000 || /[\s\p{Cc}]/u.test(input)) return false
  try {
    const url = new URL(input)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}
