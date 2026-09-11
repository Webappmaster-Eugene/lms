import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { DEFAULT_POINTS } from '@/lib/points-config'

/**
 * Баллы описаны в трёх местах, и все три обязаны совпадать:
 *
 *   1. union `PointsReason` в src/lib/points-config.ts — контракт для кода;
 *   2. `options` поля `reason` в коллекции PointsTransactions — что принимает БД;
 *   3. строковые литералы в хуках начисления — что туда реально пишут.
 *
 * Поле типа `select` в Payload отвергает значение вне списка options. Хук, который
 * пишет причину, отсутствующую в списке, падает на create — а вызывают его из
 * afterChange, то есть ломается сохранение прогресса по уроку целиком.
 * Обратная ошибка тише: причина, объявленная в union и в options, но никем не
 * используемая, — это мёртвый вариант, который годами вводит в заблуждение.
 */

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
    // Причина из union, отсутствующая в options, проходит проверку типов и
    // падает уже в рантайме на записи в БД.
    expect(FIELD_REASONS.slice().sort()).toEqual(UNION_REASONS.slice().sort())
  })

  it('у каждого варианта в коллекции есть человекочитаемая подпись', () => {
    // Без label админка показывает служебный ключ вместо названия причины.
    const labelled = [...POINTS_TRANSACTIONS.matchAll(/label:\s*'[^']+',\s*value:\s*'[a-z_]+'/g)]
    expect(labelled).toHaveLength(FIELD_REASONS.length)
  })
})

describe('причины и хуки не разошлись', () => {
  it('каждая причина из union где-то используется', () => {
    // admin_adjustment ставится руками из админки, поэтому ищем его и в коллекции.
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
    // Ноль или дробь ломают лидерборд: суммы перестают сходиться, а сортировка
    // начинает зависеть от порядка записей.
    for (const [key, value] of Object.entries(DEFAULT_POINTS)) {
      expect(Number.isInteger(value), `${key} = ${value}`).toBe(true)
      expect(value, `${key} = ${value}`).toBeGreaterThan(0)
    }
  })

  it('награда за роадмап больше, чем за курс, а за курс — больше, чем за урок', () => {
    // Порядок величин задаёт смысл прогресса. Если урок стоит дороже курса,
    // выгоднее «пройти» разрозненные уроки, чем закончить курс.
    expect(DEFAULT_POINTS.ROADMAP_COMPLETED).toBeGreaterThan(DEFAULT_POINTS.COURSE_COMPLETED)
    expect(DEFAULT_POINTS.COURSE_COMPLETED).toBeGreaterThan(DEFAULT_POINTS.LESSON_COMPLETED)
  })

  it('константы заморожены как литерал — их нельзя изменить в рантайме', () => {
    // Значения подменяются настройками из SiteSettings, но именно подменяются
    // локальной переменной, а не правкой общего объекта.
    expect(POINTS_CONFIG).toMatch(/as const/)
  })
})
