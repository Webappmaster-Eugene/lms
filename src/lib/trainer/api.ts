/**
 * Контракты HTTP-эндпоинтов тренажёра — общие для клиента и сервера.
 */

import type {
  TrainerCaseSpec,
  TrainerCheckMode,
  TrainerDifficulty,
  TrainerLanguage,
  TrainerRunResult,
} from './types'

/**
 * Задача в том виде, в каком она уезжает в браузер.
 *
 * Сюда попадает только то, что пользователю можно видеть: скрытые тест-кейсы и
 * эталонный вывод остаются на сервере. Клиентский прогон гоняет публичные
 * кейсы — как «Run» на LeetCode; полный набор отрабатывает «Отправить».
 */
export type ClientTaskSpec = {
  id: string
  slug: string
  topicSlug: string
  title: string
  difficulty: TrainerDifficulty
  checkMode: TrainerCheckMode
  languages: TrainerLanguage[]
  entryName: string
  setupCode: string
  testCode: string
  publicCases: TrainerCaseSpec[]
  /** Сколько тестов прогонится только на сервере. */
  hiddenCaseCount: number
  timeLimitMs: number
  starters: Partial<Record<TrainerLanguage, string>>
  pointsReward: number
}

/** Прогресс пользователя по задаче. */
export type ClientProgress = {
  isCompleted: boolean
  attempts: number
  failedAttempts: number
  savedCode: string | null
  savedLanguage: TrainerLanguage | null
}

export type SubmitRequest = {
  taskId: string
  language: TrainerLanguage
  code: string
}

export type SubmitResponse = {
  result: TrainerRunResult
  /** Задача зачтена (сейчас или ранее). */
  completed: boolean
  /** Баллы начислены именно этой отправкой. */
  awardedPoints: number | null
  attempts: number
}

export type TypecheckRequest = {
  taskId: string
  code: string
}

export type TypecheckResponse = {
  result: TrainerRunResult
}

export type SolutionResponse = {
  solutionCode: string | null
  solutionCodeTs: string | null
  solutionNotes: string | null
}

export type ApiError = { error: string }
