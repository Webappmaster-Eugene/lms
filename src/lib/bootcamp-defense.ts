import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { BOOTCAMP_GITLAB_ORIGIN } from '@/lib/site-links'

export const defenseLabels = { revise: 'Требуется доработка', passed: 'Защита пройдена' } as const
export type DefenseOutcome = keyof typeof defenseLabels
export type BootcampDefense = { outcome: DefenseOutcome; url: string; recordedAt: string }

export function webLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

export function parseDefense(input: unknown) {
  if (!input || typeof input !== 'object') throw new EnrollmentInputError('Заполните результат и ссылку на разбор')
  const { outcome, url, revision } = input as Record<string, unknown>
  if (outcome !== 'passed' && outcome !== 'revise') throw new EnrollmentInputError('Выберите результат защиты')
  const link = webLink(url)
  if (!link || link.length > 1000) throw new EnrollmentInputError('Укажите полную ссылку на разбор, начинающуюся с https://')
  if (typeof revision !== 'string' || (revision && !Number.isFinite(Date.parse(revision)))) throw new EnrollmentInputError('Обновите карточку защиты')
  return { outcome, url: link, revision } as const
}

export function ownedProjectLink(value: unknown, group: string, project: string) {
  const link = webLink(value)
  if (!link) return null
  const url = new URL(link)
  return url.origin === BOOTCAMP_GITLAB_ORIGIN && !url.search && !url.hash && url.pathname.replace(/\/$/, '') === `/${group}/${project}` ? link : null
}
