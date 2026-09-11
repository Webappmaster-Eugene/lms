import { describe, it, expect } from 'vitest'

import { cn, formatDate, formatDateShort, pluralize } from '@/lib/utils'

describe('pluralize: русское склонение', () => {
  const lesson = (n: number) => pluralize(n, 'урок', 'урока', 'уроков')

  it('единица', () => {
    expect(lesson(1)).toBe('1 урок')
  })

  it('от двух до четырёх', () => {
    expect(lesson(2)).toBe('2 урока')
    expect(lesson(3)).toBe('3 урока')
    expect(lesson(4)).toBe('4 урока')
  })

  it('от пяти до десяти', () => {
    expect(lesson(5)).toBe('5 уроков')
    expect(lesson(10)).toBe('10 уроков')
  })

  it('ноль', () => {
    expect(lesson(0)).toBe('0 уроков')
  })

  it('подростковый диапазон 11–14 — исключение из правила последней цифры', () => {
    expect(lesson(11)).toBe('11 уроков')
    expect(lesson(12)).toBe('12 уроков')
    expect(lesson(13)).toBe('13 уроков')
    expect(lesson(14)).toBe('14 уроков')
  })

  it('19 и 20', () => {
    expect(lesson(19)).toBe('19 уроков')
    expect(lesson(20)).toBe('20 уроков')
  })

  it('после сотни правило повторяется', () => {
    expect(lesson(21)).toBe('21 урок')
    expect(lesson(22)).toBe('22 урока')
    expect(lesson(25)).toBe('25 уроков')
    expect(lesson(101)).toBe('101 урок')
    expect(lesson(102)).toBe('102 урока')
  })

  it('111–114 остаются исключением и во второй сотне', () => {
    expect(lesson(111)).toBe('111 уроков')
    expect(lesson(112)).toBe('112 уроков')
    expect(lesson(114)).toBe('114 уроков')
  })

  it('форма выбирается по переданным словам, а не по захардкоженным', () => {
    expect(pluralize(2, 'балл', 'балла', 'баллов')).toBe('2 балла')
    expect(pluralize(5, 'день', 'дня', 'дней')).toBe('5 дней')
  })
})

describe('formatDate / formatDateShort', () => {
  // UTC-время в середине суток — результат не зависит от часового пояса машины
  const DATE = '2026-03-09T12:00:00.000Z'

  it('formatDate даёт русский формат с месяцем словом', () => {
    expect(formatDate(DATE)).toBe('9 марта 2026 г.')
  })

  it('formatDateShort даёт числовой формат с ведущими нулями', () => {
    expect(formatDateShort(DATE)).toBe('09.03.2026')
  })

  it('обе функции принимают и строку, и Date', () => {
    expect(formatDate(new Date(DATE))).toBe(formatDate(DATE))
    expect(formatDateShort(new Date(DATE))).toBe(formatDateShort(DATE))
  })
})

describe('cn', () => {
  it('склеивает классы', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('отбрасывает falsy-значения из условных выражений', () => {
    const isActive = false
    expect(cn('a', isActive && 'b', undefined, null, 'c')).toBe('a c')
  })

  it('при конфликте Tailwind-классов побеждает последний', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-sm text-muted-foreground', 'text-foreground')).toBe(
      'text-sm text-foreground',
    )
  })

  it('неконфликтующие классы сохраняются все', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4')
  })
})
