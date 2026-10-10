/**
 * Итоговый балл и вердикт считает код, а не модель.
 *
 * Модели хорошо даётся оценка отдельного ответа с опорой на цитату и плохо — арифметика
 * и последовательность: одинаковые оценки по критериям у неё дают то «скорее да», то
 * «под вопросом». Поэтому модель ставит баллы 1–5, а сводит их эта функция — одинаково
 * для каждого кандидата, что и делает кандидатов сравнимыми между собой.
 */

import type { InterviewCriterion, InterviewCriterionScore, InterviewScore, InterviewVerdict } from '@/lib/interviews/analysis/types'

/** Ниже этой доли оценённого веса вердикт не выносится: собеседование прошло мимо вакансии. */
export const MIN_COVERAGE = 0.5
/** Оценка must-критерия на этом уровне или ниже — провал требования. */
export const MUST_FAIL_SCORE = 2

const THRESHOLDS: readonly [number, InterviewVerdict][] = [
  [80, 'strong_yes'], // STRONG_YES_MIN
  [65, 'yes'],
  [50, 'maybe'],
]

export function computeScore(
  criteria: readonly InterviewCriterion[],
  scores: readonly InterviewCriterionScore[],
): InterviewScore {
  const byId = new Map(scores.map((s) => [s.criterionId, s.score]))

  let totalWeight = 0
  let assessedWeight = 0
  let weighted = 0
  const failedMust: string[] = []
  const uncheckedMust: string[] = []

  for (const criterion of criteria) {
    totalWeight += criterion.weight
    const score = byId.get(criterion.id) ?? null
    if (score == null) {
      if (criterion.kind === 'must') uncheckedMust.push(criterion.name)
      continue
    }
    assessedWeight += criterion.weight
    // 1 → 0, 5 → 100: «1 из 5» — это ноль соответствия, а не 20%.
    weighted += criterion.weight * ((score - 1) / 4)
    if (criterion.kind === 'must' && score <= MUST_FAIL_SCORE) failedMust.push(criterion.name)
  }

  const coverage = totalWeight > 0 ? assessedWeight / totalWeight : 0
  const overall = assessedWeight > 0 ? Math.round((weighted / assessedWeight) * 100) : 0

  let verdict: InterviewVerdict = 'no'
  const borderline = isBorderline(overall)
  if (assessedWeight === 0 || coverage < MIN_COVERAGE) {
    verdict = 'insufficient_data'
  } else {
    verdict = THRESHOLDS.find(([min]) => overall >= min)?.[1] ?? 'no'
    // У порога вердикт выбирается осторожный: около 65 и 50 «под вопросом», около 80 - «скорее да».
    if (borderline) verdict = overall >= STRONG_YES_MIN - BORDERLINE_MARGIN ? 'yes' : 'maybe'
    // Высокий средний балл не перекрывает проваленное обязательное требование.
    if (failedMust.length > 0 && (verdict === 'strong_yes' || verdict === 'yes')) verdict = 'maybe'
    // «Однозначно да» нельзя сказать о кандидате, у которого обязательное не проверяли.
    if (uncheckedMust.length > 0 && verdict === 'strong_yes') verdict = 'yes'
  }

  return {
    overall,
    coverage: Math.round(coverage * 100) / 100,
    verdict,
    failedMust,
    uncheckedMust,
    borderline: verdict !== 'insufficient_data' && borderline,
  }
}

/**
 * Итог в нескольких баллах от порога - не вывод, а шум. Одна и та же расшифровка при
 * повторной оценке даёт разброс около ±5: 53, 61 и 64 при пороге «скорее да» 65, а до
 * правки промпта - 66 «да» и 55 «под вопросом». Удвоенная оценка сняла бы шум, но вдвое
 * дороже; честнее назвать такой итог пограничным.
 */
export const BORDERLINE_MARGIN = 3
const STRONG_YES_MIN = 80

export function isBorderline(overall: number): boolean {
  return THRESHOLDS.some(([min]) => Math.abs(overall - min) <= BORDERLINE_MARGIN)
}
