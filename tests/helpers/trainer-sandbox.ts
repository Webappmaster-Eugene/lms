import vm from 'node:vm'

import { composeScript } from '@/lib/trainer/compose'
import { normalizeRunResult } from '@/lib/trainer/result'
import { toCaseSpecs, type TrainerTaskSeed } from '@/data/trainer/types'
import type { TrainerExecSpec, TrainerLanguage, TrainerRunResult } from '@/lib/trainer/types'

/**
 * Хост песочницы для тестов — node:vm вместо isolated-vm.
 *
 * Тому же харнессу здесь тот же контекст: свежий, без require и без таймеров
 * (их подменяет сам харнесс). Поэтому вердикт тестов совпадает с вердиктом
 * браузера и сервера, а прогон 130 задач не упирается в старт изолятов.
 */

/** Запас поверх лимита задачи: тест не должен висеть, если решение зациклилось. */
const HOST_TIMEOUT_OVERHEAD_MS = 2000

export async function runInNodeVm(spec: TrainerExecSpec): Promise<TrainerRunResult> {
  const composed = composeScript(spec)
  const context = vm.createContext(Object.create(null))

  const script = new vm.Script(`(function(){\n${composed.source}\n})()`, {
    filename: 'trainer-sandbox.js',
  })

  const raw = await Promise.race([
    Promise.resolve(script.runInContext(context, { timeout: spec.timeLimitMs })),
    new Promise<never>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error('Прогон не завершился в отведённое время')),
        spec.timeLimitMs + HOST_TIMEOUT_OVERHEAD_MS,
      ).unref(),
    ),
  ])

  return normalizeRunResult(raw)
}

/** Собирает спецификацию прогона прямо из задачи каталога. */
export function specFromSeed(
  task: TrainerTaskSeed,
  language: TrainerLanguage,
  userCode: string,
): TrainerExecSpec {
  return {
    checkMode: task.checkMode === 'types' ? 'unit' : task.checkMode,
    language,
    setupCode: task.setupCode ?? '',
    userCode,
    testCode: task.testCode ?? '',
    cases: toCaseSpecs(task.cases),
    entryName: task.entryName ?? '',
    expectedOutput: task.expectedOutput,
    timeLimitMs: task.timeLimitMs ?? 5000,
  }
}
