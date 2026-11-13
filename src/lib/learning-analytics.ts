/**
 * Общие правила аналитики обучения: день по Москве, «нет активности», периоды и подписи.
 * Модуль чистый: его используют и сервер, и экран администратора.
 */

const DAY_MS = 86_400_000
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

/** Ученик без активности столько дней считается пропавшим (решение владельца 13.11.2026). */
export const INACTIVE_DAYS = 14

export const ANALYTICS_PERIODS = [7, 30, 90] as const
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number]
export const parsePeriod = (value: unknown): AnalyticsPeriod => ANALYTICS_PERIODS.find((period) => String(period) === String(value)) ?? 30

/** Календарный день по Москве: сводка и «активные дни» считаются по нему, а не по UTC. */
export function moscowDay(value: string | number | Date = Date.now()): string {
  return new Date(new Date(value).getTime() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10)
}

/** Первый день периода из N последних дней, включая сегодняшний. */
export function periodStartDay(period: number, now: number = Date.now()): string {
  return moscowDay(now - (period - 1) * DAY_MS)
}

/** Строка сводки - ученик, день и курс; у дня без курса свой ключ, иначе NULL не дал бы уникальности. */
export function activityDayKey(userId: number, day: string, courseId: number | null): string {
  return `${userId}:${day}:${courseId ?? '-'}`
}

/** Понедельники последних N недель по Москве, от ранней к поздней. */
export function weekStarts(count: number, now: number = Date.now()): string[] {
  const today = Date.parse(`${moscowDay(now)}T00:00:00.000Z`)
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY_MS
  return Array.from({ length: count }, (_, index) => new Date(monday - (count - 1 - index) * 7 * DAY_MS).toISOString().slice(0, 10))
}

/** Сколько полных дней прошло с момента; null - момента нет. */
export function daysSince(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / DAY_MS)) : null
}

export type StudentState = 'learning' | 'inactive' | 'frozen' | 'disabled'

/**
 * «Нет активности» - не тестовый, не отключённый и не замороженный ученик, у которого с последней
 * активности прошло 14 дней. Кто ни разу не входил, считается от создания учётки.
 */
export function studentState(student: { isActive: boolean; frozen: boolean; lastActivityAt: string | null; createdAt: string }, now: number = Date.now()): StudentState {
  if (!student.isActive) return 'disabled'
  if (student.frozen) return 'frozen'
  const idle = daysSince(student.lastActivityAt ?? student.createdAt, now)
  return idle !== null && idle >= INACTIVE_DAYS ? 'inactive' : 'learning'
}

/** «2 ч 05 мин», «45 мин», «нет». */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'нет'
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (!hours) return `${rest} мин`
  return rest ? `${hours} ч ${String(rest).padStart(2, '0')} мин` : `${hours} ч`
}

const pluralRules = new Intl.PluralRules('ru-RU')
export function plural(count: number, forms: { one: string; few: string; many: string }): string {
  const rule = pluralRules.select(count)
  return `${count} ${rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.many}`
}
export const daysLabel = (count: number) => plural(count, { one: 'день', few: 'дня', many: 'дней' })

/** Доля в процентах без округления, его делает formatPercent; при пустом знаменателе - null, а не 0. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? (part / whole) * 100 : null
}

/**
 * Подпись процента. Округление прячет крайние случаи: 3 урока из 631 давали «0%», будто ученик не начинал,
 * а 630 из 631 - «100%», будто закончил. Поэтому начатое меньше 1% и почти законченное подписаны отдельно.
 */
export function formatPercent(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null
  if (value > 0 && value < 1) return 'меньше 1%'
  if (value > 99 && value < 100) return '99%'
  return `${Math.round(value)}%`
}

/** Ширина полоски прогресса: начатое видно сразу, даже когда доля меньше пикселя. */
export const barStyle = (value: number | null) => ({ width: `${value ?? 0}%`, minWidth: value !== null && value > 0 ? 4 : undefined })

/** Медиана набора чисел; пустой набор - null. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export const studentFilters = ['all', 'learning', 'inactive', 'frozen', 'bootcamp'] as const
export type StudentFilter = (typeof studentFilters)[number]
export const parseStudentFilter = (value: unknown): StudentFilter => studentFilters.find((filter) => filter === value) ?? 'all'

export const studentSorts = ['activity', 'name', 'activeDays', 'minutes', 'lessons', 'tasks', 'courses', 'access', 'questions'] as const
export type StudentSort = (typeof studentSorts)[number]
export const parseStudentSort = (value: unknown): StudentSort => studentSorts.find((sort) => sort === value) ?? 'activity'

export type StudentFreezeBadge = { until: string | null; reason: string | null }

export type StudentRow = {
  id: number
  title: string
  email: string
  createdAt: string
  isTestStudent: boolean
  state: StudentState
  freeze: StudentFreezeBadge | null
  /** Дата плановой заморозки - до неё открыт доступ. */
  accessUntil: string | null
  bootcamp: string | null
  lastActivityAt: string | null
  idleDays: number | null
  period: { activeDays: number; minutes: number; lessons: number; tasks: number }
  lessonsTotal: number
  courses: { open: number; started: number }
  waitingQuestions: number
}

export type StudentsOverview = {
  period: AnalyticsPeriod
  filter: StudentFilter
  counts: Record<StudentFilter, number>
  docs: StudentRow[]
  page: number
  hasNextPage: boolean
  totalDocs: number
}

export type CourseLearning = {
  id: number
  title: string
  href: string
  open: boolean
  lessonsDone: number
  lessonsTotal: number
  minutes: number
  lastActivityAt: string | null
  stoppedAt: { title: string; href: string } | null
}

export type RoadmapLearning = { id: number; title: string; href: string; courses: number; started: number; lessonsDone: number; lessonsTotal: number }

export type WeekActivity = { week: string; minutes: number; lessons: number; tasks: number }

export type StudentLearning = {
  state: StudentState
  isTestStudent: boolean
  freeze: StudentFreezeBadge | null
  accessUntil: string | null
  bootcamp: string | null
  lastActivityAt: string | null
  idleDays: number | null
  roadmaps: RoadmapLearning[]
  courses: CourseLearning[]
  /** Открытые, но ещё не начатые курсы: только число, список был бы слишком длинным. */
  notStarted: number
  weeks: WeekActivity[]
}

function sortValue(sort: StudentSort, row: StudentRow): number | string | null {
  switch (sort) {
    case 'name': return row.title.toLocaleLowerCase('ru-RU')
    case 'activity': return row.lastActivityAt ? Date.parse(row.lastActivityAt) : null
    case 'activeDays': return row.period.activeDays
    case 'minutes': return row.period.minutes
    case 'lessons': return row.period.lessons
    case 'tasks': return row.period.tasks
    case 'courses': return row.courses.started
    // Замороженные - раньше всех плановых дат, без плановой заморозки - в конце.
    case 'access': return row.freeze ? Number.MIN_SAFE_INTEGER : row.accessUntil ? Date.parse(row.accessUntil) : null
    case 'questions': return row.waitingQuestions
  }
}

/** Пустое значение в конце при любом направлении: «не входил ни разу» не должно всплывать первым. */
export function compareStudents(sort: StudentSort, descending: boolean, left: StudentRow, right: StudentRow): number {
  const a = sortValue(sort, left)
  const b = sortValue(sort, right)
  if (a === b) return left.id - right.id
  if (a === null) return 1
  if (b === null) return -1
  const order = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'ru-RU') : Number(a) - Number(b)
  return descending ? -order : order
}

export type CourseRow = {
  id: number
  title: string
  href: string
  roadmap: string | null
  lessons: number
  /** Ученики, которым курс открыт по политике доступа. */
  access: number
  started: number
  completed: number
  /** Медиана прогресса среди начавших, в процентах. */
  medianProgress: number | null
  period: { minutes: number; lessons: number; active: number }
  questions: number
  stuckAt: { title: string; href: string; students: number } | null
}

export type RoadmapRow = {
  id: number
  title: string
  href: string
  courses: number
  lessons: number
  access: number
  started: number
  completed: number
  medianProgress: number | null
  period: { minutes: number; active: number }
}

export type CoursesOverview = {
  period: AnalyticsPeriod
  roadmap: number | null
  students: number
  roadmaps: RoadmapRow[]
  courses: CourseRow[]
  /** Открыты ученикам, но никто не начал. */
  unopened: { id: number; title: string; href: string; access: number }[]
}

export type LessonFunnelRow = { id: number; title: string; href: string; position: number; completed: number; viewed: number; videoEnded: number; questions: number; notes: number; drop: boolean }
export type CourseDetail = { id: number; title: string; href: string; started: number; lessons: LessonFunnelRow[] }

/** Первый непройденный урок программы - на нём ученик и стоит; у закончившего и не начавшего такого нет. */
export function stuckLesson(ordered: readonly number[], done: ReadonlySet<number>): number | null {
  if (!ordered.some((id) => done.has(id))) return null
  return ordered.find((id) => !done.has(id)) ?? null
}

/** Урок, после которого прошедших стало меньше всего относительно предыдущего; без падения - null. */
export function biggestDrop(completed: readonly number[]): number | null {
  let index: number | null = null
  let largest = 0
  for (let position = 1; position < completed.length; position += 1) {
    const drop = completed[position - 1] - completed[position]
    if (drop > largest) { largest = drop; index = position }
  }
  return index
}
