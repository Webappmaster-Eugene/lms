export type InterviewCriterionKind = 'must' | 'nice' | 'soft'

export interface InterviewCriterion {
  /** Стабильный короткий id: по нему отчёт ссылается на критерий. */
  id: string
  name: string
  description: string
  kind: InterviewCriterionKind
  /** 1 — второстепенный, 3 — ключевой. */
  weight: 1 | 2 | 3
}

export type InterviewEvaluationStatus = 'draft' | 'transcribing' | 'evaluating' | 'completed' | 'failed'

export type InterviewVerdict = 'strong_yes' | 'yes' | 'maybe' | 'no' | 'insufficient_data'

/** Шкала владельца от «noob» до «master»; порядок — в INTERVIEW_GRADES. */
export type InterviewGrade =
  | 'noob'
  | 'intern'
  | 'junior'
  | 'junior_plus'
  | 'junior_plus_plus'
  | 'middle_minus'
  | 'middle'
  | 'middle_plus'
  | 'middle_plus_plus'
  | 'senior'
  | 'senior_plus'
  | 'staff'
  | 'master'

export type InterviewGradeConfidence = 'low' | 'medium' | 'high'

/**
 * Уровень инженера по тому, что он показал на собеседовании, — отдельно от соответствия
 * вакансии: крепкий middle может не подойти роли, где главное — Next.js, которого он не знает.
 */
/**
 * Кусок записи, который к собеседованию не относится: ролики после конца созвона, чужой
 * разговор, музыка. На записи 23.09 из 2 ч 15 мин собеседованием были первые 37 минут.
 */
export interface InterviewExtraneousSegment {
  fromSec: number
  toSec: number
  note: string
}

export interface InterviewGradeAssessment {
  level: InterviewGrade
  confidence: InterviewGradeConfidence
  /** Почему этот уровень, а не соседний: что показал и чего не хватило до следующего. */
  rationale: string
}

export interface InterviewEvidence {
  quote: string
  /** Таймкод реплики из расшифровки, "ЧЧ:ММ:СС", если модель его привела. */
  timestamp: string | null
  /** Цитата действительно нашлась в расшифровке. Неподтверждённые не выдаются за доказательство. */
  verified: boolean
}

export interface InterviewCriterionScore {
  criterionId: string
  /** null — тема на собеседовании не затрагивалась, оценивать нечего. */
  score: 1 | 2 | 3 | 4 | 5 | null
  comment: string
  evidence: InterviewEvidence[]
}

export type InterviewRiskSeverity = 'low' | 'medium' | 'high'

export interface InterviewRisk {
  title: string
  severity: InterviewRiskSeverity
  detail: string
}

export type InterviewResumeClaimStatus = 'confirmed' | 'contradicted' | 'not_discussed'

export interface InterviewResumeClaim {
  claim: string
  status: InterviewResumeClaimStatus
  note: string
}

export interface InterviewCommunication {
  clarity: number | null
  confidence: number | null
  structure: number | null
  comment: string
}

export interface InterviewReport {
  /** Метка спикера кандидата в расшифровке; null, если модель не смогла уверенно определить. */
  candidateSpeaker: string | null
  hrSummary: string
  /** Нет у отчётов до появления грейда и когда по записи уровень не определить. */
  grade?: InterviewGradeAssessment | null
  /** Куски записи не про это собеседование; нет у отчётов до появления поля. */
  extraneous?: InterviewExtraneousSegment[]
  criteria: InterviewCriterionScore[]
  communication: InterviewCommunication
  resumeCheck: InterviewResumeClaim[]
  strengths: string[]
  risks: InterviewRisk[]
  growthAreas: string[]
  openQuestions: string[]
  limitations: string[]
}

export interface InterviewScore {
  /** 0–100, средневзвешенное по оценённым критериям. */
  overall: number
  /** Доля веса критериев, которые удалось оценить, 0–1. */
  coverage: number
  verdict: InterviewVerdict
  /** Проваленные must-критерии — причина, по которой вердикт ограничен. */
  failedMust: string[]
  /** Обязательные критерии, о которых на собеседовании не говорили: их надо проверить отдельно. */
  uncheckedMust: string[]
  /** Итог в нескольких баллах от порога вердикта: при переоценке может оказаться по другую сторону. */
  borderline: boolean
}
