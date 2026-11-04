import { describe, expect, it } from 'vitest'
import { swipeDirection, swipeTarget, trackWheel, WHEEL_IDLE } from '@/lib/lesson-swipe'

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

describe('trackWheel', () => {
  it('копит мелкие сдвиги до порога и срабатывает один раз за жест', () => {
    const first = trackWheel(WHEEL_IDLE, 70, 0)
    expect(first.direction).toBeNull()
    const second = trackWheel(first.track, 70, 10)
    expect(second.direction).toBe('next')
    const inertia = trackWheel(second.track, 300, 20)
    expect(inertia.direction).toBeNull()
  })

  it('палец вправо - назад', () => {
    expect(trackWheel(WHEEL_IDLE, -130, 0).direction).toBe('prev')
  })

  it('пауза заканчивает жест: срабатывание сбрасывается, накопленное не переносится', () => {
    const fired = trackWheel(WHEEL_IDLE, 130, 0)
    expect(trackWheel(fired.track, 130, 1000).direction).toBe('next')
    const small = trackWheel(WHEEL_IDLE, 100, 0)
    expect(trackWheel(small.track, 100, 1000).direction).toBeNull()
  })

  it('инерция с постоянными сдвигами не становится новым жестом', () => {
    let step = trackWheel(WHEEL_IDLE, 130, 0)
    for (let now = 50; now <= 600; now += 50) {
      step = trackWheel(step.track, 30, now)
      expect(step.direction).toBeNull()
    }
  })
})
