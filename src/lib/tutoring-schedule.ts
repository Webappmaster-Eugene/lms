import { moscowMeetingInput, parseMoscowMeetingTime, scheduledTutoringMeeting, TUTORING_MEETING_MINUTES, tutoringPrograms } from '@/lib/tutoring'
import type { TutoringStream } from '@/payload-types'

const day = 86_400_000
const week = 7 * day
const duration = TUTORING_MEETING_MINUTES * 60_000

export type TutoringScheduleSlot = { meeting: number; startsAt: string; scheduledAt: string }

export type TutoringScheduleChange = {
  fromMeeting: number
  firstStart: string
  secondStart: string
  keepOverrides: boolean
}

export function tutoringScheduleSlots(stream: TutoringStream): TutoringScheduleSlot[] {
  return Array.from({ length: tutoringPrograms[stream.program].meetings }, (_, index) => {
    const meeting = index + 1
    const { start, original } = scheduledTutoringMeeting(stream, meeting)
    return { meeting, startsAt: start.toISOString(), scheduledAt: original.toISOString() }
  })
}

export function tutoringScheduleTimeline(slots: TutoringScheduleSlot[], now: number) {
  const dated = [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return {
    upcoming: dated.filter(slot => Date.parse(slot.startsAt) > now),
    past: dated.filter(slot => Date.parse(slot.startsAt) <= now).reverse(),
  }
}

export function parseMoscowScheduleInput(value: string) {
  if (value.length !== 16 || value[10] !== 'T') return null
  return parseMoscowMeetingTime(value.slice(0, 10), value.slice(11))
}

export function tutoringScheduleDefaults(slots: TutoringScheduleSlot[], first: TutoringScheduleSlot, now: number) {
  const regularStart = Date.parse(first.scheduledAt)
  const start = regularStart > now ? regularStart : Date.parse(first.startsAt)
  const next = slots.find(slot => slot.meeting === first.meeting + 1)
  const gap = Date.parse(next?.scheduledAt ?? '') - start
  const second = start + (gap >= duration && gap <= week - duration ? gap : 2 * day)
  return { firstStart: moscowMeetingInput(new Date(start)), secondStart: moscowMeetingInput(new Date(second)) }
}

export function planTutoringScheduleChange(slots: TutoringScheduleSlot[], input: TutoringScheduleChange, now: number):
  { rows: TutoringScheduleSlot[]; changed: number } | { error: string } {
  const upcoming = slots.filter(slot => slot.meeting >= input.fromMeeting && Date.parse(slot.startsAt) > now)
  if (!upcoming.some(slot => slot.meeting === input.fromMeeting)) return { error: 'Выберите предстоящую встречу' }

  const first = Date.parse(parseMoscowScheduleInput(input.firstStart) ?? '')
  if (!Number.isFinite(first) || first <= now) return { error: 'Укажите будущую дату и время начала по Москве' }
  const gap = Date.parse(parseMoscowScheduleInput(input.secondStart) ?? '') - first
  if (upcoming.length > 1 && !(gap >= duration && gap <= week - duration)) {
    return { error: 'Вторая встреча должна начаться после первой в пределах семи дней. Оставьте по два часа для каждой встречи' }
  }

  const changes = new Set<number>()
  let changed = 0
  const rows = upcoming.map(slot => {
    const offset = slot.meeting - input.fromMeeting
    const scheduledAt = new Date(first + Math.floor(offset / 2) * week + (offset % 2 ? gap : 0)).toISOString()
    const startsAt = input.keepOverrides && slot.startsAt !== slot.scheduledAt ? slot.startsAt : scheduledAt
    if (startsAt !== slot.startsAt) changes.add(slot.meeting)
    if (startsAt !== slot.startsAt || scheduledAt !== slot.scheduledAt) changed += 1
    return { meeting: slot.meeting, startsAt, scheduledAt }
  })

  const entries = new Map(rows.map(slot => [slot.meeting, slot.startsAt]))
  const ordered = slots.map(slot => ({ meeting: slot.meeting, start: Date.parse(entries.get(slot.meeting) ?? slot.startsAt) }))
    .sort((a, b) => a.start - b.start)
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]
    const current = ordered[index]
    if (previous && current && current.start - previous.start < duration && (changes.has(previous.meeting) || changes.has(current.meeting))) {
      return { error: `Встречи №${previous.meeting} и №${current.meeting} пересекаются. Измените время или снимите сохранение отдельных переносов` }
    }
  }
  return { rows, changed }
}
