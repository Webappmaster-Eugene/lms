import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createRateLimiter } from '@/server/trainer/rate-limit'
import { parseTaskId } from '@/lib/trainer/task-id'

describe('ограничитель частоты', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    for (const name of ['проба', 'уборка']) {
      delete (globalThis as Record<symbol, unknown>)[Symbol.for(`lms.trainer.rateLimit.${name}`)]
    }
  })

  it('пропускает в пределах лимита', () => {
    const limiter = createRateLimiter('проба', 3, 1000)

    expect(limiter.take('user')).toBe(true)
    expect(limiter.take('user')).toBe(true)
    expect(limiter.take('user')).toBe(true)
    expect(limiter.take('user')).toBe(false)
  })

  it('лимит считается отдельно по ключам', () => {
    const limiter = createRateLimiter('проба', 1, 1000)

    expect(limiter.take('первый')).toBe(true)
    expect(limiter.take('второй')).toBe(true)
    expect(limiter.take('первый')).toBe(false)
  })

  it('окно сбрасывается по времени', () => {
    const limiter = createRateLimiter('проба', 1, 1000)

    expect(limiter.take('user')).toBe(true)
    vi.advanceTimersByTime(999)
    expect(limiter.take('user')).toBe(false)

    vi.advanceTimersByTime(1)
    expect(limiter.take('user')).toBe(true)
  })

  it('истёкшие записи вычищаются, а не копятся', () => {
    const limiter = createRateLimiter('уборка', 1, 100)
    const store = () =>
      (globalThis as Record<symbol, Map<string, unknown> | undefined>)[
        Symbol.for('lms.trainer.rateLimit.уборка')
      ]

    for (let i = 0; i < 199; i++) limiter.take(`user-${i}`)
    expect(store()?.size).toBe(199)

    vi.advanceTimersByTime(200)
    limiter.take('последний')

    // Уборка срабатывает на двухсотом взятии: остаётся только свежая запись.
    expect(store()?.size).toBe(1)
  })
})

describe('разбор идентификатора задачи', () => {
  it('принимает положительные целые', () => {
    expect(parseTaskId('42')).toBe(42)
    expect(parseTaskId(42)).toBe(42)
    expect(parseTaskId('1')).toBe(1)
  })

  it('отвергает всё остальное', () => {
    expect(parseTaskId('0')).toBe(null)
    expect(parseTaskId('-1')).toBe(null)
    expect(parseTaskId('1.5')).toBe(null)
    expect(parseTaskId('не-число')).toBe(null)
    expect(parseTaskId('')).toBe(null)
    expect(parseTaskId(null)).toBe(null)
    expect(parseTaskId(undefined)).toBe(null)
    expect(parseTaskId({})).toBe(null)
  })

  it('отвергает попытки инъекции', () => {
    expect(parseTaskId('1 OR 1=1')).toBe(null)
    expect(parseTaskId('1; DROP TABLE users')).toBe(null)
  })

  it('отвергает слишком длинные числа', () => {
    expect(parseTaskId('12345678901234567890')).toBe(null)
  })
})
