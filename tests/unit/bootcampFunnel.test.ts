import { describe, expect, it } from 'vitest'

import { actionReasonLabel, formatDuration, formatWeek, parseFunnelFilter, percent, sourceLabel, weeklySummaryWindow } from '@/lib/bootcamp-funnel'

const now = new Date('2026-10-31T12:00:00Z')

describe('воронка: фильтр страницы', () => {
  it('период по умолчанию 90 дней, «всё время» без нижней границы', () => {
    expect(parseFunnelFilter(undefined, now)).toEqual({ period: '90', from: new Date('2026-08-02T12:00:00Z'), to: now, source: null })
    expect(parseFunnelFilter({ period: 'all' }, now)).toMatchObject({ period: 'all', from: null })
    expect(parseFunnelFilter({ period: ['7', '30'] }, now)).toMatchObject({ period: '7', from: new Date('2026-10-24T12:00:00Z') })
  })

  it('чужой период и кривой источник не проходят', () => {
    expect(parseFunnelFilter({ period: '1000' }, now).period).toBe('90')
    expect(parseFunnelFilter({ source: 'utm:telegram' }, now).source).toBe('utm:telegram')
    expect(parseFunnelFilter({ source: 'ref:habr.com' }, now).source).toBe('ref:habr.com')
    expect(parseFunnelFilter({ source: 'direct' }, now).source).toBe('direct')
    for (const source of ['', 'telegram', 'utm:', `utm:${'x'.repeat(101)}`, "'; drop table"]) expect(parseFunnelFilter({ source }, now).source).toBeNull()
  })

  it('источник для людей', () => {
    expect(sourceLabel('utm:telegram')).toBe('telegram')
    expect(sourceLabel('ref:habr.com')).toBe('переход с habr.com')
    expect(sourceLabel('direct')).toBe('прямой заход')
  })
})

describe('воронка: числа', () => {
  it('доля без деления на ноль', () => {
    expect(percent(1, 3)).toBe(33)
    expect(percent(2, 1)).toBe(200)
    expect(percent(0, 0)).toBeNull()
  })

  it('время между шагами: минуты, часы до двух суток, дальше дни', () => {
    expect(formatDuration(null)).toBe('нет данных')
    expect(formatDuration(-1)).toBe('нет данных')
    expect(formatDuration(10_000)).toBe('1 мин')
    expect(formatDuration(25 * 60_000)).toBe('25 мин')
    expect(formatDuration(5 * 3_600_000)).toBe('5 ч')
    expect(formatDuration(47 * 3_600_000)).toBe('47 ч')
    expect(formatDuration(2 * 86_400_000)).toBe('2 дня')
    expect(formatDuration(2.5 * 86_400_000)).toBe('2,5 дня')
    expect(formatDuration(5 * 86_400_000)).toBe('5 дней')
    expect(formatDuration(11 * 86_400_000)).toBe('11 дней')
    expect(formatDuration(21 * 86_400_000)).toBe('21 день')
  })

  it('причины в списке дел', () => {
    expect(actionReasonLabel('review')).toBe('Решение ждёт ответа')
    expect(actionReasonLabel('unknown')).toBe('unknown')
  })
})

describe('окно еженедельной сводки', () => {
  it('понедельник с 10:00 по Москве до конца дня, про прошлую неделю', () => {
    // 2 ноября 2026 - понедельник; 10:00 по Москве = 07:00 UTC.
    const window = weeklySummaryWindow(new Date('2026-11-02T07:00:00Z'))
    expect(window).toEqual({ week: '2026-10-26', from: new Date('2026-10-25T21:00:00Z'), to: new Date('2026-11-01T21:00:00Z') })
    expect(formatWeek(window!)).toBe('26 октября - 1 ноября')
    expect(weeklySummaryWindow(new Date('2026-11-02T20:59:59Z'))?.week).toBe('2026-10-26')
  })

  it('до 10:00 в понедельник и в другие дни сводки нет', () => {
    expect(weeklySummaryWindow(new Date('2026-11-02T06:59:59Z'))).toBeNull()
    expect(weeklySummaryWindow(new Date('2026-11-02T21:00:00Z'))).toBeNull()
    expect(weeklySummaryWindow(new Date('2026-10-31T12:00:00Z'))).toBeNull()
  })
})
