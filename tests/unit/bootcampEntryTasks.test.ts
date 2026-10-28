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

  it('решения с типичными ошибками не проходят', async () => {
    // Скидка с шестого дня вместо седьмого и пересечение без общего последнего дня.
    expect((await run('rental-price', 'function rentalPrice(p, d) { return Math.round(d >= 6 ? p * d * 0.9 : p * d) }')).status).toBe('failed')
    expect((await run('bookings-overlap', 'function overlaps(a, b) { return a.from < b.to && b.from < a.to }')).status).toBe('failed')
    expect((await run('catalog-summary', 'function catalogSummary(items) { return items.length ? { all: items.length } : {} }')).status).toBe('failed')
  }, sandboxTestTimeoutMs(3000))

  it('в условиях нет длинного тире: тексты задания видит кандидат', () => {
    expect(JSON.stringify(ENTRY_TASKS)).not.toMatch(/[—–]/)
  })
})
