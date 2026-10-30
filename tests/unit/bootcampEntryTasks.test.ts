import { describe, expect, it } from 'vitest'

import { ENTRY_TASKS, entryTaskSpec, findEntryTask } from '@/data/bootcamp-entry/tasks'
import { buildExecSpec, publicCases } from '@/lib/trainer/spec'
import { runInNodeVm, sandboxTestTimeoutMs } from '../helpers/trainer-sandbox'

const run = (slug: string, code: string) => {
  const task = findEntryTask(slug)
  if (!task) throw new Error(`нет задачи ${slug}`)
  return runInNodeVm(buildExecSpec(entryTaskSpec(task), 'js', code))
}

describe('входное задание буткемпа', () => {
  it('задачи с разными slug и именами функций, тесты открыты кандидату целиком', () => {
    expect(new Set(ENTRY_TASKS.map((task) => task.slug)).size).toBe(ENTRY_TASKS.length)
    expect(new Set(ENTRY_TASKS.map((task) => task.entryName)).size).toBe(ENTRY_TASKS.length)
    for (const task of ENTRY_TASKS) expect(publicCases(entryTaskSpec(task))).toHaveLength(task.cases.length)
  })

  it.each(ENTRY_TASKS.map((task) => [task.slug, task] as const))('%s: эталон проходит, заготовка нет', async (slug, task) => {
    const solved = await run(slug, task.solutionCode)
    expect(solved.status, solved.tests.filter((test) => !test.passed).map((test) => test.message).join('; ')).toBe('passed')
    expect(solved.passedCount).toBe(task.cases.length)
    const starter = await run(slug, task.starterCode)
    expect(starter.status).not.toBe('passed')
    expect(starter.passedCount).toBe(0)
  }, sandboxTestTimeoutMs(3000))

  it.each([
    ['rental-price', 'скидка с шестого дня', 'function rentalPrice(p, d) { return Math.round(d >= 6 ? p * d * 0.9 : p * d) }'],
    ['rental-price', 'округление всегда вверх', 'function rentalPrice(p, d) { return Math.ceil(d >= 7 ? p * d * 0.9 : p * d) }'],
    ['bookings-overlap', 'без общего крайнего дня', 'function overlaps(a, b) { return a.from < b.to && b.from < a.to }'],
    ['bookings-overlap', 'только вторая начинается внутри первой', 'function overlaps(a, b) { return a.from <= b.from && b.from <= a.to }'],
    ['bookings-overlap', 'только дата второй внутри первой', 'function overlaps(a, b) { const inA = (day) => a.from <= day && day <= a.to; return inA(b.from) || inA(b.to) }'],
    ['catalog-summary', 'не та форма ответа', 'function catalogSummary(items) { return items.length ? { all: items.length } : {} }'],
  ])('%s: решение с типичной ошибкой (%s) не проходит', async (slug, _mistake, code) => {
    expect((await run(slug, code)).status).toBe('failed')
  }, sandboxTestTimeoutMs(3000))

  it('в условиях нет длинного тире: тексты задания видит кандидат', () => {
    expect(JSON.stringify(ENTRY_TASKS)).not.toMatch(/[—–]/)
  })
})
