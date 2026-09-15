import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { composeScript } from '@/lib/trainer/compose'
import { normalizeRunResult } from '@/lib/trainer/result'
import { getRunnerPool } from '@/server/trainer/pool'
import type { TrainerExecSpec } from '@/lib/trainer/types'

/**
 * Настоящая серверная песочница: дочерний процесс + V8-изолят.
 *
 * Здесь проверяется не логика проверки решений (это делает catalog.test.ts), а
 * сам периметр: что в изоляте нет доступа к хосту, что таймаут и лимит памяти
 * работают, и что зависший процесс не ломает пул.
 */

const pool = getRunnerPool()

afterAll(() => {
  pool.dispose()
})

function spec(userCode: string, overrides: Partial<TrainerExecSpec> = {}): TrainerExecSpec {
  return {
    checkMode: 'unit',
    language: 'js',
    setupCode: '',
    userCode,
    testCode: '',
    cases: [],
    entryName: 'solve',
    // Бюджет пула, а не скорость решения: тесты на сам таймаут задают
    // короткий лимит явно.
    timeLimitMs: 10000,
    ...overrides,
  }
}

async function execute(userCode: string, overrides: Partial<TrainerExecSpec> = {}) {
  const execSpec = spec(userCode, overrides)
  const composed = composeScript(execSpec)

  const raw = await pool.run<unknown>(
    'execute',
    {
      source: composed.source,
      timeLimitMs: execSpec.timeLimitMs,
      userStartLine: composed.userStartLine,
      userEndLine: composed.userEndLine,
    },
    execSpec.timeLimitMs,
  )

  return normalizeRunResult(raw)
}

/** Выносит запуск дочернего процесса за пределы бюджета отдельного теста. */
beforeAll(async () => {
  await execute('function solve() { return 0 }', { timeLimitMs: 20000 })
}, 60000)

const PASSING_TEST = `test('кейс', function () { expect(solve()).toBe(1) })`

describe('серверная песочница: исполнение', () => {
  it('проходящее решение даёт passed', async () => {
    const result = await execute('function solve() { return 1 }', { testCode: PASSING_TEST })

    expect(result.status).toBe('passed')
    expect(result.passedCount).toBe(1)
  }, 30000)

  it('падающее решение даёт failed с деталями', async () => {
    const result = await execute('function solve() { return 2 }', { testCode: PASSING_TEST })

    expect(result.status).toBe('failed')
    expect(result.tests[0].expected).toBe('1')
    expect(result.tests[0].actual).toBe('2')
  }, 30000)

  it('вывод консоли доезжает до результата', async () => {
    const result = await execute('function solve() { console.log("привет"); return 1 }', {
      testCode: PASSING_TEST,
    })

    expect(result.consoleOutput).toEqual(['привет'])
  }, 30000)

  it('синтаксическая ошибка даёт compile_error с номером строки', async () => {
    const result = await execute('function solve() {\n  const a = (((\n}', {
      testCode: PASSING_TEST,
    })

    expect(result.status).toBe('compile_error')
    expect(result.error).toContain('SyntaxError')
  }, 30000)
})

describe('серверная песочница: изоляция', () => {
  it('в контексте нет ни require, ни process, ни fetch', async () => {
    const result = await execute(
      `function solve() {
        return [typeof require, typeof process, typeof fetch, typeof globalThis.Buffer].join(',')
      }`,
      { testCode: `test('нет хоста', function () { expect(solve()).toBe('undefined,undefined,undefined,undefined') })` },
    )

    expect(result.status).toBe('passed')
  }, 30000)

  it('реальных таймеров нет — работают только подменённые харнессом', async () => {
    // Часы виртуальные: без tick колбэк не сработает, но и не подвиснет.
    const result = await execute(
      `function solve() { return 1 }`,
      {
        testCode: `test('часы виртуальные', function () {
          var fired = false
          setTimeout(function () { fired = true }, 1000000)
          expect(fired).toBe(false)
          return __clock.tick(1000000).then(function () { expect(fired).toBe(true) })
        })`,
      },
    )

    expect(result.status).toBe('passed')
  }, 30000)

  it('переменные не переживают между прогонами', async () => {
    await execute('function solve() { globalThis.__след = 1; return 1 }', {
      testCode: PASSING_TEST,
    })

    const result = await execute('function solve() { return typeof globalThis.__след }', {
      testCode: `test('чистый контекст', function () { expect(solve()).toBe('undefined') })`,
    })

    expect(result.status).toBe('passed')
  }, 30000)
})

describe('серверная песочница: лимиты', () => {
  it('бесконечный цикл обрывается таймаутом', async () => {
    const result = await execute('function solve() { while (true) {} }', {
      testCode: PASSING_TEST,
      timeLimitMs: 700,
    })

    expect(result.status).toBe('timeout')
    expect(result.error).toContain('лимит времени')
  }, 30000)

  it('пул продолжает работать после таймаута', async () => {
    await execute('function solve() { while (true) {} }', {
      testCode: PASSING_TEST,
      timeLimitMs: 600,
    })

    const result = await execute('function solve() { return 1 }', { testCode: PASSING_TEST })

    expect(result.status).toBe('passed')
  }, 30000)

  it('переполнение памяти не роняет сервер', async () => {
    const result = await execute(
      `function solve() {
        const big = []
        for (;;) big.push(new Array(1000000).fill(1))
        return 1
      }`,
      { testCode: PASSING_TEST, timeLimitMs: 3000 },
    )

    // Изолят либо упрётся в лимит памяти, либо в лимит времени —
    // важно, что вернулся результат, а не упал процесс.
    expect(['error', 'timeout']).toContain(result.status)
  }, 40000)

  it('несколько прогонов подряд обрабатываются', async () => {
    const results = await Promise.all([
      execute('function solve() { return 1 }', { testCode: PASSING_TEST }),
      execute('function solve() { return 1 }', { testCode: PASSING_TEST }),
      execute('function solve() { return 1 }', { testCode: PASSING_TEST }),
      execute('function solve() { return 1 }', { testCode: PASSING_TEST }),
    ])

    expect(results.every((result) => result.status === 'passed')).toBe(true)
  }, 40000)
})

describe('серверная песочница: проверка типов', () => {
  it('корректный TypeScript компилируется без диагностик', async () => {
    const result = await pool.run<{ js: string; diagnostics: unknown[] }>(
      'typecheck',
      { code: 'const value: number = 1', checkTypes: true },
      8000,
    )

    expect(result.diagnostics).toEqual([])
    expect(result.js).toContain('const value = 1')
  }, 30000)

  it('ошибка типа возвращается с номером строки', async () => {
    const result = await pool.run<{ diagnostics: Array<{ line: number; code: number }> }>(
      'typecheck',
      { code: 'const a: number = 1\nconst b: string = 2', checkTypes: true },
      8000,
    )

    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].line).toBe(2)
    expect(result.diagnostics[0].code).toBe(2322)
  }, 30000)

  it('блок проверки типов помечается отдельно', async () => {
    const result = await pool.run<{ diagnostics: Array<{ inHarness: boolean }> }>(
      'typecheck',
      {
        code: 'type MyPick<T, K extends keyof T> = T',
        typeHarness: `type case1 = Expect<Equal<MyPick<{ a: 1; b: 2 }, 'a'>, { a: 1 }>>`,
        checkTypes: true,
      },
      8000,
    )

    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].inHarness).toBe(true)
  }, 30000)
})
