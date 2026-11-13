/**
 * Учёба буткемпа по неделям: неделя из ветки и вердикта бота, состояние сдачи, отставание
 * от плана потока. Модуль чистый: его используют обработчик вебхука, сервер экрана и сам экран.
 */

export const BOOTCAMP_PROGRAM_WEEKS = 20
/** Ответ на сдачу - в течение 3 дней (документ 13 плана буткемпа). */
export const REVIEW_SLA_DAYS = 3
const DAY_MS = 86_400_000

export const submissionVerdicts = ['passed', 'failed', 'not-run', 'infra'] as const
export type SubmissionVerdict = (typeof submissionVerdicts)[number]

/** Сдача недели - MR из ветки week-NN; ветка materials-week-NN приносит материалы курса и сдачей не считается. */
export function weekFromBranch(branch: string | null | undefined): number | null {
  const match = /^week-(\d{1,2})$/.exec((branch ?? '').trim())
  if (!match) return null
  const week = Number(match[1])
  return week >= 1 && week <= BOOTCAMP_PROGRAM_WEEKS ? week : null
}

const HEADLINES: [RegExp, SubmissionVerdict][] = [
  [/не выполнена целиком/, 'not-run'],
  [/не завершилась из-за сбоя/, 'infra'],
  [/не пройдена/, 'failed'],
  [/пройдена/, 'passed'],
]

export type ParsedVerdict = { week: number; verdict: SubmissionVerdict; checksPassed: number | null; checksTotal: number | null; attempt: number | null }

/**
 * Комментарий бота проверки (reference/ops/grading/lib/summary.ts): скрытая метка
 * `<!-- grader:NN:sha -->` и заголовок «Доверенная проверка: неделя N - пройдена».
 * Входное задание (метка grader:entry) и чужие комментарии - null.
 */
export function parseVerdict(note: string): ParsedVerdict | null {
  const marker = /<!--\s*grader:(\d{1,2}):[0-9a-f]{7,64}\s*-->/i.exec(note)
  // Прежний бот разделял неделю и итог длинным тире, нынешний - дефисом: итог ищем по словам.
  const headline = /\*\*Доверенная проверка: ([^*]+)\*\*/.exec(note)?.[1]
  if (!marker || !headline) return null
  const week = Number(marker[1])
  if (week < 1 || week > BOOTCAMP_PROGRAM_WEEKS) return null
  const verdict = HEADLINES.find(([pattern]) => pattern.test(headline))?.[1]
  if (!verdict) return null
  const checks = /Прошло проверок: (\d+) из (\d+)/.exec(note)
  const attempt = /попытка (\d+)/.exec(note)
  return { week, verdict, checksPassed: checks ? Number(checks[1]) : null, checksTotal: checks ? Number(checks[2]) : null, attempt: attempt ? Number(attempt[1]) : null }
}

export type SubmissionFacts = {
  mrIid: number
  mrUrl: string | null
  openedAt: string | null
  lastCommitAt: string | null
  pipelineStatus: 'success' | 'failed' | null
  pipelineAt: string | null
  verdict: SubmissionVerdict | null
  checksPassed: number | null
  checksTotal: number | null
  verdictAt: string | null
  mergedAt: string | null
  closedAt: string | null
}

export type WeekState = 'none' | 'open' | 'checking' | 'ci-failed' | 'failed-check' | 'review' | 'accepted' | 'closed'
export type WeekCell = { week: number; state: WeekState; since: string | null; mrUrl: string | null; overdue: boolean; dueAt: string | null; late: boolean; checks: string | null }

const time = (value: string | null) => value ? Date.parse(value) : Number.NEGATIVE_INFINITY

/** Состояние одного MR: что сейчас ждёт ученик или наставник. */
function submissionState(item: SubmissionFacts): { state: WeekState; since: string | null } {
  if (item.mergedAt) return { state: 'accepted', since: item.mergedAt }
  if (item.closedAt && time(item.closedAt) >= time(item.openedAt)) return { state: 'closed', since: item.closedAt }
  const changed = time(item.lastCommitAt)
  if (item.verdict && time(item.verdictAt) >= changed) {
    if (item.verdict === 'passed') return { state: 'review', since: item.verdictAt }
    if (item.verdict === 'infra') return { state: 'checking', since: item.verdictAt }
    return { state: 'failed-check', since: item.verdictAt }
  }
  if (item.pipelineStatus === 'failed' && time(item.pipelineAt) >= changed) return { state: 'ci-failed', since: item.pipelineAt }
  return { state: item.lastCommitAt ? 'checking' : 'open', since: item.lastCommitAt ?? item.openedAt }
}

/**
 * Неделя по всем её MR: слитый MR принимает неделю; иначе важен последний открытый, а закрытые
 * без слияния показываются, только если открытых нет.
 */
export function weekCell(week: number, items: readonly SubmissionFacts[], dueAt: string | null, now: number = Date.now()): WeekCell {
  const due = dueAt ? Date.parse(dueAt) : null
  const merged = items.filter((item) => item.mergedAt).sort((left, right) => time(left.mergedAt) - time(right.mergedAt))[0]
  const open = items.filter((item) => !item.mergedAt && !(item.closedAt && time(item.closedAt) >= time(item.openedAt))).sort((left, right) => time(right.openedAt) - time(left.openedAt) || right.mrIid - left.mrIid)[0]
  const chosen = merged ?? open ?? [...items].sort((left, right) => time(right.closedAt) - time(left.closedAt))[0]
  if (!chosen) return { week, state: 'none', since: null, mrUrl: null, overdue: false, dueAt, late: due !== null && due <= now, checks: null }
  const { state, since } = submissionState(chosen)
  const accepted = state === 'accepted'
  return {
    week, state, since, mrUrl: chosen.mrUrl, dueAt,
    overdue: state === 'review' && since !== null && now - Date.parse(since) > REVIEW_SLA_DAYS * DAY_MS,
    late: due !== null && (accepted ? Date.parse(since ?? '') > due : due <= now),
    checks: chosen.checksTotal !== null && chosen.checksPassed !== null ? `${chosen.checksPassed} из ${chosen.checksTotal}` : null,
  }
}

/** Сколько недель уже должно быть сдано и сколько из них не принято. */
export function scheduleLag(cells: readonly WeekCell[], now: number = Date.now()): { planned: number; accepted: number; lag: number } {
  const due = cells.filter((cell) => cell.dueAt !== null && Date.parse(cell.dueAt) <= now)
  return {
    planned: due.length,
    accepted: cells.filter((cell) => cell.state === 'accepted').length,
    lag: due.filter((cell) => cell.state !== 'accepted').length,
  }
}

const moscowMidnight = (day: string) => new Date(Date.parse(`${day}T00:00:00+03:00`)).toISOString()

/**
 * Первый поток (документ 13 плана, решение владельца 09.11.2026): срок пары недель - начало
 * следующей пары встреч; у праздничных 6-7 марта срок +1 день; защиты - до 14 мая.
 */
export const FIRST_STREAM = {
  title: 'Поток 1, февраль 2027',
  startsAt: moscowMidnight('2027-02-13'),
  weeks: ([
    [1, '2027-02-21'], [2, '2027-02-21'], [3, '2027-02-27'], [4, '2027-02-27'], [5, '2027-03-06'], [6, '2027-03-06'],
    [7, '2027-03-14'], [8, '2027-03-14'], [9, '2027-03-20'], [10, '2027-03-20'], [11, '2027-03-27'], [12, '2027-03-27'],
    [13, '2027-04-10'], [14, '2027-04-10'], [15, '2027-04-17'], [16, '2027-04-17'], [17, '2027-04-24'], [18, '2027-05-05'],
    [19, '2027-05-05'], [20, '2027-05-15'],
  ] as const).map(([week, day]) => ({ week, dueAt: moscowMidnight(day) })),
}

export const WEEK_STATE_LABELS: Record<WeekState, string> = {
  none: 'не начата',
  open: 'MR открыт',
  checking: 'на проверке',
  'ci-failed': 'CI упал',
  'failed-check': 'проверка не пройдена',
  review: 'ждёт ревью',
  accepted: 'принята',
  closed: 'MR закрыт',
}

export type ProgressStudent = {
  enrollmentId: number
  userId: number | null
  title: string
  gitlabUsername: string
  projectUrl: string | null
  isTest: boolean
  frozen: boolean
  lastGitlabAt: string | null
  lastLmsAt: string | null
  manuals: { done: number; total: number } | null
  planned: number
  accepted: number
  lag: number
  weeks: WeekCell[]
}

export type BootcampProgressReport = {
  streams: { id: number; title: string }[]
  stream: { id: number; title: string; program: string; startsAt: string; gitlabGroup: string } | null
  summary: { students: number; onPlan: number; lagOne: number; lagMore: number; waitingReview: number; overdueReview: number; medianReviewHours: number | null }
  students: ProgressStudent[]
}
