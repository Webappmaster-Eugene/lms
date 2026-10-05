import { describe, expect, it } from 'vitest'
import vm from 'node:vm'
import { buildExecSpec, TrainerSpecError } from '@/lib/trainer/spec'
import { isPassed, type TrainerExecSpec } from '@/lib/trainer/types'
import { composeScript } from '@/lib/trainer/compose'
import { normalizeRunResult } from '@/lib/trainer/result'

function consoleSpec(userCode: string, overrides: Partial<TrainerExecSpec> = {}): TrainerExecSpec {
  return {
    allowNoTests: true, checkMode: 'unit', language: 'js', setupCode: '', userCode,
    testCode: '', cases: [], entryName: '', timeLimitMs: 500, ...overrides,
  }
}

async function runConsole(spec: TrainerExecSpec) {
  const script = new vm.Script(`(function(){${composeScript(spec).source}})()`)
  const raw = await script.runInContext(vm.createContext(Object.create(null)), { timeout: spec.timeLimitMs })
  return normalizeRunResult(raw, { allowNoTests: spec.allowNoTests })
}

describe('консоль собеседования: настоящий харнесс без служебных тестов', () => {
  it('показывает вывод без ошибки о пустых тестах и не выдаёт успешную проверку задачи', async () => {
    const result = await runConsole(consoleSpec('console.log(42)'))
    expect(result.status).toBe('passed')
    expect(result.error).toBeUndefined()
    expect(result.consoleOutput).toEqual(['42'])
    expect(result.tests).toEqual([])
    expect(result.totalCount).toBe(0)
    expect(result.passedCount).toBe(0)
    expect(isPassed(result)).toBe(false)
  })

  it('обычный прогон по-прежнему отклоняет отсутствие тестов', async () => {
    const result = await runConsole(consoleSpec('console.log(42)', { allowNoTests: undefined }))
    expect(result.status).toBe('error')
    expect(result.error).toBe('У задачи нет ни одного теста')
  })

  it('считает только объявленные пользователем проверки и показывает их ошибки', async () => {
    const result = await runConsole(consoleSpec(`test('сумма', function () { expect(2 + 2).toBe(4) })
test('краевой случай', function () { expect(0).toBe(1) })`))
    expect(result.status).toBe('failed')
    expect(result.totalCount).toBe(2)
    expect(result.passedCount).toBe(1)
    expect(result.tests.map((test) => test.name)).toEqual(['сумма', 'краевой случай'])
    expect(result.tests[1].message).toBeTruthy()
  })

  it('исключение программы сохраняет ошибку и вывод до неё', async () => {
    const result = await runConsole(consoleSpec('console.log("before"); throw new Error("boom")'))
    expect(result.status).toBe('error')
    expect(result.error).toContain('boom')
    expect(result.consoleOutput).toEqual(['before'])
  })

  it('бесконечный цикл остаётся ограничен таймаутом', async () => {
    await expect(runConsole(consoleSpec('while (true) {}'))).rejects.toThrow('Script execution timed out')
  })

  it('серверная спецификация задачи не принимает послабление из документа задачи', () => {
    const document = { slug: 'empty-unit', checkMode: 'unit', languages: ['js'], starterCode: '', allowNoTests: true }
    expect(() => buildExecSpec(document, 'js', 'console.log(42)')).toThrow(TrainerSpecError)
    const valid = { ...document, testCode: 'test("check", function () { expect(1).toBe(1) })' }
    expect(buildExecSpec(valid, 'js', 'console.log(42)').allowNoTests).toBeUndefined()
  })

  it('нормализатор сервера не доверяет console-флагу в сообщении песочницы', () => {
    const raw = { status: 'passed', allowNoTests: true, tests: [], passedCount: 1, totalCount: 1, consoleOutput: ['42'], totalMs: 0 }
    expect(normalizeRunResult(raw).status).toBe('error')
    expect(normalizeRunResult(raw, { allowNoTests: true }).status).toBe('passed')
  })
})
