/**
 * Разбор ответа модели на оценку собеседования.
 *
 * Ответ — недоверенный ввод. Модель выдумывает id критериев, ставит «4.5» или «высокий»
 * вместо числа, называет кандидата спикером, которого в расшифровке нет, и цитирует то,
 * чего человек не говорил. Всё это отсекается здесь, до того как попасть в отчёт для HR:
 * цитата, которой нет в расшифровке, помечается неподтверждённой, а не выдаётся за
 * доказательство.
 */

import { extractSpeakers, formatTimestamp, lastTimestampSec, parseCue } from '@/lib/interviews/analysis/meeting-transcript'
import { InterviewError } from '@/lib/interviews/analysis/errors'
import { normalizeDashes, sanitizeLine, sanitizeParagraph, stripEmoji } from '@/lib/interviews/analysis/sanitize'
import { INTERVIEW_GRADES } from '@/lib/interviews/analysis/constants'
import type {
  InterviewCommunication,
  InterviewCriterion,
  InterviewCriterionScore,
  InterviewEvidence,
  InterviewExtraneousSegment,
  InterviewGradeAssessment,
  InterviewGradeConfidence,
  InterviewReport,
  InterviewResumeClaim,
  InterviewResumeClaimStatus,
  InterviewRisk,
  InterviewRiskSeverity,
} from '@/lib/interviews/analysis/types'

const MAX_LIST_ITEMS = 10
const MAX_ITEM_LENGTH = 500
const MAX_EVIDENCE = 4
const MAX_QUOTE_LENGTH = 400
/** Слишком короткий кусок («да», «конечно») находится в любой расшифровке и ничего не доказывает. */
const MIN_QUOTE_SEGMENT = 12

const RISK_SEVERITIES: readonly InterviewRiskSeverity[] = ['low', 'medium', 'high']
const CLAIM_STATUSES: readonly InterviewResumeClaimStatus[] = ['confirmed', 'contradicted', 'not_discussed']

function asText(value: unknown, max = MAX_ITEM_LENGTH): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * Всё, что модель пишет для HR, проходит те же правила текста, что слайды презентаций:
 * без эмодзи, длинных тире, разметки и вводных штампов. Промпт просит о том же, но модель
 * нарушает это достаточно часто, чтобы документ не мог на него полагаться.
 */
function prose(value: unknown, max: number): string {
  return sanitizeParagraph(asText(value, max * 2), max)
}

function line(value: unknown, max: number): string {
  return sanitizeLine(asText(value, max * 2), max)
}

function asStringList(value: unknown): string[] {
  return asList(value)
    .map((item) => line(item, MAX_ITEM_LENGTH))
    .filter((item) => item.length > 0)
    .slice(0, MAX_LIST_ITEMS)
}

export function toScore(value: unknown): 1 | 2 | 3 | 4 | 5 | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  return rounded >= 1 && rounded <= 5 ? (rounded as 1 | 2 | 3 | 4 | 5) : null
}

function toTimestamp(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().replace(/^\[|\]$/g, '') : ''
  const match = /^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/.exec(text)
  if (!match) return null
  const [, a, b, c] = match
  const pad = (s: string): string => s.padStart(2, '0')
  return c === undefined ? `00:${pad(a)}:${b}` : `${pad(a)}:${b}:${c}`
}

/**
 * Междометия, которые модель при цитировании молча выбрасывает. На настоящем собеседовании
 * «Vite он позволяет, SSG рендерить» не нашлось в «Vite он позволяет, э, SSG рендерить».
 * Убираются с обеих сторон, так что подтверждение от этого не становится мягче по смыслу.
 */
const FILLERS = new Set(['э', 'ээ', 'эээ', 'эм', 'эмм', 'мм', 'ммм', 'хм', 'хмм', 'ну', 'а'])

/** Регистр, ё/е, пунктуация, пробелы и междометия не должны решать, подтверждена ли цитата. */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((word) => word.length > 0 && !FILLERS.has(word))
}

/** Слова реплик без таймкодов и имён — с началом каждой реплики, чтобы цитата знала своё время. */
export interface SpeechIndex {
  words: string[]
  cues: { start: number; timestamp: string }[]
}

export function buildSpeechIndex(transcript: string): SpeechIndex {
  const words: string[] = []
  const cues: SpeechIndex['cues'] = []
  for (const line of transcript.split('\n')) {
    const cue = parseCue(line)
    const lineWords = normalizeWords(cue ? cue.text : line)
    if (lineWords.length === 0) continue
    if (cue) cues.push({ start: words.length, timestamp: formatTimestamp(cue.atSec) })
    words.push(...lineWords)
  }
  return { words, cues }
}

function timestampAt(index: SpeechIndex, wordIndex: number): string | null {
  let found: string | null = null
  for (const cue of index.cues) {
    if (cue.start > wordIndex) break
    found = cue.timestamp
  }
  return found
}

/** Меньше слов — кусок («да, конечно») найдётся в любой расшифровке и ничего не докажет. */
const MIN_SEGMENT_WORDS = 3

/**
 * Где в расшифровке начинается кусок цитаты, если его слова идут там по порядку.
 *
 * Внутри куска допускаются лишние слова расшифровки: модель, цитируя, выбрасывает вставки
 * («обеспечить нам, а, быстроту, э, там первой загрузки» → «обеспечить нам быстроту первой
 * загрузки») и заикания («с с UI»). Допуск невелик — треть длины куска, — поэтому
 * выдуманная фраза из знакомых слов всё равно не соберётся.
 */
function locateSegment(words: readonly string[], segment: readonly string[], from: number): { start: number; end: number } | null {
  const budget = Math.max(2, Math.ceil(segment.length * 0.3))
  for (let start = from; start < words.length; start++) {
    if (words[start] !== segment[0]) continue
    let matched = 1
    let gaps = 0
    let k = start + 1
    while (matched < segment.length && k < words.length) {
      if (words[k] === segment[matched]) {
        matched++
      } else if (++gaps > budget) {
        break
      }
      k++
    }
    if (matched === segment.length) return { start, end: k }
  }
  return null
}

/**
 * Модель сокращает длинные реплики многоточием, поэтому цитата режется по нему, и каждый
 * содержательный кусок должен найтись в расшифровке — по порядку.
 *
 * Возвращает таймкод реплики, где цитата начинается, или null, если цитаты нет. Таймкод
 * берётся из расшифровки, а не у модели: на реальном собеседовании модель приписала
 * цитатам «19:00:00» и «21:37:00» при длине записи полтора часа.
 */
export function findQuote(quote: string, index: SpeechIndex): { timestamp: string | null } | null {
  const segments = quote
    .split(/\.{3}|…/)
    .map(normalizeWords)
    .filter((segment) => segment.length >= MIN_SEGMENT_WORDS && segment.join(' ').length >= MIN_QUOTE_SEGMENT)
  if (segments.length === 0) return null

  let from = 0
  let firstAt = -1
  for (const segment of segments) {
    const found = locateSegment(index.words, segment, from)
    if (!found) return null
    if (firstAt < 0) firstAt = found.start
    from = found.end
  }
  return { timestamp: timestampAt(index, firstAt) }
}

function parseEvidence(value: unknown, index: SpeechIndex): InterviewEvidence[] {
  const out: InterviewEvidence[] = []
  for (const item of asList(value)) {
    if (out.length >= MAX_EVIDENCE) break
    const record = typeof item === 'string' ? { quote: item } : (item as Record<string, unknown> | null)
    if (!record || typeof record !== 'object') continue
    const quote = asText(record.quote, MAX_QUOTE_LENGTH)
    if (!quote) continue
    const found = findQuote(quote, index)
    out.push({
      // Сверка идёт по исходной цитате, а в отчёт она попадает уже без длинных тире и эмодзи.
      quote: normalizeDashes(stripEmoji(quote)).trim(),
      timestamp: found ? found.timestamp : toTimestamp(record.timestamp),
      verified: found !== null,
    })
  }
  return out
}

function parseCriteriaScores(
  value: unknown,
  criteria: readonly InterviewCriterion[],
  index: SpeechIndex,
): InterviewCriterionScore[] {
  const known = new Set(criteria.map((c) => c.id))
  const parsed = new Map<string, InterviewCriterionScore>()

  for (const item of asList(value)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const id = asText(record.criterionId ?? record.id, 40).toLowerCase()
    if (!known.has(id) || parsed.has(id)) continue
    parsed.set(id, {
      criterionId: id,
      score: toScore(record.score),
      comment: prose(record.comment, 800),
      evidence: parseEvidence(record.evidence, index),
    })
  }

  // Каждый критерий вакансии присутствует в отчёте, даже если модель о нём промолчала:
  // молчание — это «не оценивалось», а не пропавшая строка таблицы.
  return criteria.map(
    (criterion) =>
      parsed.get(criterion.id) ?? {
        criterionId: criterion.id,
        score: null,
        comment: 'Тема на собеседовании не затрагивалась.',
        evidence: [],
      },
  )
}

function parseCommunication(value: unknown): InterviewCommunication {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    clarity: toScore(record.clarity),
    confidence: toScore(record.confidence),
    structure: toScore(record.structure),
    comment: prose(record.comment, 800),
  }
}

function parseRisks(value: unknown): InterviewRisk[] {
  const out: InterviewRisk[] = []
  for (const item of asList(value)) {
    if (out.length >= MAX_LIST_ITEMS) break
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const title = line(record.title, 200)
    if (!title) continue
    const severity = asText(record.severity, 10).toLowerCase() as InterviewRiskSeverity
    out.push({
      title,
      severity: RISK_SEVERITIES.includes(severity) ? severity : 'medium',
      detail: prose(record.detail, MAX_ITEM_LENGTH),
    })
  }
  return out
}

function parseResumeCheck(value: unknown): InterviewResumeClaim[] {
  const out: InterviewResumeClaim[] = []
  for (const item of asList(value)) {
    if (out.length >= 15) break
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const claim = line(record.claim, 300)
    if (!claim) continue
    const status = asText(record.status, 20).toLowerCase() as InterviewResumeClaimStatus
    out.push({
      claim,
      status: CLAIM_STATUSES.includes(status) ? status : 'not_discussed',
      note: prose(record.note, MAX_ITEM_LENGTH),
    })
  }
  return out
}

const GRADE_CONFIDENCES: readonly InterviewGradeConfidence[] = ['low', 'medium', 'high']

/** Ключ сравнения: «Middle −», «middle-» и «middle_minus» дают одно и то же. */
function gradeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[−‒-―]/g, '-')
    .replace(/\s+/g, '')
    .replace(/_plus/g, '+')
    .replace(/_minus/g, '-')
}

/** Уровень вне шкалы — не догадка, а его отсутствие: отчёт покажет «не определён». */
export function parseGrade(value: unknown): InterviewGradeAssessment | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const key = gradeKey(asText(record.level, 30))
  const grade = INTERVIEW_GRADES.find((g) => g.label === key)
  if (!grade) return null
  const confidence = asText(record.confidence, 10).toLowerCase() as InterviewGradeConfidence
  return {
    level: grade.value,
    // Без явной уверенности уровень не выдаётся за твёрдый.
    confidence: GRADE_CONFIDENCES.includes(confidence) ? confidence : 'low',
    rationale: prose(record.rationale, 800),
  }
}

/** Короче этого посторонний кусок не показывается: отвлечься на минуту - часть любого созвона. */
const MIN_EXTRANEOUS_SEC = 60

function clockSec(value: unknown): number | null {
  const match = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/.exec(asText(value, 12))
  if (!match) return null
  const [, a, b, c] = match
  return c === undefined ? Number(a) * 60 + Number(b) : Number(a) * 3600 + Number(b) * 60 + Number(c)
}

/**
 * Посторонние куски записи. Границы - от модели, поэтому сверяются с расшифровкой: конец
 * не дальше последней реплики, пересекающиеся куски сливаются, минутные отвлечения
 * отбрасываются. Иначе одна ошибка в таймкоде дала бы «3 часа постороннего» в часовой записи.
 */
export function parseExtraneous(value: unknown, transcript: string): InterviewExtraneousSegment[] {
  const end = lastTimestampSec(transcript)
  const segments: InterviewExtraneousSegment[] = []
  for (const item of asList(value)) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const from = clockSec(record.from)
    let to = clockSec(record.to)
    if (from == null || to == null) continue
    if (end != null) to = Math.min(to, end)
    if (to - from < MIN_EXTRANEOUS_SEC) continue
    segments.push({ fromSec: from, toSec: to, note: line(record.note, 200) })
  }
  segments.sort((a, b) => a.fromSec - b.fromSec)
  const merged: InterviewExtraneousSegment[] = []
  for (const segment of segments) {
    const last = merged[merged.length - 1]
    // Полминуты между кусками посторонних роликов - тот же посторонний кусок, а не собеседование.
    if (last && segment.fromSec - last.toSec < MIN_EXTRANEOUS_SEC) {
      last.toSec = Math.max(last.toSec, segment.toSec)
      if (!last.note) last.note = segment.note
    } else {
      merged.push({ ...segment })
    }
  }
  return merged.slice(0, MAX_LIST_ITEMS)
}

/** Метка сверяется с расшифровкой без учёта регистра и возвращается в её написании. */
function resolveSpeaker(value: unknown, transcript: string): string | null {
  const proposed = asText(value, 60).toLowerCase()
  if (!proposed) return null
  return extractSpeakers(transcript).find((speaker) => speaker.toLowerCase() === proposed) ?? null
}

export function parseReport(
  raw: Record<string, unknown>,
  criteria: readonly InterviewCriterion[],
  transcript: string,
): InterviewReport {
  const hrSummary = prose(raw.hrSummary, 2000)
  if (!hrSummary) {
    throw new InterviewError('Модель не вернула итог по кандидату. Попробуйте переоценить')
  }

  const index = buildSpeechIndex(transcript)
  const candidateSpeaker = resolveSpeaker(raw.candidateSpeaker, transcript)
  const limitations = asStringList(raw.limitations)
  if (!candidateSpeaker) {
    limitations.unshift('Не удалось уверенно определить, какой из спикеров кандидат — проверьте цитаты.')
  }

  return {
    candidateSpeaker,
    hrSummary,
    grade: parseGrade(raw.grade),
    criteria: parseCriteriaScores(raw.criteria, criteria, index),
    communication: parseCommunication(raw.communication),
    resumeCheck: parseResumeCheck(raw.resumeCheck),
    strengths: asStringList(raw.strengths),
    risks: parseRisks(raw.risks),
    growthAreas: asStringList(raw.growthAreas),
    openQuestions: asStringList(raw.openQuestions),
    limitations: limitations.slice(0, MAX_LIST_ITEMS),
    extraneous: parseExtraneous(raw.extraneous, transcript),
  }
}
