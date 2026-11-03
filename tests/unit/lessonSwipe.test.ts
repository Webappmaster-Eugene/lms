import { describe, expect, it } from 'vitest'
import { swipeDirection, swipeTarget } from '@/lib/lesson-swipe'

const previous = { slug: 'a', title: 'Урок A' }
const next = { slug: 'c', title: 'Урок C' }

describe('засчитывается ли смахивание', () => {
  it('длинный жест влево ведёт вперёд, вправо - назад', () => {
    expect(swipeDirection({ dx: -120, dy: 10, ms: 400, width: 360 })).toBe('next')
    expect(swipeDirection({ dx: 120, dy: -10, ms: 400, width: 360 })).toBe('prev')
  })

  it('короткий сдвиг при касании не листает', () => {
    expect(swipeDirection({ dx: -30, dy: 0, ms: 50, width: 360 })).toBeNull()
  })

  it('на широком видео нужен ход в четверть кадра', () => {
    expect(swipeDirection({ dx: -100, dy: 0, ms: 1000, width: 800 })).toBeNull()
    expect(swipeDirection({ dx: -200, dy: 0, ms: 1000, width: 800 })).toBe('next')
  })

  it('быстрый рывок засчитывается и короче', () => {
    expect(swipeDirection({ dx: -45, dy: 5, ms: 60, width: 360 })).toBe('next')
    expect(swipeDirection({ dx: -45, dy: 5, ms: 400, width: 360 })).toBeNull()
  })

  it('наклонный жест - это прокрутка страницы', () => {
    expect(swipeDirection({ dx: -120, dy: 90, ms: 300, width: 360 })).toBeNull()
  })
})

describe('куда ведёт смахивание', () => {
  it('сначала видео урока по порядку', () => {
    expect(swipeTarget('next', 0, 3, previous, next)).toEqual({ kind: 'video', index: 1 })
    expect(swipeTarget('prev', 2, 3, previous, next)).toEqual({ kind: 'video', index: 1 })
  })

  it('с последнего видео - на первое видео следующего урока', () => {
    expect(swipeTarget('next', 2, 3, previous, next)).toEqual({ kind: 'lesson', slug: 'c', title: 'Урок C', edge: 'first' })
  })

  it('назад с первого видео - на последнее видео предыдущего урока', () => {
    expect(swipeTarget('prev', 0, 3, previous, next)).toEqual({ kind: 'lesson', slug: 'a', title: 'Урок A', edge: 'last' })
  })

  it('на краях курса идти некуда', () => {
    expect(swipeTarget('prev', 0, 1, null, next)).toBeNull()
    expect(swipeTarget('next', 0, 1, previous, null)).toBeNull()
  })
})
