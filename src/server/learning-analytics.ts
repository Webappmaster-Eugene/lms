import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { freezeState, FREEZE_REASONS, moscowDayStart, type FreezePeriod, type FreezeReason } from '@/lib/account-freeze'
import { loadPublishedProgrammeLessons } from '@/lib/course-completion'
import { coursePath } from '@/lib/course-path'
import { relationKey } from '@/lib/course-lessons'
import { collectAllPages } from '@/lib/paginate'
import {
  compareStudents, daysSince, periodStartDay, studentState, weekStarts,
  type AnalyticsPeriod, type CourseLearning, type RoadmapLearning, type StudentFilter, type StudentLearning,
  type StudentRow, type StudentSort, type StudentsOverview,
} from '@/lib/learning-analytics'
import { getLearningAccess } from '@/server/learning-access'

/**
 * Аналитика обучения для администратора: одна выборка на метрику для всех учеников страницы,
 * а не набор запросов на каждого. Учеником считается тот, у кого роль ученика в политике доступа.
 */

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = (payload: Payload) => (payload.db as unknown as { drizzle: Db }).drizzle
const rowsOf = <T>(result: unknown) => (result as { rows?: T[] }).rows ?? []
const num = (value: unknown) => value === null || value === undefined ? 0 : Number(value)
const iso = (value: unknown) => value === null || value === undefined ? null : new Date(value as string).toISOString()
const intArray = (ids: readonly number[]) => `{${ids.filter((id) => Number.isSafeInteger(id)).join(',')}}`

const PAGE_SIZE = 50

type BaseRow = {
  id: number
  first_name: string | null
  last_name: string | null
  email: string
  is_active: boolean | null
  is_test: boolean
  created_at: string
  last_activity: string | null
  active_days: string | number | null
  minutes: string | number | null
  lessons: string | number | null
  tasks: string | number | null
  lessons_total: string | number | null
  started_courses: string | number | null
  waiting: string | number | null
  bootcamp: string | null
}

/**
 * Последняя активность - самое позднее из сигнала вкладки, открытия урока и прохождения.
 * Ждёт ответа - вопрос, где последнее слово за учеником (как threadStatus в comment-threads).
 */
async function loadStudentRows(payload: Payload, options: { from: string; userIds?: readonly number[]; search?: string }): Promise<BaseRow[]> {
  const search = (options.search ?? '').trim().toLowerCase()
  const only = options.userIds ? intArray(options.userIds) : null
  return rowsOf<BaseRow>(await db(payload).execute(sql`
    select u.id, u.first_name, u.last_name, u.email, u.is_active, coalesce(u.is_test_student, false) as is_test, u.created_at,
      greatest(t.last_seen, s.last_viewed, pr.last_completed, tr.last_completed) as last_activity,
      d.active_days, d.minutes, d.lessons, d.tasks,
      pr.total as lessons_total, cs.started as started_courses, q.waiting, bc.bootcamp
    from users u
    left join learning_access_policies p on p.user_id = u.id
    left join lateral (select max(last_seen_at) as last_seen from student_session_telemetry where user_id = u.id) t on true
    left join lateral (select max(last_viewed_at) as last_viewed from lesson_learning_states where user_id = u.id) s on true
    left join lateral (select count(*) filter (where is_completed) as total, max(completed_at) filter (where is_completed) as last_completed from user_progress where user_id = u.id) pr on true
    left join lateral (select max(completed_at) as last_completed from user_trainer_progress where user_id = u.id and is_completed) tr on true
    left join lateral (select count(distinct day) as active_days, sum(minutes) as minutes, sum(lessons_completed) as lessons, sum(trainer_solved) as tasks
      from student_activity_days where user_id = u.id and day >= ${options.from}) d on true
    left join lateral (select count(distinct l.course_id) as started from lessons l
      where l.id in (select lesson_id from user_progress where user_id = u.id and is_completed union select lesson_id from lesson_learning_states where user_id = u.id)) cs on true
    left join lateral (select count(*) as waiting from comments c
      where c.user_id = u.id and c.parent_comment_id is null and not coalesce(c.is_resolved, false) and c.deleted_at is null
        and coalesce((select r.user_id from comments r where r.parent_comment_id = c.id and r.deleted_at is null order by r.created_at desc, r.id desc limit 1), c.user_id) = c.user_id) q on true
    left join lateral (select string_agg(distinct coalesce(bp.short_title, e.program), ', ') as bootcamp
      from bootcamp_enrollments e left join bootcamp_programs bp on bp.key = e.program
      where e.lms_user_id = u.id and e.status = 'done' and e.revoked_at is null) bc on true
    where coalesce(p.role::text, u.role::text) = 'student'
      and (${only}::int[] is null or u.id = any(${only}::int[]))
      and (${search} = '' or strpos(lower(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '') || ' ' || u.email), ${search}) > 0)
    order by u.id`))
}

type FreezeRow = { id: number; user_id: number; starts_at: string; ends_at: string | null; reason: string | null; automatic: boolean | null; note: string | null }

async function loadFreezes(payload: Payload, userIds: readonly number[]): Promise<Map<number, FreezePeriod[]>> {
  const byUser = new Map<number, FreezePeriod[]>()
  if (userIds.length === 0) return byUser
  const rows = rowsOf<FreezeRow>(await db(payload).execute(sql`
    select id, user_id, starts_at, ends_at, reason, automatic, note from account_freezes where user_id = any(${intArray(userIds)}::int[])`))
  for (const row of rows) {
    const period: FreezePeriod = { id: row.id, startsAt: iso(row.starts_at) ?? '', endsAt: iso(row.ends_at), reason: (row.reason ?? 'other') as FreezeReason, automatic: row.automatic === true, note: row.note }
    byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), period])
  }
  return byUser
}

const reasonLabel = (reason: string | null | undefined) => reason && reason in FREEZE_REASONS ? FREEZE_REASONS[reason as FreezeReason] : null

/** Сколько курсов открыто ученику - по той же политике, что решает доступ на платформе. */
async function openCourseCounts(payload: Payload, req: PayloadRequest, userIds: readonly number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>()
  for (const id of userIds) {
    const access = await getLearningAccess(payload, { id }, req)
    counts.set(id, access.accessibleCourseIds.length)
  }
  return counts
}

function toRow(base: BaseRow, freezes: FreezePeriod[], openCourses: number, now: number): StudentRow {
  const freeze = freezeState(freezes, now)
  const lastActivityAt = iso(base.last_activity)
  const createdAt = iso(base.created_at) ?? new Date(now).toISOString()
  return {
    id: base.id,
    title: [base.first_name, base.last_name].filter(Boolean).join(' ') || base.email,
    email: base.email,
    createdAt,
    isTestStudent: base.is_test === true,
    state: studentState({ isActive: base.is_active !== false, frozen: freeze.active !== null, lastActivityAt, createdAt }, now),
    freeze: freeze.active ? { until: freeze.frozenUntil, reason: reasonLabel(freeze.active.reason) } : null,
    accessUntil: freeze.active ? null : freeze.planned?.startsAt ?? null,
    bootcamp: base.bootcamp,
    lastActivityAt,
    idleDays: daysSince(lastActivityAt, now),
    period: { activeDays: num(base.active_days), minutes: num(base.minutes), lessons: num(base.lessons), tasks: num(base.tasks) },
    lessonsTotal: num(base.lessons_total),
    courses: { open: openCourses, started: num(base.started_courses) },
    waitingQuestions: num(base.waiting),
  }
}

/** Ученики с метриками без пагинации: для сводки в Telegram и для фильтров экрана. */
export async function studentRows(payload: Payload, req: PayloadRequest, options: { period: AnalyticsPeriod; userIds?: readonly number[]; search?: string; withCourses?: boolean }, now = Date.now()): Promise<StudentRow[]> {
  const base = await loadStudentRows(payload, { from: periodStartDay(options.period, now), userIds: options.userIds, search: options.search })
  const ids = base.map((row) => row.id)
  const [freezes, courses] = await Promise.all([
    loadFreezes(payload, ids),
    options.withCourses === false ? Promise.resolve(new Map<number, number>()) : openCourseCounts(payload, req, ids),
  ])
  return base.map((row) => toRow(row, freezes.get(row.id) ?? [], courses.get(row.id) ?? 0, now))
}

const matchesFilter = (row: StudentRow, filter: StudentFilter) =>
  filter === 'all' ? true : filter === 'bootcamp' ? row.bootcamp !== null : row.state === filter

export async function studentsOverview(payload: Payload, req: PayloadRequest, query: { period: AnalyticsPeriod; filter: StudentFilter; search: string; showTest: boolean; sort: StudentSort; descending: boolean; page: number }, now = Date.now()): Promise<StudentsOverview> {
  const rows = (await studentRows(payload, req, { period: query.period, search: query.search }, now)).filter((row) => query.showTest || !row.isTestStudent)
  const counts = { all: rows.length, learning: 0, inactive: 0, frozen: 0, bootcamp: 0 } satisfies Record<StudentFilter, number>
  for (const row of rows) {
    if (row.state === 'learning' || row.state === 'inactive' || row.state === 'frozen') counts[row.state] += 1
    if (row.bootcamp) counts.bootcamp += 1
  }
  const filtered = rows.filter((row) => matchesFilter(row, query.filter))
  filtered.sort((left, right) => compareStudents(query.sort, query.descending, left, right))
  const start = (query.page - 1) * PAGE_SIZE
  return { period: query.period, filter: query.filter, counts, docs: filtered.slice(start, start + PAGE_SIZE), page: query.page, hasNextPage: start + PAGE_SIZE < filtered.length, totalDocs: filtered.length }
}

type CourseMeta = { id: number; title: string; slug: string; roadmap: unknown; isBootcamp?: boolean | null }

/**
 * Обучение одного ученика для карточки: роадмапы и курсы с прогрессом по опубликованной программе
 * (тот же знаменатель, что у завершения курса), минуты из дневной сводки и место остановки.
 */
export async function studentLearning(payload: Payload, req: PayloadRequest, userId: number, now = Date.now()): Promise<StudentLearning> {
  const [row] = await studentRows(payload, req, { period: 30, userIds: [userId], withCourses: false }, now)
  const access = await getLearningAccess(payload, { id: userId }, req)
  const accessible = new Set(access.accessibleCourseIds)
  const startedRows = rowsOf<{ course_id: number }>(await db(payload).execute(sql`
    select distinct l.course_id from lessons l
    where l.course_id is not null and l.id in (select lesson_id from user_progress where user_id = ${userId} and is_completed union select lesson_id from lesson_learning_states where user_id = ${userId})
    union select distinct course_id from student_activity_days where user_id = ${userId} and course_id is not null`))
  const started = new Set(startedRows.map((item) => Number(item.course_id)))
  const courseIds = [...new Set([...accessible, ...started])]
  const [courses, lessons, done, perCourse, weeks] = await Promise.all([
    courseIds.length ? collectAllPages(({ page, limit }) => payload.find({ collection: 'courses', where: { id: { in: courseIds } }, select: { title: true, slug: true, roadmap: true, isBootcamp: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'курсы ученика для аналитики' }) as Promise<CourseMeta[]> : Promise.resolve([] as CourseMeta[]),
    loadPublishedProgrammeLessons(req, courseIds),
    db(payload).execute(sql`select lesson_id from user_progress where user_id = ${userId} and is_completed`).then((result) => rowsOf<{ lesson_id: number }>(result)),
    db(payload).execute(sql`
      select c.id as course_id,
        (select sum(minutes) from student_activity_days where user_id = ${userId} and course_id = c.id) as minutes,
        (select max(day) from student_activity_days where user_id = ${userId} and course_id = c.id) as last_day,
        (select max(s.last_viewed_at) from lesson_learning_states s join lessons l on l.id = s.lesson_id where s.user_id = ${userId} and l.course_id = c.id) as last_viewed,
        (select max(p.completed_at) from user_progress p join lessons l on l.id = p.lesson_id where p.user_id = ${userId} and p.is_completed and l.course_id = c.id) as last_completed,
        stop.title as stopped_title, stop.slug as stopped_slug
      from courses c
      left join lateral (select l.title, l.slug from lesson_learning_states s join lessons l on l.id = s.lesson_id
        where s.user_id = ${userId} and l.course_id = c.id and l.is_published order by s.last_viewed_at desc limit 1) stop on true
      where c.id = any(${intArray([...started])}::int[])`).then((result) => rowsOf<{ course_id: number; minutes: string | number | null; last_viewed: string | null; last_completed: string | null; stopped_title: string | null; stopped_slug: string | null; last_day: string | null }>(result)),
    db(payload).execute(sql`
      select to_char(date_trunc('week', day::date), 'YYYY-MM-DD') as week, sum(minutes) as minutes, sum(lessons_completed) as lessons, sum(trainer_solved) as tasks
      from student_activity_days where user_id = ${userId} and day >= ${weekStarts(12, now)[0]} group by 1`).then((result) => rowsOf<{ week: string; minutes: string | number | null; lessons: string | number | null; tasks: string | number | null }>(result)),
  ])
  const completed = new Set(done.map((item) => Number(item.lesson_id)))
  const totals = new Map<number, { total: number; done: number }>()
  for (const lesson of lessons) {
    const course = Number(relationKey(lesson.course))
    const entry = totals.get(course) ?? { total: 0, done: 0 }
    entry.total += 1
    if (completed.has(lesson.id)) entry.done += 1
    totals.set(course, entry)
  }
  const stats = new Map(perCourse.map((item) => [Number(item.course_id), item]))
  const courseList: CourseLearning[] = courses.filter((course) => started.has(course.id)).map((course) => {
    const stat = stats.get(course.id)
    // День сводки без точного времени - на случай, когда остались только минуты на страницах курса.
    const lastActivity = [iso(stat?.last_viewed), iso(stat?.last_completed), stat?.last_day ? moscowDayStart(stat.last_day) : null].filter((value): value is string => value !== null).sort().at(-1) ?? null
    return {
      id: course.id, title: course.title, href: coursePath(course), open: accessible.has(course.id),
      lessonsDone: totals.get(course.id)?.done ?? 0, lessonsTotal: totals.get(course.id)?.total ?? 0,
      minutes: num(stat?.minutes), lastActivityAt: lastActivity,
      stoppedAt: stat?.stopped_slug ? { title: stat.stopped_title ?? stat.stopped_slug, href: `/lessons/${stat.stopped_slug}` } : null,
    }
  }).sort((left, right) => (right.lastActivityAt ?? '').localeCompare(left.lastActivityAt ?? ''))
  const roadmapIds = [...new Set(courses.filter((course) => accessible.has(course.id)).flatMap((course) => Number(relationKey(course.roadmap)) || []))]
  const roadmaps = roadmapIds.length ? (await payload.find({ collection: 'roadmaps', where: { id: { in: roadmapIds } }, select: { title: true, slug: true }, depth: 0, limit: roadmapIds.length, overrideAccess: true, req })).docs : []
  const roadmapList: RoadmapLearning[] = roadmaps.map((roadmap) => {
    const own = courses.filter((course) => accessible.has(course.id) && Number(relationKey(course.roadmap)) === roadmap.id)
    return {
      id: roadmap.id, title: roadmap.title, href: `/roadmaps/${roadmap.slug}`, courses: own.length,
      started: own.filter((course) => started.has(course.id)).length,
      lessonsDone: own.reduce((sum, course) => sum + (totals.get(course.id)?.done ?? 0), 0),
      lessonsTotal: own.reduce((sum, course) => sum + (totals.get(course.id)?.total ?? 0), 0),
    }
  }).sort((left, right) => right.lessonsDone - left.lessonsDone || left.title.localeCompare(right.title, 'ru-RU'))
  const byWeek = new Map(weeks.map((item) => [item.week, item]))
  return {
    state: row?.state ?? 'learning',
    isTestStudent: row?.isTestStudent ?? false,
    freeze: row?.freeze ?? null,
    accessUntil: row?.accessUntil ?? null,
    bootcamp: row?.bootcamp ?? null,
    lastActivityAt: row?.lastActivityAt ?? null,
    idleDays: row?.idleDays ?? null,
    roadmaps: roadmapList,
    courses: courseList,
    notStarted: [...accessible].filter((id) => !started.has(id)).length,
    weeks: weekStarts(12, now).map((week) => ({ week, minutes: num(byWeek.get(week)?.minutes), lessons: num(byWeek.get(week)?.lessons), tasks: num(byWeek.get(week)?.tasks) })),
  }
}
