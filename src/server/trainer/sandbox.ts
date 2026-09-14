import 'server-only'

import { composeScript } from '@/lib/trainer/compose'
import { TRAINER_LIMITS } from '@/lib/trainer/constants'
import { failureResult, normalizeRunResult } from '@/lib/trainer/result'
import { buildExecSpec, type TrainerTaskLike } from '@/lib/trainer/spec'

import type { TrainerDiagnostic, TrainerLanguage, TrainerRunResult } from '@/lib/trainer/types'
import { getRunnerPool, TrainerRunnerError } from './pool'

/**
 * Серверная проверка решения — единственный источник истины для начисления баллов.
 *
 * Клиентский прогон в iframe нужен только для мгновенной обратной связи: его
 * результат на сервер не принимается, сервер всегда пересобирает скрипт из
 * СВОЕЙ копии тестов и запускает его сам.
 */

type CompileResult = {
  js: string
  diagnostics: TrainerDiagnostic[]
}

/** Лимит времени на проверку типов: tsc не должен подвешивать пул. */
const TYPECHECK_TIME_LIMIT_MS = 8000

/**
 * Что показать компилятору вместо преамбулы.
 *
 * Преамбула исполняется как JavaScript и в strict-режиме даёт ложные ошибки про
 * неявный any. Если у задачи есть объявления типов — берём их; иначе преамбулу
 * как есть (для чисто типизированных фикстур это верно).
 */
function typeScriptSetup(task: TrainerTaskLike): string {
  const declarations = task.setupTypes?.trim()
  return declarations && declarations.length > 0 ? declarations : (task.setupCode ?? '')
}

function hasErrors(diagnostics: TrainerDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.category === 'error')
}

function diagnosticsToResult(diagnostics: TrainerDiagnostic[], checkMode: string): TrainerRunResult {
  const errors = diagnostics.filter((diagnostic) => diagnostic.category === 'error')

  if (errors.length === 0 && checkMode === 'types') {
    return {
      status: 'passed',
      tests: [
        {
          name: 'Типы соответствуют условию',
          hidden: false,
          passed: true,
          durationMs: 0,
        },
      ],
      passedCount: 1,
      totalCount: 1,
      consoleOutput: [],
      totalMs: 0,
    }
  }

  const first = errors[0]
  return {
    status: checkMode === 'types' ? 'failed' : 'compile_error',
    tests:
      checkMode === 'types'
        ? [
            {
              name: 'Типы соответствуют условию',
              hidden: false,
              passed: false,
              durationMs: 0,
              message: first ? first.message : 'Компилятор TypeScript сообщил об ошибке',
              ...(first && !first.inHarness ? { line: first.line } : {}),
            },
          ]
        : [],
    passedCount: 0,
    totalCount: checkMode === 'types' ? 1 : 0,
    consoleOutput: [],
    diagnostics,
    error: first ? first.message : 'Код не компилируется',
    ...(first && !first.inHarness ? { errorLine: first.line } : {}),
    totalMs: 0,
  }
}

/** Компиляция и, при необходимости, проверка типов в дочернем процессе. */
export async function compileTypeScript(input: {
  code: string
  setupCode?: string
  typeHarness?: string
  checkTypes: boolean
}): Promise<CompileResult> {
  const raw = await getRunnerPool().run<{ js?: string; diagnostics?: unknown[] }>(
    'typecheck',
    input,
    TYPECHECK_TIME_LIMIT_MS,
  )

  const diagnostics = Array.isArray(raw?.diagnostics)
    ? (raw.diagnostics as TrainerDiagnostic[])
    : []

  return { js: typeof raw?.js === 'string' ? raw.js : '', diagnostics }
}

/**
 * Прогоняет решение задачи на сервере и возвращает нормализованный результат.
 *
 * Ошибки инфраструктуры (пул перегружен, процесс не поднялся) не маскируются
 * под провал тестов: они возвращаются как исключение, чтобы роут ответил 503, а
 * не «решение неверное».
 */
export async function runSolution(
  task: TrainerTaskLike,
  language: TrainerLanguage,
  code: string,
): Promise<TrainerRunResult> {
  if (code.length > TRAINER_LIMITS.maxCodeLength) {
    return failureResult(
      'error',
      `Решение длиннее ${TRAINER_LIMITS.maxCodeLength} символов — сократите его`,
    )
  }

  const checkMode = task.checkMode === 'unit' || task.checkMode === 'types' ? task.checkMode : 'stdout'

  // Задачи на систему типов не исполняются вообще: их вердикт целиком за tsc.
  if (checkMode === 'types') {
    const compiled = await compileTypeScript({
      code,
      setupCode: typeScriptSetup(task),
      typeHarness: task.typeHarness ?? '',
      checkTypes: true,
    })
    return diagnosticsToResult(compiled.diagnostics, 'types')
  }

  let executableCode = code

  if (language === 'ts') {
    const compiled = await compileTypeScript({
      code,
      setupCode: typeScriptSetup(task),
      checkTypes: true,
    })
    if (hasErrors(compiled.diagnostics)) {
      return diagnosticsToResult(compiled.diagnostics, checkMode)
    }
    executableCode = compiled.js
  }

  const spec = buildExecSpec(task, language, executableCode)
  const composed = composeScript(spec)

  const raw = await getRunnerPool().run<unknown>(
    'execute',
    {
      source: composed.source,
      timeLimitMs: spec.timeLimitMs,
      userStartLine: composed.userStartLine,
      userEndLine: composed.userEndLine,
    },
    spec.timeLimitMs,
  )

  return normalizeRunResult(raw)
}

export { TrainerRunnerError }
