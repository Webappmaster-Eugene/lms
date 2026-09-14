import { describe, expect, it } from 'vitest'

import {
  buildExecSpec,
  normalizeCases,
  publicCases,
  solutionCodeFor,
  starterCodeFor,
  supportsLanguage,
  taskLanguages,
  TrainerSpecError,
} from '@/lib/trainer/spec'
import { composeScript, mapCompileLine } from '@/lib/trainer/compose'
import { failureResult, normalizeRunResult } from '@/lib/trainer/result'

const unitTask = {
  slug: 'демо',
  checkMode: 'unit',
  languages: ['js', 'ts'],
  entryName: 'solve',
  starterCode: 'function solve() {}',
  starterCodeTs: 'function solve(): number { return 0 }',
  solutionCode: 'function solve() { return 1 }',
  testCases: [
    { name: 'кейс', argsCode: '1, 2', expectedCode: '3', compare: 'deep', hidden: false },
    { name: 'скрытый', argsCode: '', expectedCode: '0', compare: 'strict', hidden: true },
  ],
}

describe('spec: языки и шаблоны', () => {
  it('языки по умолчанию — только JavaScript', () => {
    expect(taskLanguages({})).toEqual(['js'])
    expect(taskLanguages({ languages: [] })).toEqual(['js'])
  })

  it('мусор в языках отфильтровывается', () => {
    expect(taskLanguages({ languages: ['ts', 'python', null] })).toEqual(['ts'])
  })

  it('поддержка языка', () => {
    expect(supportsLanguage(unitTask, 'ts')).toBe(true)
    expect(supportsLanguage({ languages: ['js'] }, 'ts')).toBe(false)
  })

  it('шаблон TypeScript откатывается на JavaScript', () => {
    expect(starterCodeFor(unitTask, 'ts')).toBe('function solve(): number { return 0 }')
    expect(starterCodeFor({ starterCode: 'js' }, 'ts')).toBe('js')
  })

  it('эталонное решение по языку', () => {
    expect(solutionCodeFor(unitTask, 'ts')).toBe('function solve() { return 1 }')
    expect(solutionCodeFor({}, 'js')).toBeUndefined()
  })
})

describe('spec: табличные кейсы', () => {
  it('нормализуются с значениями по умолчанию', () => {
    const cases = normalizeCases({
      testCases: [{ expectedCode: '1' }],
    })

    expect(cases).toEqual([
      { name: 'Кейс 1', argsCode: '', expectedCode: '1', compare: 'deep', hidden: false },
    ])
  })

  it('неизвестный способ сравнения заменяется на deep', () => {
    expect(normalizeCases({ testCases: [{ expectedCode: '1', compare: 'что-то' }] })[0].compare)
      .toBe('deep')
  })

  it('кейс без ожидаемого значения — ошибка', () => {
    expect(() => normalizeCases({ slug: 'x', testCases: [{ argsCode: '1' }] }))
      .toThrow(TrainerSpecError)
  })

  it('публичные кейсы не включают скрытые', () => {
    expect(publicCases(unitTask)).toHaveLength(1)
  })

  it('сломанные кейсы не роняют публичный список', () => {
    expect(publicCases({ testCases: [{ argsCode: '1' }] })).toEqual([])
  })
})

describe('spec: сборка спецификации', () => {
  it('собирается для режима unit', () => {
    const spec = buildExecSpec(unitTask, 'js', 'function solve() { return 3 }')

    expect(spec.checkMode).toBe('unit')
    expect(spec.cases).toHaveLength(2)
    expect(spec.entryName).toBe('solve')
  })

  it('лимит времени зажимается в допустимые границы', () => {
    expect(buildExecSpec({ ...unitTask, timeLimitMs: 1 }, 'js', 'x').timeLimitMs).toBe(500)
    expect(buildExecSpec({ ...unitTask, timeLimitMs: 999999 }, 'js', 'x').timeLimitMs).toBe(10000)
    expect(buildExecSpec({ ...unitTask, timeLimitMs: null }, 'js', 'x').timeLimitMs).toBe(5000)
  })

  it('задача без тестов отвергается', () => {
    expect(() => buildExecSpec({ slug: 'x', checkMode: 'unit' }, 'js', 'x'))
      .toThrow(TrainerSpecError)
  })

  it('табличные кейсы без имени функции отвергаются', () => {
    expect(() =>
      buildExecSpec(
        { slug: 'x', checkMode: 'unit', testCases: [{ expectedCode: '1' }] },
        'js',
        'x',
      ),
    ).toThrow(TrainerSpecError)
  })

  it('режим stdout требует эталонного вывода', () => {
    expect(() => buildExecSpec({ slug: 'x', checkMode: 'stdout' }, 'js', 'x'))
      .toThrow(TrainerSpecError)
  })

  it('задачи на типы не исполняются', () => {
    expect(() => buildExecSpec({ slug: 'x', checkMode: 'types' }, 'ts', 'x'))
      .toThrow(TrainerSpecError)
  })
})

describe('compose: сборка скрипта', () => {
  const spec = buildExecSpec(unitTask, 'js', 'function solve(a, b) {\n  return a + b\n}')
  const composed = composeScript(spec)

  it('код пользователя занимает ровно свои строки', () => {
    expect(composed.userEndLine - composed.userStartLine + 1).toBe(3)
  })

  it('в скрипт попадает и харнесс, и тесты', () => {
    expect(composed.source).toContain('registerCase')
    expect(composed.source).toContain('function solve(a, b)')
    expect(composed.source).toContain('__tr.run()')
  })

  it('повторная сборка даёт тот же результат', () => {
    expect(composeScript(spec).source).toBe(composed.source)
  })

  it('номер строки синтаксической ошибки пересчитывается', () => {
    const inside = composed.userStartLine + 1
    expect(mapCompileLine(inside, composed, 0)).toBe(2)
    expect(mapCompileLine(composed.userStartLine - 1, composed, 0)).toBeUndefined()
    expect(mapCompileLine(null, composed, 0)).toBeUndefined()
  })
})

describe('result: нормализация', () => {
  it('мусор превращается в безопасный результат', () => {
    const result = normalizeRunResult({ status: 'нечто', tests: 'не массив' })

    expect(result.status).toBe('error')
    expect(result.tests).toEqual([])
    expect(result.totalCount).toBe(0)
  })

  it('статус сверяется с самими тестами', () => {
    const result = normalizeRunResult({
      status: 'passed',
      tests: [{ name: 'a', passed: true }, { name: 'b', passed: false }],
    })

    expect(result.status).toBe('failed')
    expect(result.passedCount).toBe(1)
  })

  it('пустой набор тестов не может быть пройден', () => {
    expect(normalizeRunResult({ status: 'passed', tests: [] }).status).toBe('error')
  })

  it('таймаут сохраняется как есть', () => {
    expect(normalizeRunResult({ status: 'timeout', tests: [] }).status).toBe('timeout')
  })

  it('скрытый кейс не раскрывает данные даже если песочница их прислала', () => {
    const result = normalizeRunResult({
      status: 'failed',
      tests: [{ name: 'a', passed: false, hidden: true, input: 'f(1)', expected: '2', actual: '3' }],
    })

    expect(result.tests[0].input).toBeUndefined()
    expect(result.tests[0].expected).toBeUndefined()
    expect(result.tests[0].actual).toBeUndefined()
  })

  it('длинные строки обрезаются', () => {
    const result = normalizeRunResult({
      status: 'failed',
      tests: [{ name: 'a', passed: false, expected: 'я'.repeat(5000) }],
    })

    expect((result.tests[0].expected ?? '').length).toBeLessThan(1000)
  })

  it('заглушка аварии', () => {
    const result = failureResult('timeout', 'долго')

    expect(result.status).toBe('timeout')
    expect(result.error).toBe('долго')
    expect(result.totalCount).toBe(0)
  })
})
