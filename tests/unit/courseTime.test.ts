import { describe, expect, it } from 'vitest'

import { formatMinutes, remainingTime } from '@/lib/course-time'

/** «Осталось ~2 ч» на странице курса — по оценкам непройденных уроков. */

describe('оставшееся время курса', () => {
  const lessons = [
    { id: 1, estimatedMinutes: 30 },
    { id: 2, estimatedMinutes: 90 },
    { id: 3, estimatedMinutes: 45 },
  ]

  it('считаются только непройденные уроки', () => {
    expect(remainingTime(lessons, new Set(['1']))).toBe('Осталось ~2 ч 15 мин')
  })

  it('уроки без оценки не выдумываются, а называются', () => {
    expect(remainingTime([...lessons, { id: 4, estimatedMinutes: null }], new Set(['1', '2']))).toBe(
      'Осталось ~45 мин и 1 урок без оценки',
    )
  })

  it('курс пройден или оценок нет — строки нет', () => {
    expect(remainingTime(lessons, new Set(['1', '2', '3']))).toBeNull()
    expect(remainingTime([{ id: 1 }, { id: 2, estimatedMinutes: 0 }], new Set())).toBeNull()
  })

  it.each([
    [45, '45 мин'],
    [60, '1 ч'],
    [135, '2 ч 15 мин'],
  ])('%i минут → %s', (minutes, text) => {
    expect(formatMinutes(minutes)).toBe(text)
  })
})
