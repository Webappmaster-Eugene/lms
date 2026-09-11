import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { DEFAULT_POINTS } from '@/lib/points-config'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

const POINTS_CONFIG = read('../../src/lib/points-config.ts')
const POINTS_TRANSACTIONS = read('../../src/payload/collections/PointsTransactions.ts')

const HOOKS = ['awardPoints', 'awardTrainerPoints', 'checkAchievements']
  .map((name) => read(`../../src/payload/hooks/${name}.ts`))
  .join('\n')

/** Строки union `PointsReason`. */
const UNION_REASONS = [
  ...POINTS_CONFIG.slice(POINTS_CONFIG.indexOf('PointsReason')).matchAll(/'([a-z_]+)'/g),
].map((m) => m[1])

/** Значения `options` поля reason. */
const FIELD_REASONS = [...POINTS_TRANSACTIONS.matchAll(/value:\s*'([a-z_]+)'/g)].map((m) => m[1])

describe('источники причин начисления', () => {
  it('union разобран и непуст', () => {
    expect(UNION_REASONS.length).toBeGreaterThan(3)
  })

  it('в union нет дублей', () => {
    expect(new Set(UNION_REASONS).size).toBe(UNION_REASONS.length)
  })

  it('union и options коллекции описывают один и тот же набор', () => {
    expect(FIELD_REASONS.slice().sort()).toEqual(UNION_REASONS.slice().sort())
  })

  it('у каждого варианта в коллекции есть человекочитаемая подпись', () => {
    const labelled = [...POINTS_TRANSACTIONS.matchAll(/label:\s*'[^']+',\s*value:\s*'[a-z_]+'/g)]
    expect(labelled).toHaveLength(FIELD_REASONS.length)
  })
})

describe('причины и хуки не разошлись', () => {
  it('каждая причина из union где-то используется', () => {
    const haystack = `${HOOKS}\n${POINTS_TRANSACTIONS}`
    const unused = UNION_REASONS.filter((reason) => !haystack.includes(`'${reason}'`))

    expect(unused, `причины объявлены, но не используются: ${unused.join(', ')}`).toEqual([])
  })

  it('хуки не пишут причин, которых нет в union', () => {
    const written = [...HOOKS.matchAll(/reason:\s*'([a-z_]+)'/g)].map((m) => m[1])
    expect(written.length).toBeGreaterThan(0)

    const unknown = written.filter((reason) => !UNION_REASONS.includes(reason))
    expect(unknown, `хуки пишут неизвестные причины: ${unknown.join(', ')}`).toEqual([])
  })
})

describe('значения баллов по умолчанию', () => {
  it('заданы для всех начисляемых кодом событий', () => {
    expect(Object.keys(DEFAULT_POINTS).sort()).toEqual([
      'COURSE_COMPLETED',
      'LESSON_COMPLETED',
      'ROADMAP_COMPLETED',
      'TRAINER_TASK_COMPLETED',
    ])
  })

  it('все значения — положительные целые', () => {
    for (const [key, value] of Object.entries(DEFAULT_POINTS)) {
      expect(Number.isInteger(value), `${key} = ${value}`).toBe(true)
      expect(value, `${key} = ${value}`).toBeGreaterThan(0)
    }
  })

  it('награда за роадмап больше, чем за курс, а за курс — больше, чем за урок', () => {
    expect(DEFAULT_POINTS.ROADMAP_COMPLETED).toBeGreaterThan(DEFAULT_POINTS.COURSE_COMPLETED)
    expect(DEFAULT_POINTS.COURSE_COMPLETED).toBeGreaterThan(DEFAULT_POINTS.LESSON_COMPLETED)
  })

  it('константы заморожены как литерал — их нельзя изменить в рантайме', () => {
    expect(POINTS_CONFIG).toMatch(/as const/)
  })
})
