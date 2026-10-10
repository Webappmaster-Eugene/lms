import { TRAINER_COMPANIES, type TrainerCompany } from './constants'

export const INTERVIEW_FORMATS = ['livecoding', 'algorithms', 'debugging', 'language', 'frontend', 'type-system'] as const
export type InterviewFormat = (typeof INTERVIEW_FORMATS)[number]
export const INTERVIEW_FORMAT_LABELS: Record<InterviewFormat, string> = {
  livecoding: 'Лайвкодинг', algorithms: 'Алгоритмы', debugging: 'Поиск ошибок',
  language: 'Особенности языка', frontend: 'Интерфейс React / HTML', 'type-system': 'Типы TypeScript',
}
export const INTERVIEW_FORMAT_OPTIONS = INTERVIEW_FORMATS.map((value) => ({ value, label: INTERVIEW_FORMAT_LABELS[value] }))
export const EVIDENCE_KINDS = ['official', 'candidate-report', 'preparation', 'unverified'] as const
export type CompanyEvidence = {
  company: TrainerCompany
  kind: (typeof EVIDENCE_KINDS)[number]
  url?: string
  note: string
  checkedAt: string
}
export const EVIDENCE_LABELS: Record<CompanyEvidence['kind'], string> = {
  official: 'Официальный пример', 'candidate-report': 'Рассказ кандидата',
  preparation: 'Подготовка по рекомендациям компании', unverified: 'Источник не подтверждён',
}

export function safeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2000) return undefined
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}

function isEvidence(value: unknown): value is CompanyEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return TRAINER_COMPANIES.some((company) => company === row.company)
    && EVIDENCE_KINDS.some((kind) => kind === row.kind)
    && typeof row.note === 'string' && row.note.trim().length > 0 && row.note.length <= 2000
    && typeof row.checkedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.checkedAt)
    && Number.isFinite(Date.parse(row.checkedAt)) && new Date(row.checkedAt).toISOString().slice(0, 10) === row.checkedAt
    && (row.kind === 'unverified' ? row.url === undefined || safeSourceUrl(row.url) !== undefined : safeSourceUrl(row.url) !== undefined)
}

/** Stored JSON is also checked on read before it becomes an external link. */
export function companyEvidence(value: unknown): CompanyEvidence[] {
  return Array.isArray(value) ? value.filter(isEvidence).slice(0, 20) : []
}

export function validateCompanyEvidence(value: unknown): true | string {
  if (value == null) return true
  if (!Array.isArray(value) || value.length > 20 || value.some((row) => !isEvidence(row))) {
    return 'Укажите до 20 источников: компания, тип подтверждения, ссылка, пояснение и дата проверки'
  }
  const companies = value.map((row) => row.company)
  if (new Set(companies).size !== companies.length) return 'Для каждой компании оставьте одно наиболее надёжное подтверждение'
  return true
}
