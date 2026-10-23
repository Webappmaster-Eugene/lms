import { markdownPlainText } from '@/lib/guide-markdown'

/** Инструкцию читают с остановками на действия — медленнее обычного текста. */
const WORDS_PER_MINUTE = 160
const DAY = 24 * 60 * 60 * 1000
/** Без явного срока гайд пересматривают через три месяца после проверки: налоги, цены и вакансии меняются быстрее. */
export const GUIDE_REVIEW_DAYS = 90
/** Столько дней после публикации непрочитанный гайд отмечен «Новое» в списке. */
export const GUIDE_NEW_DAYS = 30
/** За столько дней до срока гайд попадает в список «пора пересмотреть» в CMS. */
export const GUIDE_REVIEW_SOON_DAYS = 14

export const GUIDE_CATEGORIES = [
  { value: 'career', label: 'Карьера' },
  { value: 'ai', label: 'ИИ в работе' },
  { value: 'business', label: 'Свой бизнес' },
  { value: 'other', label: 'Другое' },
] as const

export type GuideCategory = (typeof GUIDE_CATEGORIES)[number]['value']

export function isGuideCategory(value: unknown): value is GuideCategory {
  return GUIDE_CATEGORIES.some((category) => category.value === value)
}

/** Категория из шапки файла: код (`ai`) или подпись (`ИИ в работе`) без учёта регистра. */
export function guideCategoryFromText(value: string): GuideCategory | null {
  const text = value.trim().toLowerCase()
  return GUIDE_CATEGORIES.find((category) => category.value === text || category.label.toLowerCase() === text)?.value ?? null
}

export function guideCategoryLabel(value: string | null | undefined): string | null {
  return GUIDE_CATEGORIES.find((category) => category.value === value)?.label ?? null
}

export function guideReadingMinutes(markdown: string | null | undefined): number {
  const words = markdown?.trim() ? markdownPlainText(markdown).split(/\s+/).filter(Boolean).length : 0
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

/** Срок пересмотра по умолчанию — через {@link GUIDE_REVIEW_DAYS} дней после проверки. */
export function defaultGuideReviewBy(reviewedAt: string | Date): string {
  return new Date(new Date(reviewedAt).getTime() + GUIDE_REVIEW_DAYS * DAY).toISOString()
}

/** Граница списка «пора пересмотреть»: срок прошёл или наступит в ближайшие {@link GUIDE_REVIEW_SOON_DAYS} дней. */
export function guideReviewHorizon(now = Date.now()): string {
  return new Date(now + GUIDE_REVIEW_SOON_DAYS * DAY).toISOString()
}

export type GuideReviewState = 'overdue' | 'soon' | 'ok'

export function guideReviewState(reviewBy: string | null | undefined, now = Date.now()): GuideReviewState | null {
  if (!reviewBy) return null
  const due = Date.parse(reviewBy)
  if (Number.isNaN(due)) return null
  if (due <= now) return 'overdue'
  return due - now <= GUIDE_REVIEW_SOON_DAYS * DAY ? 'soon' : 'ok'
}

/** «Новое» — опубликован недавно и ученик его ещё не открывал. */
export function guideIsNew(announcedAt: string | null | undefined, read: boolean, now = Date.now()): boolean {
  if (read || !announcedAt) return false
  const at = Date.parse(announcedAt)
  return !Number.isNaN(at) && now - at < GUIDE_NEW_DAYS * DAY
}
