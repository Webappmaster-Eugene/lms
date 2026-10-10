/**
 * Критерии оценки: откуда бы они ни пришли — от модели, из Mini App или из старой строки
 * базы — дальше идут только через normalizeCriteria. Это недоверенный ввод: модель
 * путает типы, вес присылает строкой, а форма в приложении может прислать пустое имя.
 */

import { MAX_INTERVIEW_CRITERIA } from '@/lib/interviews/analysis/constants'
import { sanitizeLine, sanitizeParagraph } from '@/lib/interviews/analysis/sanitize'
import type { InterviewCriterion, InterviewCriterionKind } from '@/lib/interviews/analysis/types'

const MAX_NAME_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 500
const ID_RE = /^[a-z0-9_-]{1,24}$/

const KIND_ALIASES: Record<string, InterviewCriterionKind> = {
  must: 'must',
  required: 'must',
  'must-have': 'must',
  обязательно: 'must',
  nice: 'nice',
  'nice-to-have': 'nice',
  optional: 'nice',
  желательно: 'nice',
  soft: 'soft',
  'soft skill': 'soft',
  'soft skills': 'soft',
}

function asText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max * 2) : ''
}

function toKind(value: unknown): InterviewCriterionKind {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return KIND_ALIASES[key] ?? 'nice'
}

function toWeight(value: unknown): 1 | 2 | 3 {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN
  if (!Number.isFinite(n)) return 2
  return Math.min(3, Math.max(1, Math.round(n))) as 1 | 2 | 3
}

/** Принимает и голый массив, и `{ criteria: [...] }` — модель отвечает то так, то так. */
export function normalizeCriteria(raw: unknown): InterviewCriterion[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { criteria?: unknown }).criteria)
      ? (raw as { criteria: unknown[] }).criteria
      : []

  const out: InterviewCriterion[] = []
  const seenNames = new Set<string>()
  const usedIds = new Set<string>()

  for (const item of list) {
    if (out.length >= MAX_INTERVIEW_CRITERIA) break
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>

    // Название и описание попадают в отчёт для HR - те же правила текста, что для оценки.
    const name = sanitizeLine(asText(record.name, MAX_NAME_LENGTH), MAX_NAME_LENGTH)
    if (!name) continue
    const nameKey = name.toLowerCase().replace(/ё/g, 'е')
    if (seenNames.has(nameKey)) continue
    seenNames.add(nameKey)

    const proposedId = typeof record.id === 'string' ? record.id.trim().toLowerCase() : ''
    // id сохраняется, если он корректен и свободен: по нему старые оценки находят свой критерий.
    const id = ID_RE.test(proposedId) && !usedIds.has(proposedId) ? proposedId : ''

    out.push({
      id,
      name,
      description: sanitizeParagraph(asText(record.description, MAX_DESCRIPTION_LENGTH), MAX_DESCRIPTION_LENGTH),
      kind: toKind(record.kind),
      weight: toWeight(record.weight),
    })
    if (id) usedIds.add(id)
  }

  let next = 1
  for (const criterion of out) {
    if (criterion.id) continue
    while (usedIds.has(`c${next}`)) next++
    criterion.id = `c${next}`
    usedIds.add(criterion.id)
  }

  return out
}
