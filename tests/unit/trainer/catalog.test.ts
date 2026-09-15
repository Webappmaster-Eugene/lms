import { beforeAll, describe, expect, it } from 'vitest'

import { TRAINER_CATALOG } from '@/data/trainer'
import { flattenCatalog, toCaseSpecs, type TrainerTaskSeed } from '@/data/trainer/types'
import { runInNodeVm, sandboxTestTimeoutMs, specFromSeed } from '../../helpers/trainer-sandbox'
import {
  compileSeedTypeScript,
  transpileSeed,
  warmUpTypeScript,
} from '../../helpers/trainer-typescript'
import type { TrainerLanguage, TrainerRunResult } from '@/lib/trainer/types'

/**
 * Главная гарантия каталога.
 *
 * Для каждой задачи проверяется три вещи:
 *   1. эталонное решение проходит все свои тесты — иначе задача сломана;
 *   2. стартовый шаблон их НЕ проходит — иначе задача тривиальна или тесты
 *      ничего не проверяют;
 *   3. для TypeScript эталон компилируется без единой диагностики.
 *
 * Именно этот тест не даёт выложить задачу, которую невозможно решить или,
 * наоборот, которая засчитывается сама по себе.
 */

const entries = flattenCatalog(TRAINER_CATALOG)

async function runSolutionOf(
  task: TrainerTaskSeed,
  language: TrainerLanguage,
  code: string,
): Promise<TrainerRunResult> {
  if (task.checkMode === 'types') {
    const diagnostics = await compileSeedTypeScript(task, code)
    return {
      status: diagnostics.length === 0 ? 'passed' : 'failed',
      tests: [],
      passedCount: diagnostics.length === 0 ? 1 : 0,
      totalCount: 1,
      consoleOutput: [],
      diagnostics,
      totalMs: 0,
    }
  }

  let executable = code

  if (language === 'ts') {
    // Эталон на TypeScript обязан компилироваться начисто: если он сам не
    // проходит strict-проверку, требовать этого от пользователя нечестно.
    const diagnostics = await compileSeedTypeScript(task, code)
    if (diagnostics.some((item) => item.category === 'error')) {
      return {
        status: 'compile_error',
        tests: [],
        passedCount: 0,
        totalCount: 0,
        consoleOutput: [],
        diagnostics,
        totalMs: 0,
      }
    }
    executable = await transpileSeed(task, code)
  }

  return runInNodeVm(specFromSeed(task, language, executable))
}

function describeFailure(result: TrainerRunResult): string {
  const failed = result.tests
    .filter((test) => !test.passed)
    .map((test) => `«${test.name}»: ${test.message ?? 'без сообщения'}`)
  const diagnostics = (result.diagnostics ?? []).map(
    (item) => `TS${item.code} (${item.line}:${item.column}) ${item.message}`,
  )
  return [result.error, ...failed, ...diagnostics].filter(Boolean).join('; ') || result.status
}

describe('каталог задач тренажёра', () => {
  beforeAll(async () => {
    await warmUpTypeScript()
  }, 60000)

  it('в каталоге есть задачи', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it('slug задач уникальны во всём каталоге', () => {
    const seen = new Map<string, string>()
    for (const { topic, task } of entries) {
      const previous = seen.get(task.slug)
      expect(previous, `slug «${task.slug}» встречается в темах ${previous} и ${topic.slug}`).toBe(
        undefined,
      )
      seen.set(task.slug, topic.slug)
    }
  })

  it('slug тем уникальны', () => {
    const slugs = TRAINER_CATALOG.map((topic) => topic.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  describe.each(entries.map(({ topic, task }) => [topic.slug, task.slug, task] as const))(
    '%s / %s',
    (_topicSlug, _taskSlug, task) => {
      it('описана корректно', () => {
        expect(task.title.length, 'у задачи должно быть название').toBeGreaterThan(0)
        expect(task.descriptionMd.trim().length, 'условие не должно быть пустым').toBeGreaterThan(20)
        expect(task.languages.length, 'должен быть хотя бы один язык').toBeGreaterThan(0)

        if (task.checkMode === 'unit') {
          const hasTests =
            (task.cases?.length ?? 0) > 0 || (task.testCode ?? '').trim().length > 0
          expect(hasTests, 'у задачи режима unit должны быть тесты').toBe(true)

          if ((task.cases?.length ?? 0) > 0) {
            expect(task.entryName, 'табличным тестам нужно имя функции решения').toBeTruthy()
          }
        }

        if (task.checkMode === 'types') {
          expect(task.typeHarness?.trim().length, 'нужен блок проверки типов').toBeGreaterThan(0)
          expect(task.languages, 'задача на типы решается только на TypeScript').toEqual(['ts'])
        }

        if (task.checkMode === 'stdout') {
          expect(task.expectedOutput, 'режиму stdout нужен эталонный вывод').toBeTruthy()
        }

        // Литералы табличных кейсов должны собираться — иначе задача упадёт
        // уже у пользователя, а не здесь.
        expect(() => toCaseSpecs(task.cases)).not.toThrow()

        for (const language of task.languages) {
          if (language === 'ts') {
            expect(
              task.starterCodeTs ?? task.starterCode,
              'нужен стартовый шаблон для TypeScript',
            ).toBeTruthy()
            expect(
              task.solutionCodeTs ?? task.solutionCode,
              'нужно эталонное решение для TypeScript',
            ).toBeTruthy()
          } else {
            expect(task.starterCode, 'нужен стартовый шаблон').toBeTruthy()
            expect(task.solutionCode, 'нужно эталонное решение').toBeTruthy()
          }
        }
      })

      const timeout = sandboxTestTimeoutMs(task.timeLimitMs)

      for (const language of task.languages) {
        it(`эталонное решение (${language}) проходит все тесты`, { timeout }, async () => {
          const code =
            language === 'ts' ? (task.solutionCodeTs ?? task.solutionCode) : task.solutionCode
          const result = await runSolutionOf(task, language, code)
          expect(result.status, describeFailure(result)).toBe('passed')
        })
      }

      it('стартовый шаблон тесты НЕ проходит', { timeout }, async () => {
        const language = task.languages[0]
        const code =
          task.wrongSolution ??
          (language === 'ts' ? (task.starterCodeTs ?? task.starterCode) : task.starterCode)
        const result = await runSolutionOf(task, language, code)
        expect(
          result.status,
          'шаблон проходит проверку — значит, решать нечего или тесты ничего не проверяют',
        ).not.toBe('passed')
      })
    },
  )
})
