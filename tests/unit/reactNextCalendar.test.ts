import { describe, expect, it } from 'vitest'
import { reactNextStreamDeadlines } from '@/lib/react-next-calendar'
import serverCalendar from '@/lib/react-next-calendar-data.json'
import landingProgram from '../../landing/src/data/react-next-program.json'

describe('сроки 20 сдач в 12-недельном React-потоке', () => {
  it('сервер и отдельная сборка лендинга используют один календарь', () => {
    expect(serverCalendar).toEqual({ durationWeeks: landingProgram.durationWeeks, calendar: landingProgram.calendar })
  })
  it('сохраняет номера и ставит сроки к концу календарных недель по Москве', () => {
    const start = '2027-01-04T17:00:00.000Z'
    const rows = reactNextStreamDeadlines(start)
    expect(rows.map(row => row.week)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
    expect(rows[0]?.dueAt).toBe('2027-01-10T21:00:00.000Z')
    expect(rows[1]?.dueAt).toBe(rows[2]?.dueAt)
    expect(new Set(rows.map(row => row.dueAt)).size).toBe(12)
    expect(rows[19]?.dueAt).toBe('2027-03-28T21:00:00.000Z')
  })
  it('не придумывает календарь при неверной дате', () => {
    expect(() => reactNextStreamDeadlines('bad')).toThrow('корректная дата')
  })
})
