/**
 * Превращение документа задачи в спецификацию прогона.
 *
 * Единственное место, где схема Payload встречается с движком: дальше по коду
 * (харнесс, песочницы, тесты каталога) о коллекциях никто не знает.
 */

import { TRAINER_LIMITS } from './constants'
import type { TrainerCaseSpec, TrainerCompare, TrainerExecSpec, TrainerLanguage } from './types'

/**
 * Поля задачи, нужные движку. Намеренно структурная типизация, а не
 * `TrainerTask` из payload-types: тем же типом описываются и задачи из
 * каталога (src/data/trainer), которых в БД ещё нет.
 */
export type TrainerTaskLike = {
  slug?: string | null
  checkMode?: string | null
  languages?: (string | null)[] | string | null
  entryName?: string | null
  setupCode?: string | null
  setupTypes?: string | null
  starterCode?: string | null
  starterCodeTs?: string | null
  solutionCode?: string | null
  solutionCodeTs?: string | null
  testCode?: string | null
  typeHarness?: string | null
  expectedOutput?: string | null
  timeLimitMs?: number | null
  testCases?:
    | ({
        name?: string | null
        argsCode?: string | null
        expectedCode?: string | null
        compare?: string | null
        hidden?: boolean | null
        id?: string | null
      } | null)[]
    | null
}

const COMPARE_VALUES: readonly TrainerCompare[] = ['deep', 'strict', 'approx', 'sorted', 'set']

export class TrainerSpecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrainerSpecError'
  }
}

/** Языки, объявленные у задачи. Пустой список считаем как `['js']`. */
export function taskLanguages(task: TrainerTaskLike): TrainerLanguage[] {
  const raw = Array.isArray(task.languages)
    ? task.languages
    : task.languages
      ? [task.languages]
      : []
  const languages = raw.filter((item): item is TrainerLanguage => item === 'js' || item === 'ts')
  return languages.length > 0 ? languages : ['js']
}

export function supportsLanguage(task: TrainerTaskLike, language: TrainerLanguage): boolean {
  return taskLanguages(task).includes(language)
}

/** Стартовый шаблон под выбранный язык. Для TS откатываемся на JS-шаблон. */
export function starterCodeFor(task: TrainerTaskLike, language: TrainerLanguage): string {
  if (language === 'ts') return task.starterCodeTs ?? task.starterCode ?? ''
  return task.starterCode ?? ''
}

/** Эталонное решение под выбранный язык. */
export function solutionCodeFor(
  task: TrainerTaskLike,
  language: TrainerLanguage,
): string | undefined {
  const code = language === 'ts' ? (task.solutionCodeTs ?? task.solutionCode) : task.solutionCode
  return code ?? undefined
}

export function normalizeCases(task: TrainerTaskLike): TrainerCaseSpec[] {
  const rows = Array.isArray(task.testCases) ? task.testCases : []
  const cases: TrainerCaseSpec[] = []

  rows.forEach((row, index) => {
    if (!row) return
    const argsCode = row.argsCode ?? ''
    const expectedCode = row.expectedCode ?? ''
    if (expectedCode.trim().length === 0) {
      throw new TrainerSpecError(
        `Табличный кейс №${index + 1} задачи «${task.slug ?? '?'}» без ожидаемого значения`,
      )
    }
    const compare = COMPARE_VALUES.includes(row.compare as TrainerCompare)
      ? (row.compare as TrainerCompare)
      : 'deep'
    cases.push({
      name: row.name?.trim() || `Кейс ${index + 1}`,
      argsCode,
      expectedCode,
      compare,
      hidden: row.hidden === true,
    })
  })

  return cases
}

function clampTimeLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return TRAINER_LIMITS.defaultTimeLimitMs
  }
  return Math.min(Math.max(Math.round(value), 500), TRAINER_LIMITS.maxTimeLimitMs)
}

/**
 * Собирает спецификацию прогона.
 *
 * `userCode` передаётся отдельно и для TypeScript должен быть УЖЕ
 * транспилирован в JavaScript: песочница исполняет только JS.
 */
export function buildExecSpec(
  task: TrainerTaskLike,
  language: TrainerLanguage,
  userCode: string,
): TrainerExecSpec {
  const checkMode =
    task.checkMode === 'unit' || task.checkMode === 'types' ? task.checkMode : 'stdout'

  if (checkMode === 'types') {
    throw new TrainerSpecError(
      'Задачи на систему типов не исполняются: их проверяет только компилятор TypeScript',
    )
  }

  const cases = checkMode === 'unit' ? normalizeCases(task) : []
  const testCode = checkMode === 'unit' ? (task.testCode ?? '') : ''
  const entryName = task.entryName?.trim() ?? ''

  if (checkMode === 'unit') {
    if (cases.length === 0 && testCode.trim().length === 0) {
      throw new TrainerSpecError(`У задачи «${task.slug ?? '?'}» нет ни одного теста`)
    }
    if (cases.length > 0 && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entryName)) {
      throw new TrainerSpecError(
        `У задачи «${task.slug ?? '?'}» есть табличные тесты, но не задано корректное имя функции решения`,
      )
    }
  }

  if (checkMode === 'stdout' && (task.expectedOutput ?? '').length === 0) {
    throw new TrainerSpecError(`У задачи «${task.slug ?? '?'}» не задан ожидаемый вывод`)
  }

  return {
    checkMode,
    language,
    setupCode: task.setupCode ?? '',
    userCode,
    testCode,
    cases,
    entryName,
    expectedOutput: task.expectedOutput ?? undefined,
    timeLimitMs: clampTimeLimit(task.timeLimitMs),
  }
}

/**
 * Публичные (не скрытые) кейсы — их показываем на вкладке «Тесты» ещё до
 * запуска, чтобы условие задачи было однозначным.
 */
export function publicCases(task: TrainerTaskLike): TrainerCaseSpec[] {
  try {
    return normalizeCases(task).filter((item) => !item.hidden)
  } catch {
    return []
  }
}
