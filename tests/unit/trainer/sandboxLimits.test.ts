import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TRAINER_LIMITS } from '@/lib/trainer/constants'

/** Слишком длинное решение отсекается до песочницы: процессы пула ему не достаются. */

const run = vi.fn()
vi.mock('@/server/trainer/pool', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/server/trainer/pool')>(),
  getRunnerPool: () => ({ run }),
}))
const runRuntime = vi.fn()
vi.mock('@/server/trainer/runtime', () => ({ runRuntime }))

const { runSolution } = await import('@/server/trainer/sandbox')

const task = {
  checkMode: 'unit',
  languages: ['js', 'ts', 'go'],
  entryName: 'sum',
  testCases: [{ name: 'кейс', argsCode: '1, 2', expectedCode: '3', compare: 'deep', hidden: false }],
}

beforeEach(() => vi.clearAllMocks())

describe('runSolution: лимит длины кода', () => {
  it.each(['js', 'ts', 'go'] as const)('решение на %s длиннее лимита — ошибка без запуска песочницы и runtime', async (language) => {
    const result = await runSolution(task, language, 'x'.repeat(TRAINER_LIMITS.maxCodeLength + 1))
    expect(result).toMatchObject({ status: 'error', totalCount: 0, passedCount: 0 })
    expect(result.error).toContain(String(TRAINER_LIMITS.maxCodeLength))
    expect(run).not.toHaveBeenCalled()
    expect(runRuntime).not.toHaveBeenCalled()
  })

  it('решение ровно на лимите уходит в песочницу', async () => {
    run.mockResolvedValue({ status: 'passed', tests: [{ name: 'кейс', passed: true }] })
    const result = await runSolution(task, 'js', `function sum(a, b) { return a + b }${' '.repeat(TRAINER_LIMITS.maxCodeLength - 35)}`)
    expect(run).toHaveBeenCalledWith('execute', expect.objectContaining({ timeLimitMs: expect.any(Number) }), expect.any(Number))
    expect(result.status).toBe('passed')
  })
})
