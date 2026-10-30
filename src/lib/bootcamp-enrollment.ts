/**
 * Зачисление на буткемп из админки (решение владельца 30.10.2026): учётка и курс
 * методичек в LMS ставятся сразу, учётку и проект в GitLab заводит исполнитель в VM
 * GitLab. Токен root GitLab эту VM не покидает: исполнитель сам забирает задания из LMS.
 * Модуль общий для сервера и панели в CMS.
 */

export const BOOTCAMP_COURSE_PROJECT = 'bootcamp/course'
// Курс методичек в LMS: назначается каждому зачисленному. Тот же slug у импорта методичек.
export const BOOTCAMP_MANUALS_COURSE_SLUG = 'nodejs-bootcamp-manuals'
export const DEFAULT_STREAM_GROUP = 'nodejs-test'

export const ENROLLMENT_STATUSES = [
  { value: 'queued', label: 'Ждёт GitLab' },
  { value: 'running', label: 'Выполняется' },
  { value: 'done', label: 'Готово' },
  { value: 'failed', label: 'Ошибка' },
] as const
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number]['value']

/** Шаги по порядку. Первые два делает LMS при нажатии кнопки, остальные исполнитель в VM GitLab. */
export const ENROLLMENT_STEPS = [
  { key: 'lms_account', label: 'Учётка LMS и приглашение' },
  { key: 'lms_course', label: 'Курс методичек в LMS' },
  { key: 'gitlab_user', label: 'Учётка GitLab и письмо для пароля' },
  { key: 'gitlab_project', label: 'Проект ученика из bootcamp/course' },
  { key: 'gitlab_protect', label: 'Ветка main защищена, сливает наставник' },
  { key: 'gitlab_member', label: 'Роль Developer в своём проекте' },
  { key: 'gitlab_webhook', label: 'События проекта приходят в LMS' },
] as const
export type EnrollmentStepKey = (typeof ENROLLMENT_STEPS)[number]['key']
export const GITLAB_STEP_KEYS: readonly EnrollmentStepKey[] = ENROLLMENT_STEPS.map((step) => step.key).filter((key) => key.startsWith('gitlab_'))

export type EnrollmentStepState = 'pending' | 'done' | 'skipped' | 'failed'
export type EnrollmentStep = { key: EnrollmentStepKey, state: EnrollmentStepState, detail?: string, at?: string }

export type EnrollmentInput = {
  firstName: string
  lastName: string
  username: string
  group: string
  /** Конец дня по Москве, до которого открыт курс методичек; null - без срока. */
  accessUntil: string | null
}

export class EnrollmentInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
    this.name = 'EnrollmentInputError'
  }
}

// Правила логина GitLab плюс строчные буквы: логин становится путём проекта ученика.
const USERNAME = /^[a-z0-9][a-z0-9_.-]{0,58}[a-z0-9_-]$/
const GROUP = /^[a-z0-9][a-z0-9_.-]{0,98}[a-z0-9]$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export function usernameProblem(value: string): string | null {
  if (!USERNAME.test(value) || /\.(git|atom)$/.test(value)) return 'Логин GitLab: строчные латинские буквы, цифры, точка, дефис и подчёркивание, от 2 до 60 знаков'
  return null
}

function name(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > 100) throw new EnrollmentInputError(`${label}: от 1 до 100 знаков`)
  return text
}

export function parseEnrollmentInput(body: unknown, now = new Date()): EnrollmentInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new EnrollmentInputError('Ожидается объект JSON')
  const input = body as Record<string, unknown>
  const username = typeof input.username === 'string' ? input.username.trim() : ''
  const problem = usernameProblem(username)
  if (problem) throw new EnrollmentInputError(problem)
  const group = typeof input.group === 'string' ? input.group.trim() : ''
  if (!GROUP.test(group)) throw new EnrollmentInputError('Группа потока в GitLab: строчные латинские буквы, цифры, точка, дефис и подчёркивание')
  let accessUntil: string | null = null
  if (input.accessUntil !== undefined && input.accessUntil !== null && input.accessUntil !== '') {
    if (typeof input.accessUntil !== 'string' || !DATE.test(input.accessUntil)) throw new EnrollmentInputError('Срок доступа - дата ГГГГ-ММ-ДД или пусто')
    const end = new Date(`${input.accessUntil}T23:59:59.999+03:00`)
    if (!(end > now)) throw new EnrollmentInputError('Срок доступа уже прошёл')
    accessUntil = end.toISOString()
  }
  return { firstName: name(input.firstName, 'Имя'), lastName: name(input.lastName, 'Фамилия'), username, group, accessUntil }
}

/** Логин по умолчанию из почты: всё, что GitLab не примет, заменяется дефисом. */
export function suggestUsername(email: string): string {
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  const cleaned = local.replace(/[^a-z0-9_.-]+/g, '-').replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9_-]+$/, '').slice(0, 60)
  return usernameProblem(cleaned) ? '' : cleaned
}

/** Имя из формы заявки одной строкой: первое слово - имя, остальное - фамилия. */
export function splitName(full: string | null | undefined): { firstName: string, lastName: string } {
  const [first = '', ...rest] = (full ?? '').trim().split(/\s+/).filter(Boolean)
  return { firstName: first, lastName: rest.join(' ') }
}

export function initialSteps(): EnrollmentStep[] {
  return ENROLLMENT_STEPS.map(({ key }) => ({ key, state: 'pending' }))
}

/** Отчёт исполнителя заменяет только шаги GitLab: шаги LMS он не трогает. */
export function mergeSteps(current: EnrollmentStep[], reported: EnrollmentStep[]): EnrollmentStep[] {
  const byKey = new Map(reported.filter((step) => GITLAB_STEP_KEYS.includes(step.key)).map((step) => [step.key, step]))
  return ENROLLMENT_STEPS.map(({ key }) => byKey.get(key) ?? current.find((step) => step.key === key) ?? { key, state: 'pending' })
}

export function readSteps(value: unknown): EnrollmentStep[] {
  if (!Array.isArray(value)) return initialSteps()
  const states = new Set<EnrollmentStepState>(['pending', 'done', 'skipped', 'failed'])
  const steps = value.flatMap((item): EnrollmentStep[] => {
    if (!item || typeof item !== 'object') return []
    const { key, state, detail, at } = item as Record<string, unknown>
    if (!ENROLLMENT_STEPS.some((step) => step.key === key) || !states.has(state as EnrollmentStepState)) return []
    return [{
      key: key as EnrollmentStepKey,
      state: state as EnrollmentStepState,
      ...(typeof detail === 'string' && detail ? { detail: detail.slice(0, 500) } : {}),
      ...(typeof at === 'string' ? { at } : {}),
    }]
  })
  return ENROLLMENT_STEPS.map(({ key }) => steps.find((step) => step.key === key) ?? { key, state: 'pending' })
}

export const stepLabel = (key: EnrollmentStepKey) => ENROLLMENT_STEPS.find((step) => step.key === key)?.label ?? key
export const statusLabel = (status: string) => ENROLLMENT_STATUSES.find((item) => item.value === status)?.label ?? status
