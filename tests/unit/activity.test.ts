import { describe, expect, it } from 'vitest'

import { activityGrid, activityStart, activitySummary, countByDay, describeActivity } from '@/lib/activity'

/** Календарь занятий в профиле. */

// Понедельник, 28 сентября 2026.
const now = new Date('2026-09-28T15:00:00Z')

describe('сетка календаря', () => {
  it('начинается с понедельника и заканчивается неделей с сегодняшним днём', () => {
    const grid = activityGrid(new Map(), now, 3)
    expect(grid).toHaveLength(3)
    expect(grid[0][0].date).toBe('2026-09-14')
    expect(grid[2][0].date).toBe('2026-09-28')
    expect(new Date(`${grid[0][0].date}T00:00:00Z`).getUTCDay()).toBe(1)
  })

  it('дни после сегодняшнего помечены будущими', () => {
    const lastWeek = activityGrid(new Map(), now, 1)[0]
    expect(lastWeek[0].future).toBe(false)
    expect(lastWeek.slice(1).every((c) => c.future)).toBe(true)
  })

  it('в воскресенье последняя неделя целиком в прошлом', () => {
    const sunday = new Date('2026-09-27T10:00:00Z')
    expect(activityStart(sunday, 1).toISOString().slice(0, 10)).toBe('2026-09-21')
    expect(activityGrid(new Map(), sunday, 1)[0].some((c) => c.future)).toBe(false)
  })

  it('насыщенность дня растёт с количеством занятий', () => {
    const days = countByDay(
      ['2026-09-14T10:00:00Z', '2026-09-15T10:00:00Z', '2026-09-15T11:00:00Z', '2026-09-16T09:00:00Z'],
      ['2026-09-16T10:00:00Z', '2026-09-16T11:00:00Z', '2026-09-16T12:00:00Z', '2026-09-16T13:00:00Z', '2026-09-16T14:00:00Z'],
    )
    const week = activityGrid(days, now, 3)[0]
    expect(week.slice(0, 4).map((c) => c.level)).toEqual([1, 2, 4, 0])
  })
})

describe('подсчёт по дням', () => {
  it('уроки и задачи раздельно, пустые и битые даты пропускаются', () => {
    const days = countByDay(['2026-09-20T23:59:00Z', null, 'не дата'], ['2026-09-20T01:00:00Z', undefined])
    expect(days.get('2026-09-20')).toEqual({ lessons: 1, tasks: 1 })
    expect(days.size).toBe(1)
  })
})

describe('подписи', () => {
  it('словами и с согласованием', () => {
    expect(describeActivity({ lessons: 2, tasks: 1 })).toBe('2 урока, 1 задача')
    expect(describeActivity({ lessons: 0, tasks: 5 })).toBe('5 задач')
    expect(describeActivity({ lessons: 0, tasks: 0 })).toBe('нет занятий')
  })

  it('итог за период', () => {
    const grid = activityGrid(countByDay(['2026-09-15T10:00:00Z', '2026-09-15T12:00:00Z'], ['2026-09-21T10:00:00Z']), now, 3)
    expect(activitySummary(grid)).toEqual({ activeDays: 2, lessons: 2, tasks: 1 })
  })
})
