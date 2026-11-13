import { describe, expect, it } from 'vitest'

import {
  activityDayKey, barStyle, biggestDrop, compareStudents, daysLabel, daysSince, formatMinutes, formatPercent, median, moscowDay, parsePeriod, parseStudentFilter, parseStudentSort,
  periodStartDay, share, stuckLesson, studentState, weekStarts, type StudentRow,
} from '@/lib/learning-analytics'

const now = Date.parse('2026-11-13T12:00:00.000Z')

describe('день сводки по Москве', () => {
  it('полночь по Москве - уже следующий день, хотя в UTC ещё вечер', () => {
    expect(moscowDay('2026-11-12T20:59:59.000Z')).toBe('2026-11-12')
    expect(moscowDay('2026-11-12T21:00:00.000Z')).toBe('2026-11-13')
  })

  it('период из N дней включает сегодняшний', () => {
    expect(periodStartDay(7, now)).toBe('2026-11-07')
    expect(periodStartDay(1, now)).toBe('2026-11-13')
  })

  it('ключ строки различает день без курса и день курса', () => {
    expect(activityDayKey(5, '2026-11-13', null)).toBe('5:2026-11-13:-')
    expect(activityDayKey(5, '2026-11-13', 42)).toBe('5:2026-11-13:42')
  })

  it('недели начинаются с понедельника по Москве, последняя - текущая', () => {
    const weeks = weekStarts(3, now)
    expect(weeks).toEqual(['2026-10-26', '2026-11-02', '2026-11-09'])
    // Воскресенье 23:30 по Москве ещё относится к неделе с понедельника 9 ноября.
    expect(weekStarts(1, Date.parse('2026-11-15T20:30:00.000Z'))).toEqual(['2026-11-09'])
    expect(weekStarts(1, Date.parse('2026-11-15T21:30:00.000Z'))).toEqual(['2026-11-16'])
  })
})

describe('состояние ученика', () => {
  const base = { isActive: true, frozen: false, createdAt: '2026-09-01T10:00:00.000Z' }

  it('нет активности - ровно с 14 дней', () => {
    expect(studentState({ ...base, lastActivityAt: new Date(now - 13.9 * 86_400_000).toISOString() }, now)).toBe('learning')
    expect(studentState({ ...base, lastActivityAt: new Date(now - 14 * 86_400_000).toISOString() }, now)).toBe('inactive')
  })

  it('кто ни разу не занимался, считается от создания учётки', () => {
    expect(studentState({ ...base, lastActivityAt: null }, now)).toBe('inactive')
    expect(studentState({ ...base, createdAt: new Date(now - 3 * 86_400_000).toISOString(), lastActivityAt: null }, now)).toBe('learning')
  })

  it('заморозка и отключение важнее давности: таких не зовём обратно', () => {
    expect(studentState({ ...base, frozen: true, lastActivityAt: null }, now)).toBe('frozen')
    expect(studentState({ ...base, isActive: false, frozen: true, lastActivityAt: null }, now)).toBe('disabled')
  })

  it('дни с момента и подписи', () => {
    expect(daysSince(null, now)).toBeNull()
    expect(daysSince(new Date(now - 2.5 * 86_400_000).toISOString(), now)).toBe(2)
    expect(daysLabel(1)).toBe('1 день')
    expect(daysLabel(3)).toBe('3 дня')
    expect(daysLabel(14)).toBe('14 дней')
  })
})

describe('числа на экране', () => {
  it('минуты читаются как часы и минуты', () => {
    expect(formatMinutes(0)).toBe('нет')
    expect(formatMinutes(45)).toBe('45 мин')
    expect(formatMinutes(125)).toBe('2 ч 05 мин')
    expect(formatMinutes(180)).toBe('3 ч')
  })

  it('доля и медиана без деления на ноль', () => {
    expect(share(1, 3)).toBeCloseTo(33.33, 2)
    expect(share(0, 0)).toBeNull()
    expect(median([])).toBeNull()
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('процент: начатое меньше 1% не выглядит нулём, почти законченное - сотней', () => {
    expect(formatPercent(share(3, 631))).toBe('меньше 1%')
    expect(formatPercent(share(0, 631))).toBe('0%')
    expect(formatPercent(share(1, 97))).toBe('1%')
    expect(formatPercent(share(1, 3))).toBe('33%')
    expect(formatPercent(share(630, 631))).toBe('99%')
    expect(formatPercent(share(631, 631))).toBe('100%')
    expect(formatPercent(share(1, 0))).toBeNull()
    expect(formatPercent(Number.NaN)).toBeNull()
  })

  it('полоска прогресса видна с первого урока', () => {
    expect(barStyle(share(3, 631))).toEqual({ width: `${(3 / 631) * 100}%`, minWidth: 4 })
    expect(barStyle(0)).toEqual({ width: '0%', minWidth: undefined })
    expect(barStyle(null)).toEqual({ width: '0%', minWidth: undefined })
  })

  it('неизвестные параметры запроса дают значения по умолчанию', () => {
    expect(parsePeriod('7')).toBe(7)
    expect(parsePeriod('365')).toBe(30)
    expect(parseStudentFilter('inactive')).toBe('inactive')
    expect(parseStudentFilter('admins')).toBe('all')
    expect(parseStudentSort('drop table')).toBe('activity')
  })
})

describe('сортировка таблицы', () => {
  const row = (id: number, extra: Partial<StudentRow>): StudentRow => ({
    id, title: `Ученик ${id}`, email: `${id}@example.test`, createdAt: '2026-09-01T10:00:00.000Z', isTestStudent: false, state: 'learning', freeze: null, accessUntil: null, bootcamp: null,
    lastActivityAt: null, idleDays: null, period: { activeDays: 0, minutes: 0, lessons: 0, tasks: 0 }, lessonsTotal: 0, courses: { open: 0, started: 0 }, waitingQuestions: 0, ...extra,
  })
  const never = row(1, {})
  const recent = row(2, { lastActivityAt: '2026-11-12T10:00:00.000Z' })
  const old = row(3, { lastActivityAt: '2026-10-01T10:00:00.000Z' })

  it('кто ни разу не занимался, остаётся в конце при любом направлении', () => {
    expect([never, old, recent].sort((a, b) => compareStudents('activity', true, a, b)).map((item) => item.id)).toEqual([2, 3, 1])
    expect([never, recent, old].sort((a, b) => compareStudents('activity', false, a, b)).map((item) => item.id)).toEqual([3, 2, 1])
  })

  it('замороженные идут раньше плановых дат, ученики без срока - в конце', () => {
    const frozen = row(4, { freeze: { until: null, reason: null } })
    const soon = row(5, { accessUntil: '2027-03-13T10:00:00.000Z' })
    expect([never, soon, frozen].sort((a, b) => compareStudents('access', false, a, b)).map((item) => item.id)).toEqual([4, 5, 1])
  })
})

describe('курсы: где останавливаются и где бросают', () => {
  it('ученик стоит на первом непройденном уроке, даже если прошёл что-то дальше', () => {
    expect(stuckLesson([1, 2, 3], new Set([1, 3]))).toBe(2)
    expect(stuckLesson([1, 2, 3], new Set([1, 2, 3]))).toBeNull()
    expect(stuckLesson([1, 2, 3], new Set())).toBeNull()
  })

  it('выделяется урок с самым большим падением числа прошедших', () => {
    expect(biggestDrop([10, 9, 4, 3])).toBe(2)
    expect(biggestDrop([5, 5, 5])).toBeNull()
    expect(biggestDrop([])).toBeNull()
  })
})
