import { describe, expect, it } from 'vitest'

import { completionPercent, formatPercent, progressBarStyle } from '@/lib/progress-percent'

describe('процент прогресса', () => {
  it('доля без округления и без выхода за 0-100', () => {
    expect(completionPercent(1, 3)).toBeCloseTo(33.33, 2)
    expect(completionPercent(0, 0)).toBe(0)
    expect(completionPercent(5, 4)).toBe(100)
    expect(completionPercent(-1, 4)).toBe(0)
  })

  it('начатое меньше 1% не выглядит нулём, почти законченное - сотней', () => {
    expect(formatPercent(completionPercent(3, 631))).toBe('меньше 1%')
    expect(formatPercent(completionPercent(0, 631))).toBe('0%')
    expect(formatPercent(completionPercent(1, 97))).toBe('1%')
    expect(formatPercent(completionPercent(1, 3))).toBe('33%')
    expect(formatPercent(completionPercent(630, 631))).toBe('99%')
    expect(formatPercent(completionPercent(631, 631))).toBe('100%')
    expect(formatPercent(Number.NaN)).toBe('-')
  })

  it('полоска видна с первого урока', () => {
    expect(progressBarStyle(completionPercent(3, 631))).toEqual({ width: `${(3 / 631) * 100}%`, minWidth: 4 })
    expect(progressBarStyle(0)).toEqual({ width: '0%', minWidth: undefined })
    expect(progressBarStyle(null)).toEqual({ width: '0%', minWidth: undefined })
  })
})
