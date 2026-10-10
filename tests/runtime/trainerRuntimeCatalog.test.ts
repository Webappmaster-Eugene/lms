import { beforeAll, describe, expect, it } from 'vitest'

import { TRAINER_CATALOG } from '@/data/trainer'
import { flattenCatalog, type TrainerTaskSeed } from '@/data/trainer/types'
import { isRuntimeLanguage, runtimeCases, type RuntimeLanguage } from '@/lib/trainer/runtime-spec'
import type { TrainerRunResult } from '@/lib/trainer/types'

const entries = flattenCatalog(TRAINER_CATALOG).flatMap(({ topic, task }) =>
  task.languages.filter(isRuntimeLanguage).map(language => ({ topic, task, language })),
)

let runtimeUrl: string
let runtimeToken: string

function source(task: TrainerTaskSeed, language: RuntimeLanguage, solution: boolean): string {
  if (language === 'go') {
    const code = solution ? task.solutionCodeGo : task.starterCodeGo
    if (!code) throw new Error(`У ${task.slug} отсутствует ${solution ? 'эталон' : 'шаблон'} Go`)
    return code
  }
  const files = solution ? task.solutionFiles : task.starterFiles
  if (!files) throw new Error(`У ${task.slug} отсутствуют ${solution ? 'эталонные' : 'стартовые'} файлы`)
  return JSON.stringify(files)
}

async function run(task: TrainerTaskSeed, language: RuntimeLanguage, code: string): Promise<TrainerRunResult> {
  const response = await fetch(`${runtimeUrl}/run`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${runtimeToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      language,
      code,
      cases: runtimeCases(task),
      timeLimitMs: task.timeLimitMs ?? 5000,
    }),
    signal: AbortSignal.timeout(240000),
  })
  if (!response.ok) {
    throw new Error(`Среда выполнения ответила HTTP ${response.status}: ${(await response.text()).slice(0, 1000)}`)
  }
  return response.json() as Promise<TrainerRunResult>
}

function details(result: TrainerRunResult): string {
  return [
    result.status,
    result.error,
    ...result.tests.filter(test => !test.passed).map(test => `${test.name}: ${test.message ?? 'проверка не пройдена'}`),
  ].filter(Boolean).join('\n')
}

describe('каталог Go и frontend в настоящей среде выполнения', () => {
  beforeAll(() => {
    const configuredUrl = process.env.TRAINER_RUNTIME_URL
    const configuredToken = process.env.TRAINER_RUNTIME_TOKEN
    if (!configuredUrl || !configuredToken) {
      throw new Error('Запустите pnpm test:trainer-runtime либо подключите готовый сервис через TRAINER_RUNTIME_URL и TRAINER_RUNTIME_TOKEN. Эти проверки требуют настоящую среду выполнения.')
    }
    runtimeUrl = configuredUrl.replace(/\/+$/, '')
    runtimeToken = configuredToken
  })

  it('новые задачи подключены к основному каталогу', () => {
    expect(new Set(entries.map(entry => entry.language))).toEqual(new Set(['go', 'html', 'react', 'next']))
  })

  describe.each(entries.map(({ topic, task, language }) => [topic.slug, task.slug, language, task] as const))(
    '%s / %s (%s)',
    (_topic, _slug, language, task) => {
      it('есть открытые и скрытые проверки', () => {
        const cases = runtimeCases(task)
        expect(cases.some(test => !test.hidden)).toBe(true)
        expect(cases.some(test => test.hidden)).toBe(true)
        expect(runtimeCases(task, true)).toEqual(cases.filter(test => !test.hidden))
      })

      it('эталон проходит все открытые и скрытые проверки', { timeout: 250000 }, async () => {
        const result = await run(task, language, source(task, language, true))
        expect(result.status, details(result)).toBe('passed')
        expect(result.totalCount).toBe(runtimeCases(task).length)
        expect(result.passedCount).toBe(result.totalCount)
      })

      it('шаблон компилируется, но не проходит проверки', { timeout: 250000 }, async () => {
        const result = await run(task, language, source(task, language, false))
        expect(result.status, details(result)).toBe('failed')
        expect(result.totalCount).toBe(runtimeCases(task).length)
        expect(result.passedCount).toBeLessThan(result.totalCount)
      })
    },
  )
})
