export const TUTORING_MEETING_MINUTES = 120

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
