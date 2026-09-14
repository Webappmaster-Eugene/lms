import { describe, expect, it } from 'vitest'

import { TRAINER_CATALOG } from '@/data/trainer'
import { flattenCatalog, POINTS_BY_DIFFICULTY } from '@/data/trainer/types'
import {
  COMPANY_LABELS,
  TAG_LABELS,
  TOPIC_CATEGORY_LABELS,
  TRAINER_LIMITS,
} from '@/lib/trainer/constants'

/**
 * Инварианты каталога.
 *
 * В отличие от catalog.test.ts, который проверяет, что задачи решаются, здесь
 * проверяется целостность самих данных: уникальность порядка, корректность
 * справочников, наличие обязательных полей.
 */

const entries = flattenCatalog(TRAINER_CATALOG)

describe('каталог тренажёра: инварианты', () => {
  it('темы идут по возрастанию порядка без дублей', () => {
    const orders = TRAINER_CATALOG.map((topic) => topic.order)

    expect(new Set(orders).size).toBe(orders.length)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('у каждой темы есть описание и корректная категория', () => {
    for (const topic of TRAINER_CATALOG) {
      expect(topic.description.length, topic.slug).toBeGreaterThan(10)
      expect(TOPIC_CATEGORY_LABELS[topic.category], topic.slug).toBeDefined()
      expect(topic.tasks.length, topic.slug).toBeGreaterThan(0)
    }
  })

  it('slug состоят из латиницы, цифр и дефисов', () => {
    for (const topic of TRAINER_CATALOG) {
      expect(topic.slug).toMatch(/^[a-z0-9-]+$/)
      for (const task of topic.tasks) expect(task.slug).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('теги и компании берутся из справочников', () => {
    for (const { task } of entries) {
      for (const tag of task.tags ?? []) {
        expect(TAG_LABELS[tag], `${task.slug}: ${tag}`).toBeDefined()
      }
      for (const company of task.companies ?? []) {
        expect(COMPANY_LABELS[company], `${task.slug}: ${company}`).toBeDefined()
      }
    }
  })

  it('решения и шаблоны укладываются в лимит длины', () => {
    for (const { task } of entries) {
      for (const code of [task.starterCode, task.starterCodeTs, task.solutionCode, task.solutionCodeTs]) {
        if (typeof code === 'string') {
          expect(code.length, task.slug).toBeLessThanOrEqual(TRAINER_LIMITS.maxCodeLength)
        }
      }
    }
  })

  it('лимит времени в допустимых границах', () => {
    for (const { task } of entries) {
      if (task.timeLimitMs === undefined) continue

      expect(task.timeLimitMs, task.slug).toBeGreaterThanOrEqual(500)
      expect(task.timeLimitMs, task.slug).toBeLessThanOrEqual(TRAINER_LIMITS.maxTimeLimitMs)
    }
  })

  it('баллы соответствуют сложности, если не заданы явно', () => {
    for (const { task } of entries) {
      const points = task.pointsReward ?? POINTS_BY_DIFFICULTY[task.difficulty]
      expect(points, task.slug).toBeGreaterThan(0)
    }
  })

  it('у задач с подсказками они не пустые', () => {
    for (const { task } of entries) {
      for (const hint of task.hints ?? []) {
        expect(hint.trim().length, task.slug).toBeGreaterThan(5)
      }
    }
  })

  it('у задач есть разбор решения', () => {
    const withoutNotes = entries.filter(({ task }) => !task.solutionNotes?.trim())

    expect(withoutNotes.map(({ task }) => task.slug)).toEqual([])
  })

  it('ссылки на первоисточник корректны', () => {
    for (const { task } of entries) {
      if (task.sourceUrl) expect(task.sourceUrl, task.slug).toMatch(/^https:\/\//)
    }
  })

  it('задачи на TypeScript имеют TypeScript-версии кода', () => {
    for (const { task } of entries) {
      if (!task.languages.includes('ts')) continue

      const starter = task.starterCodeTs ?? task.starterCode
      const solution = task.solutionCodeTs ?? task.solutionCode

      expect(starter.trim().length, task.slug).toBeGreaterThan(0)
      expect(solution.trim().length, task.slug).toBeGreaterThan(0)
    }
  })

  it('каталог покрывает заявленный объём', () => {
    expect(TRAINER_CATALOG.length).toBeGreaterThanOrEqual(17)
    expect(entries.length).toBeGreaterThanOrEqual(130)
    expect(entries.filter(({ task }) => task.languages.includes('ts')).length)
      .toBeGreaterThanOrEqual(50)
  })

  it('есть задачи всех уровней сложности', () => {
    const difficulties = new Set(entries.map(({ task }) => task.difficulty))
    expect([...difficulties].sort()).toEqual(['easy', 'hard', 'medium'])
  })
})
