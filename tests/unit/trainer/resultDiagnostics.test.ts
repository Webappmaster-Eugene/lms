import { describe, expect, it } from 'vitest'

import { normalizeRunResult } from '@/lib/trainer/result'

/**
 * Диагностики компилятора приходят в результат прогона из-за границы доверия
 * (iframe, runtime) и попадают в редактор. Нормализатор обязан пропустить
 * только корректные записи нужной формы и длины.
 */

const base = { status: 'compile_error', tests: [] }

describe('normalizeRunResult: диагностики', () => {
  it('оставляет только записи со строкой, колонкой и текстом, приводя их к целым не меньше 1', () => {
    const result = normalizeRunResult({
      ...base,
      diagnostics: [
        { line: 3.6, column: 0, code: 2322.4, message: 'Type mismatch', category: 'warning', extra: '<script>' },
        { line: -5, column: 2, message: 'ниже первой строки' },
        { line: 1, column: 1 },
        { line: '2', column: 1, message: 'строка вместо числа' },
        { line: Number.NaN, column: 1, message: 'NaN' },
        null,
        'мусор',
      ],
    })
    expect(result.diagnostics).toEqual([
      { line: 4, column: 1, code: 2322, message: 'Type mismatch', category: 'warning' },
      { line: 1, column: 2, code: 0, message: 'ниже первой строки', category: 'error' },
    ])
  })

  it('обрезает текст диагностики и берёт не больше 50 записей', () => {
    const result = normalizeRunResult({
      ...base,
      diagnostics: Array.from({ length: 60 }, (_, index) => ({ line: index + 1, column: 1, message: index === 0 ? 'я'.repeat(700) : `ошибка ${index}`, category: 'error' })),
    })
    expect(result.diagnostics).toHaveLength(50)
    expect(result.diagnostics?.[0].message).toBe(`${'я'.repeat(600)}…`)
    expect(result.diagnostics?.at(-1)?.line).toBe(50)
  })

  it('без единой корректной диагностики поле не появляется', () => {
    expect(normalizeRunResult({ ...base, diagnostics: [{ message: 'без позиции' }] })).not.toHaveProperty('diagnostics')
    expect(normalizeRunResult({ ...base, diagnostics: 'не массив' })).not.toHaveProperty('diagnostics')
  })

  it('строку ошибки принимает только положительную и округляет', () => {
    expect(normalizeRunResult({ ...base, error: 'boom', errorLine: 2.7 })).toMatchObject({ error: 'boom', errorLine: 3 })
    expect(normalizeRunResult({ ...base, error: 'boom', errorLine: 0 })).not.toHaveProperty('errorLine')
  })
})
