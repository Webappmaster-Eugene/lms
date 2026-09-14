/**
 * Нормализация результата прогона.
 *
 * Результат из iframe приходит через postMessage, то есть из-за границы доверия:
 * структура может быть какой угодно. Поэтому всё, что попадает в состояние UI и
 * тем более уходит на сервер, проходит через нормализатор — он отбрасывает лишние
 * поля, обрезает длины и гарантирует типы.
 */

import { TRAINER_LIMITS } from './constants'
import type {
  TrainerDiagnostic,
  TrainerRunResult,
  TrainerRunStatus,
  TrainerTestOutcome,
} from './types'

const STATUSES: readonly TrainerRunStatus[] = [
  'passed',
  'failed',
  'compile_error',
  'error',
  'timeout',
]

function asString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
  return trimmed
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeOutcome(input: unknown, index: number): TrainerTestOutcome {
  const raw = (input ?? {}) as Record<string, unknown>
  const hidden = raw.hidden === true
  const outcome: TrainerTestOutcome = {
    name: asString(raw.name, 200) ?? `Тест ${index + 1}`,
    hidden,
    passed: raw.passed === true,
    durationMs: Math.max(0, Math.round(asFiniteNumber(raw.durationMs) ?? 0)),
  }

  // У скрытых кейсов входные данные и ожидаемое значение не показываем никогда,
  // даже если песочница их почему-то прислала.
  if (!hidden) {
    const input_ = asString(raw.input, TRAINER_LIMITS.maxSerializedLength)
    const expected = asString(raw.expected, TRAINER_LIMITS.maxSerializedLength)
    const actual = asString(raw.actual, TRAINER_LIMITS.maxSerializedLength)
    if (input_ !== undefined) outcome.input = input_
    if (expected !== undefined) outcome.expected = expected
    if (actual !== undefined) outcome.actual = actual
  }

  const message = asString(raw.message, 600)
  if (message !== undefined) outcome.message = message

  const errorName = asString(raw.errorName, 80)
  if (errorName !== undefined) outcome.errorName = errorName

  const line = asFiniteNumber(raw.line)
  if (line !== undefined && line >= 1) outcome.line = Math.round(line)

  return outcome
}

function normalizeDiagnostic(input: unknown): TrainerDiagnostic | null {
  const raw = (input ?? {}) as Record<string, unknown>
  const line = asFiniteNumber(raw.line)
  const column = asFiniteNumber(raw.column)
  const message = asString(raw.message, 600)
  if (line === undefined || column === undefined || message === undefined) return null
  return {
    line: Math.max(1, Math.round(line)),
    column: Math.max(1, Math.round(column)),
    code: Math.round(asFiniteNumber(raw.code) ?? 0),
    message,
    category: raw.category === 'warning' ? 'warning' : 'error',
  }
}

export function normalizeRunResult(input: unknown): TrainerRunResult {
  const raw = (input ?? {}) as Record<string, unknown>

  const status: TrainerRunStatus = STATUSES.includes(raw.status as TrainerRunStatus)
    ? (raw.status as TrainerRunStatus)
    : 'error'

  const tests = Array.isArray(raw.tests)
    ? raw.tests.slice(0, 200).map((item, index) => normalizeOutcome(item, index))
    : []

  const consoleOutput = Array.isArray(raw.consoleOutput)
    ? raw.consoleOutput
        .slice(0, TRAINER_LIMITS.maxConsoleLines)
        .map((line) => asString(line, 2000) ?? '')
    : []

  const diagnostics = Array.isArray(raw.diagnostics)
    ? raw.diagnostics
        .slice(0, 50)
        .map(normalizeDiagnostic)
        .filter((item): item is TrainerDiagnostic => item !== null)
    : undefined

  const passedCount = tests.filter((test) => test.passed).length

  const result: TrainerRunResult = {
    // Статус не берём на веру: он должен сходиться с самими тестами.
    status: reconcileStatus(status, tests.length, passedCount),
    tests,
    passedCount,
    totalCount: tests.length,
    consoleOutput,
    totalMs: Math.max(0, Math.round(asFiniteNumber(raw.totalMs) ?? 0)),
  }

  if (diagnostics && diagnostics.length > 0) result.diagnostics = diagnostics

  const error = asString(raw.error, 1000)
  if (error !== undefined) result.error = error

  const errorLine = asFiniteNumber(raw.errorLine)
  if (errorLine !== undefined && errorLine >= 1) result.errorLine = Math.round(errorLine)

  return result
}

/**
 * Статус «passed» имеет право существовать только когда тесты действительно есть
 * и все они зелёные. Статусы аварий (timeout / compile_error / error) сохраняем
 * как есть — они описывают то, что случилось до или вместо тестов.
 */
function reconcileStatus(
  status: TrainerRunStatus,
  totalCount: number,
  passedCount: number,
): TrainerRunStatus {
  if (status === 'timeout' || status === 'compile_error') return status
  if (totalCount === 0) return status === 'passed' ? 'error' : status
  return passedCount === totalCount ? 'passed' : 'failed'
}

/** Результат-заглушка для аварий на уровне хоста (таймаут, отказ песочницы). */
export function failureResult(
  status: TrainerRunStatus,
  error: string,
  consoleOutput: string[] = [],
): TrainerRunResult {
  return {
    status,
    tests: [],
    passedCount: 0,
    totalCount: 0,
    consoleOutput,
    error,
    totalMs: 0,
  }
}
