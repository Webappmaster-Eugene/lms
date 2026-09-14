import type { TrainerTaskSeed } from '@/data/trainer/types'
import type { TrainerDiagnostic } from '@/lib/trainer/types'

/**
 * Обёртка над сервисом компиляции для тестов.
 *
 * Сервис лежит в .mjs — он запускается в дочернем процессе мимо сборки Next.
 * Здесь он подгружается напрямую: поднимать процесс ради 130 компиляций дорого,
 * а изоляция тут не нужна — tsc работает с текстом, а не исполняет его.
 */

type CompileInput = {
  code: string
  setupCode?: string
  typeHarness?: string
  checkTypes?: boolean
}

type CompileOutput = {
  js: string
  diagnostics: TrainerDiagnostic[]
}

type CompileFn = (input: CompileInput) => CompileOutput

let compileFn: CompileFn | null = null

async function getCompile(): Promise<CompileFn> {
  if (!compileFn) {
    const service = (await import('@/server/trainer/typescript-service.mjs')) as {
      compile: CompileFn
    }
    compileFn = service.compile
  }
  return compileFn
}

/** Диагностики компилятора для решения задачи. */
export async function compileSeedTypeScript(
  task: TrainerTaskSeed,
  code: string,
): Promise<TrainerDiagnostic[]> {
  const compile = await getCompile()
  return compile({
    code,
    // Компилятору показываются объявления типов, а не исполняемая преамбула —
    // ровно как это делает сервер. См. typeScriptSetup в sandbox.ts.
    setupCode: task.setupTypes?.trim() || (task.setupCode ?? ''),
    typeHarness: task.checkMode === 'types' ? (task.typeHarness ?? '') : '',
    checkTypes: true,
  }).diagnostics
}

/** Транспиляция решения в JavaScript без проверки типов. */
export async function transpileSeed(task: TrainerTaskSeed, code: string): Promise<string> {
  const compile = await getCompile()
  return compile({ code, setupCode: task.setupCode ?? '', checkTypes: false }).js
}
