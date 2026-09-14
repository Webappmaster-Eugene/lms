/**
 * Формат каталога задач тренажёра.
 *
 * Каталог лежит кодом, а не в БД: так у каждой задачи есть эталонное решение
 * рядом с тестами, и tests/unit/trainer/catalog.test.ts может прогнать их все
 * на каждом `pnpm test`. Сломанная или тривиальная задача до продакшена не
 * доезжает — сборка падает раньше.
 */

import { toArgsLiteral, toLiteral } from '@/lib/trainer/literal'
import type { TrainerCompany, TrainerTag, TrainerTopicCategory } from '@/lib/trainer/constants'
import type {
  TrainerCaseSpec,
  TrainerCheckMode,
  TrainerCompare,
  TrainerDifficulty,
  TrainerLanguage,
} from '@/lib/trainer/types'

/**
 * Табличный кейс в удобной для авторинга форме: значения пишутся как обычные
 * JS-значения, в код литералов их переводит {@link toCaseSpec}.
 */
export type TrainerCaseInput = {
  name?: string
  args: unknown[]
  expected: unknown
  compare?: TrainerCompare
  hidden?: boolean
}

export type TrainerTaskSeed = {
  slug: string
  title: string
  difficulty: TrainerDifficulty
  /** Условие в Markdown: списки, таблицы, блоки кода. */
  descriptionMd: string
  languages: TrainerLanguage[]
  checkMode: TrainerCheckMode
  /** Имя функции или класса, которое обязано появиться в решении. */
  entryName?: string
  /** Преамбула — только JavaScript, она одна на оба языка. */
  setupCode?: string
  /**
   * Объявления преамбулы для компилятора TypeScript.
   *
   * Преамбула исполняется как JavaScript, а tsc проверяет решение в strict-режиме
   * и спотыкается на её нетипизированных фикстурах. Поэтому для компилятора
   * подставляются `declare`-объявления, а не сам код.
   */
  setupTypes?: string
  starterCode: string
  starterCodeTs?: string
  solutionCode: string
  solutionCodeTs?: string
  solutionNotes?: string
  cases?: TrainerCaseInput[]
  testCode?: string
  typeHarness?: string
  expectedOutput?: string
  hints?: string[]
  tags?: TrainerTag[]
  companies?: TrainerCompany[]
  sourceUrl?: string
  leetcodeNumber?: number
  pointsReward?: number
  timeLimitMs?: number
  /**
   * Решение, которое обязано провалить тесты. Нужно там, где стартовый шаблон
   * уже «почти решение» (например, у задач на систему типов) и проверка
   * «шаблон не проходит» сама по себе ничего не доказывает.
   */
  wrongSolution?: string
}

export type TrainerTopicSeed = {
  slug: string
  title: string
  description: string
  category: TrainerTopicCategory
  icon?: string
  order: number
  tasks: TrainerTaskSeed[]
}

/** Баллы по сложности, если у задачи не задано своё значение. */
export const POINTS_BY_DIFFICULTY: Readonly<Record<TrainerDifficulty, number>> = {
  easy: 10,
  medium: 20,
  hard: 35,
}

/** Переводит авторский кейс в то, что хранится в БД и исполняется в песочнице. */
export function toCaseSpec(input: TrainerCaseInput, index: number): TrainerCaseSpec {
  return {
    name: input.name ?? `Кейс ${index + 1}`,
    argsCode: toArgsLiteral(input.args),
    expectedCode: toLiteral(input.expected),
    compare: input.compare ?? 'deep',
    hidden: input.hidden === true,
  }
}

export function toCaseSpecs(inputs: readonly TrainerCaseInput[] | undefined): TrainerCaseSpec[] {
  return (inputs ?? []).map(toCaseSpec)
}

/** Все задачи каталога одним списком вместе со своей темой. */
export function flattenCatalog(
  catalog: readonly TrainerTopicSeed[],
): Array<{ topic: TrainerTopicSeed; task: TrainerTaskSeed }> {
  return catalog.flatMap((topic) => topic.tasks.map((task) => ({ topic, task })))
}
