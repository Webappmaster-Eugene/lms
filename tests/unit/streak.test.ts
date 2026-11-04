import { describe, expect, it } from 'vitest'

import { streakView, restingGreeting } from '@/lib/streak'

/**
 * Серия пересчитывается хуком только при прохождении урока — после перерыва
 * в базе остаётся старое число. Экран не должен его показывать.
 */

const now = new Date('2026-09-28T12:00:00Z')

describe('подпись под приветствием без серии', () => {
  const now = new Date('2026-11-04T10:00:00Z')

  it('новому ученику - приветствие на борту', () => {
    expect(restingGreeting(0, null, now)).toBe('Добро пожаловать на борт')
  })

  it('короткий перерыв обходится без галеры, иначе шутка увидится при каждом входе', () => {
    expect(restingGreeting(5, { currentStreak: 2, lastActivityDate: '2026-10-29T08:00:00.000Z' }, now)).toBe('Продолжай обучение')
  })

  it('через неделю без уроков встречает возвращение', () => {
    expect(restingGreeting(5, { currentStreak: 2, lastActivityDate: '2026-10-28T23:59:00.000Z' }, now)).toBe('С возвращением на борт - вёсла и курс на месте')
  })

  it('старый прогресс без записи серии не считается возвращением', () => {
    expect(restingGreeting(5, null, now)).toBe('Продолжай обучение')
  })
})

describe('серия дней', () => {
  it('урок сегодня — серия идёт', () => {
    expect(streakView({ currentStreak: 5, lastActivityDate: '2026-09-28' }, now)).toMatchObject({ days: 5, status: 'today' })
  })

  it('урок вчера — серия под угрозой, но ещё не прервана', () => {
    expect(streakView({ currentStreak: 5, lastActivityDate: '2026-09-27' }, now)).toMatchObject({ days: 5, status: 'at-risk' })
  })

  it('перерыв больше суток — серии нет, хоть в базе и 5', () => {
    expect(streakView({ currentStreak: 5, longestStreak: 9, lastActivityDate: '2026-09-25' }, now)).toEqual({
      days: 0,
      status: 'none',
      longest: 9,
    })
  })

  it('дата полным ISO тоже понимается', () => {
    expect(streakView({ currentStreak: 2, lastActivityDate: '2026-09-28T00:00:00.000Z' }, now).status).toBe('today')
  })

  it('дни считаются в UTC, как в хуке начисления', () => {
    // 00:30 по Москве 29-го — в UTC ещё 28-е.
    expect(streakView({ currentStreak: 3, lastActivityDate: '2026-09-28' }, new Date('2026-09-28T21:30:00Z')).status).toBe('today')
  })

  it('без записи серии — ноль', () => {
    expect(streakView(undefined, now)).toEqual({ days: 0, status: 'none', longest: 0 })
    expect(streakView({ currentStreak: 0, lastActivityDate: '2026-09-28' }, now).status).toBe('none')
  })
})
