import { describe, expect, it } from 'vitest'

import { introductionScheduleError, planTutoringScheduleChange } from '@/lib/tutoring-schedule'

const firstStart = '2027-02-16T14:00:00.000Z'
const secondStart = '2027-02-18T14:00:00.000Z'
const intro = '2027-02-16T13:00:00.000Z'

describe('Бесплатная вводная встреча', () => {
  it('заканчивается до самого раннего занятия с учетом переносов и допускает общий стык по времени', () => {
    expect(introductionScheduleError(intro, [Date.parse(secondStart), Date.parse(firstStart)])).toBeNull()
    expect(introductionScheduleError('2027-02-16T13:01:00.000Z', [
      Date.parse(secondStart), Date.parse(firstStart),
    ])).toContain('должна закончиться')
    expect(introductionScheduleError('ошибка в дате', [Date.parse(firstStart)])).toContain('Укажите дату')
  })

  it('в предварительном расписании нельзя поставить техническое занятие на последний момент вводной', () => {
    const slots = [firstStart, secondStart].map((startsAt, i) => ({ meeting: i + 1, scheduledAt: startsAt, startsAt }))
    const form = { fromMeeting: 1, firstStart: '2027-02-16T16:59', secondStart: '2027-02-18T17:00', keepOverrides: false }
    const now = Date.parse('2027-01-01T00:00:00Z')
    expect(planTutoringScheduleChange(slots, form, now, intro)).toEqual({ error: expect.stringContaining('должна закончиться') })
    expect(planTutoringScheduleChange(slots, form, now)).toMatchObject({ changed: 1 })
    expect(planTutoringScheduleChange(slots, { ...form, firstStart: '2027-02-16T17:00' }, now, intro)).toMatchObject({ changed: 0 })
  })
})
