/**
 * Типы движка тренажёра.
 *
 * Модуль изоморфный: используется и в браузере (iframe-песочница), и на сервере
 * (isolated-vm, tsc), и в тестах (node:vm). Ничего не импортирует из Payload
 * и Next — только чистые типы.
 */

/** Язык, на котором пользователь решает задачу. */
export type TrainerLanguage = 'js' | 'ts'

/**
 * Способ проверки решения.
 * - `stdout` — легаси: сравнение вывода console.log с эталонной строкой.
 * - `unit`   — прогон тестов (табличных и/или написанных на API харнесса).
 * - `types`  — задача на систему типов TypeScript: проверяется только tsc.
 */
export type TrainerCheckMode = 'stdout' | 'unit' | 'types'

export type TrainerDifficulty = 'easy' | 'medium' | 'hard'

/** Как сравнивать результат с ожидаемым в табличных тестах. */
export type TrainerCompare =
  /** Структурное сравнение (Map/Set/Date/NaN/циклы). */
  | 'deep'
  /** Object.is — строгое равенство ссылок и примитивов. */
  | 'strict'
  /** Числа с точностью до 1e-9. */
  | 'approx'
  /** Массивы, отсортированные перед сравнением (порядок не важен). */
  | 'sorted'
  /** Массивы как множества (порядок и дубли не важны). */
  | 'set'

/**
 * Один табличный тест-кейс в том виде, в каком он лежит в БД.
 *
 * Аргументы и ожидаемое значение хранятся КОДОМ, а не JSON: иначе не выразить
 * `undefined`, `NaN`, `-0`, `Map`, `Set`, дыры в массивах — а на них построена
 * половина задач про полифиллы и глубокое сравнение. См. `literal.ts`.
 */
export type TrainerCaseSpec = {
  name: string
  /** Код списка аргументов: `1, "a", [2]`. */
  argsCode: string
  /** Код ожидаемого значения: `new Map([["k", 1]])`. */
  expectedCode: string
  compare: TrainerCompare
  /**
   * Скрытый кейс: входные данные и ожидаемое значение не показываются
   * пользователю — ни в UI, ни в ответе API.
   */
  hidden: boolean
}

/** Результат одного теста. */
export type TrainerTestOutcome = {
  name: string
  hidden: boolean
  passed: boolean
  durationMs: number
  /** Сериализованные входные данные. Отсутствует у скрытых кейсов. */
  input?: string
  /** Сериализованное ожидаемое значение. Отсутствует у скрытых кейсов. */
  expected?: string
  /** Сериализованное фактическое значение. Отсутствует у скрытых кейсов. */
  actual?: string
  /** Человекочитаемое сообщение об ошибке. */
  message?: string
  /** Имя класса исключения, если тест упал не на ассерте (TypeError и т.п.). */
  errorName?: string
  /** Номер строки в коде пользователя (1-based), если удалось определить. */
  line?: number
}

export type TrainerRunStatus =
  /** Все тесты прошли. */
  | 'passed'
  /** Хотя бы один тест упал. */
  | 'failed'
  /** Код не скомпилировался (SyntaxError) или упал до запуска тестов. */
  | 'compile_error'
  /** Ошибка исполнения вне теста. */
  | 'error'
  /** Превышен лимит времени. */
  | 'timeout'

/** Диагностика компилятора TypeScript. */
export type TrainerDiagnostic = {
  /** 1-based номер строки в коде пользователя. */
  line: number
  /** 1-based номер колонки. */
  column: number
  /** Код ошибки TS (например 2322). */
  code: number
  message: string
  category: 'error' | 'warning'
  /**
   * Диагностика пришла не из кода пользователя, а из блока проверки типов
   * (`Expect<Equal<...>>`). Для UI это «тип не сошёлся с эталоном», а не ошибка
   * в конкретной строке решения — подсвечивать строку нельзя.
   */
  inHarness?: boolean
}

/** Полный результат прогона. */
export type TrainerRunResult = {
  status: TrainerRunStatus
  tests: TrainerTestOutcome[]
  passedCount: number
  totalCount: number
  /** Перехваченный вывод console.*. */
  consoleOutput: string[]
  /** Диагностики tsc (только для TypeScript). */
  diagnostics?: TrainerDiagnostic[]
  /** Текст ошибки уровня прогона (компиляция, таймаут, падение вне теста). */
  error?: string
  /** Строка в коде пользователя, к которой относится `error`. */
  errorLine?: number
  totalMs: number
}

/**
 * Всё, что нужно раннеру для прогона. Формируется на сервере из документа
 * задачи, чтобы ни один хост не зависел от схемы Payload.
 */
export type TrainerExecSpec = {
  checkMode: TrainerCheckMode
  language: TrainerLanguage
  /** Преамбула: фикстуры и хелперы, доступные и коду пользователя, и тестам. */
  setupCode: string
  /** Код пользователя (для TS — уже транспилированный в JS). */
  userCode: string
  /** Тесты на API харнесса. Дополняют табличные кейсы, не заменяют их. */
  testCode: string
  /** Табличные кейсы: вызвать `entryName` с аргументами и сравнить результат. */
  cases: TrainerCaseSpec[]
  /** Имя функции/класса, которое должен объявить пользователь. */
  entryName: string
  /** Эталонный вывод для `checkMode: 'stdout'`. */
  expectedOutput?: string
  timeLimitMs: number
}

/** Успех/провал одного прогона в терминах, пригодных для записи прогресса. */
export function isPassed(result: TrainerRunResult): boolean {
  return result.status === 'passed' && result.totalCount > 0
}
