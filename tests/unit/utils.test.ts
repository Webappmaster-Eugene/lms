import { describe, it, expect } from 'vitest'

import { cn, formatDate, formatDateShort, pluralize } from '@/lib/utils'

/**
 * Мелкие утилиты, которые видны на каждой странице: счётчики уроков, даты
 * сертификатов, склейка классов. Ломаются они тихо — «5 урока» вместо «5 уроков»
 * никого не уронит, но выглядит как недоделанный продукт.
 */

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

  it('подростковый диапазон 11–14 — главное исключение правила', () => {
    // Именно здесь ломается «наивное» склонение по последней цифре:
    // 11 оканчивается на 1, но это «уроков», а не «урок».
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
  // Фиксированная дата с явным UTC-временем в середине суток: так результат
  // не зависит от часового пояса машины, где идёт прогон.
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
    // Ровно так классы и собираются в компонентах: cn('base', isActive && 'active').
    const isActive = false
    expect(cn('a', isActive && 'b', undefined, null, 'c')).toBe('a c')
  })

  it('при конфликте Tailwind-классов побеждает последний', () => {
    // Ради этого и нужен twMerge поверх clsx: в компонентах базовые классы
    // переопределяются пропом className, и без слияния в разметке остаются оба,
    // а какой победит — решает порядок в CSS, а не порядок в вызове.
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-sm text-muted-foreground', 'text-foreground')).toBe(
      'text-sm text-foreground',
    )
  })

  it('неконфликтующие классы сохраняются все', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4')
  })
})
