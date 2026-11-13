import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { coursePath } from '@/lib/course-path'
import { collectAllPages } from '@/lib/paginate'
import { biggestDrop, median, periodStartDay, stuckLesson, type AnalyticsPeriod, type CourseDetail, type CourseRow, type CoursesOverview, type RoadmapRow } from '@/lib/learning-analytics'
import { getLearningAccess } from '@/server/learning-access'

/**
 * Как ученики проходят роадмапы и курсы. Считаются только ученики (роль из политики доступа)
 * без флажка «Тестовый»; замороженные остаются: их доступ и прохождение - часть истории курса.
 * Программа курса - его опубликованные уроки в опубликованных разделах, как у завершения курса.
 */

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = (payload: Payload) => (payload.db as unknown as { drizzle: Db }).drizzle
const rowsOf = <T>(result: unknown) => (result as { rows?: T[] }).rows ?? []
const num = (value: unknown) => value === null || value === undefined ? 0 : Number(value)
const intArray = (ids: Iterable<number>) => `{${[...ids].filter((id) => Number.isSafeInteger(id)).join(',')}}`

type CourseMeta = { id: number; title: string; slug: string; roadmap_id: number | null; is_bootcamp: boolean | null; assigned_only: boolean | null; roadmap_title: string | null }
type LessonMeta = { id: number; course_id: number; title: string; slug: string }

async function studentIds(payload: Payload): Promise<number[]> {
  return rowsOf<{ id: number }>(await db(payload).execute(sql`
    select u.id from users u left join learning_access_policies p on p.user_id = u.id
    where coalesce(p.role::text, u.role::text) = 'student' and not coalesce(u.is_test_student, false)
    order by u.id`)).map((row) => Number(row.id))
}

/** Уроки программы по порядку: раздел, затем урок; урок из чужого или снятого раздела не считается. */
async function programmeLessons(payload: Payload, courseIds: readonly number[]): Promise<Map<number, LessonMeta[]>> {
  const byCourse = new Map<number, LessonMeta[]>()
  if (courseIds.length === 0) return byCourse
  const rows = rowsOf<LessonMeta>(await db(payload).execute(sql`
    select l.id, l.course_id, l.title, l.slug from lessons l left join sections s on s.id = l.section_id
    where l.is_published and l.course_id = any(${intArray(courseIds)}::int[])
      and (l.section_id is null or (s.is_published and s.course_id = l.course_id))
    order by l.course_id, coalesce(s."order", 0), s.id nulls first, coalesce(l."order", 0), l.id`))
  for (const row of rows) {
    const course = Number(row.course_id)
    byCourse.set(course, [...(byCourse.get(course) ?? []), { ...row, id: Number(row.id), course_id: course }])
  }
  return byCourse
}

function pairs(rows: { user_id: number; lesson_id: number }[]): Map<number, Set<number>> {
  const byUser = new Map<number, Set<number>>()
  for (const row of rows) {
    const user = Number(row.user_id)
    const set = byUser.get(user) ?? new Set<number>()
    set.add(Number(row.lesson_id))
    byUser.set(user, set)
  }
  return byUser
}

// Без округления до целых: 3 урока из 631 - это 0,48%, а не 0%. Подпись делает formatPercent на экране.
const percentOf = (done: number, total: number) => total > 0 ? (done / total) * 100 : 0
// Сотые убирают хвост плавающей точки (49,99999 вместо 50) и не превращают в ноль урок из нескольких тысяч.
const medianPercent = (values: readonly number[]) => {
  const value = median(values)
  return value === null ? null : Math.round(value * 100) / 100
}

export async function coursesOverview(payload: Payload, req: PayloadRequest, query: { period: AnalyticsPeriod; roadmap: number | null }, now = Date.now()): Promise<CoursesOverview> {
  const students = await studentIds(payload)
  const from = periodStartDay(query.period, now)
  const access = new Map<number, Set<number>>()
  for (const id of students) access.set(id, new Set((await getLearningAccess(payload, { id }, req)).accessibleCourseIds))
  const [courses, doneRows, viewedRows, activityRows, questionRows] = await Promise.all([
    db(payload).execute(sql`
      select c.id, c.title, c.slug, c.roadmap_id, c.is_bootcamp, c.assigned_only, r.title as roadmap_title
      from courses c left join roadmaps r on r.id = c.roadmap_id where c.is_published order by c.id`).then((result) => rowsOf<CourseMeta>(result)),
    db(payload).execute(sql`select user_id, lesson_id from user_progress where is_completed and user_id = any(${intArray(students)}::int[])`).then((result) => rowsOf<{ user_id: number; lesson_id: number }>(result)),
    db(payload).execute(sql`select user_id, lesson_id from lesson_learning_states where user_id = any(${intArray(students)}::int[])`).then((result) => rowsOf<{ user_id: number; lesson_id: number }>(result)),
    db(payload).execute(sql`
      select course_id, user_id, sum(minutes) as minutes, sum(lessons_completed) as lessons from student_activity_days
      where day >= ${from} and course_id is not null and user_id = any(${intArray(students)}::int[]) group by 1, 2`).then((result) => rowsOf<{ course_id: number; user_id: number; minutes: string | number; lessons: string | number }>(result)),
    db(payload).execute(sql`
      select l.course_id, count(*) as questions from comments c join lessons l on l.id = c.lesson_id
      where c.parent_comment_id is null and c.deleted_at is null and c.created_at >= ${new Date(Date.parse(`${from}T00:00:00+03:00`)).toISOString()}::timestamptz
        and c.user_id = any(${intArray(students)}::int[]) group by 1`).then((result) => rowsOf<{ course_id: number; questions: string | number }>(result)),
  ])
  const lessons = await programmeLessons(payload, courses.map((course) => Number(course.id)))
  const done = pairs(doneRows)
  const viewed = pairs(viewedRows)
  const activity = new Map<number, Map<number, { minutes: number; lessons: number }>>()
  for (const row of activityRows) {
    const course = Number(row.course_id)
    const byUser = activity.get(course) ?? new Map<number, { minutes: number; lessons: number }>()
    byUser.set(Number(row.user_id), { minutes: num(row.minutes), lessons: num(row.lessons) })
    activity.set(course, byUser)
  }
  const questions = new Map(questionRows.map((row) => [Number(row.course_id), num(row.questions)]))

  // Курс считается начатым, если ученик прошёл или хотя бы открыл урок его программы.
  const startedIn = (user: number, ordered: LessonMeta[]) => ordered.some((lesson) => done.get(user)?.has(lesson.id) || viewed.get(user)?.has(lesson.id))
  const doneIn = (user: number, ordered: LessonMeta[]) => ordered.filter((lesson) => done.get(user)?.has(lesson.id)).length

  const courseRows: CourseRow[] = []
  for (const course of courses) {
    const id = Number(course.id)
    const ordered = lessons.get(id) ?? []
    const withAccess = students.filter((user) => access.get(user)?.has(id))
    const learners = students.filter((user) => startedIn(user, ordered))
    if (withAccess.length === 0 && learners.length === 0) continue
    const progress = learners.map((user) => percentOf(doneIn(user, ordered), ordered.length))
    const stuck = new Map<number, number>()
    for (const user of learners) {
      const lesson = stuckLesson(ordered.map((item) => item.id), done.get(user) ?? new Set())
      if (lesson !== null) stuck.set(lesson, (stuck.get(lesson) ?? 0) + 1)
    }
    const [stuckId, stuckCount] = [...stuck].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0] ?? [null, 0]
    const stuckMeta = stuckId === null ? null : ordered.find((lesson) => lesson.id === stuckId) ?? null
    const periodRows = [...(activity.get(id)?.values() ?? [])]
    courseRows.push({
      id, title: course.title, href: coursePath({ slug: course.slug, isBootcamp: course.is_bootcamp }), roadmap: course.roadmap_title,
      lessons: ordered.length, access: withAccess.length, started: learners.length,
      completed: ordered.length > 0 ? learners.filter((user) => doneIn(user, ordered) === ordered.length).length : 0,
      medianProgress: medianPercent(progress),
      period: { minutes: periodRows.reduce((sum, item) => sum + item.minutes, 0), lessons: periodRows.reduce((sum, item) => sum + item.lessons, 0), active: periodRows.filter((item) => item.minutes > 0 || item.lessons > 0).length },
      questions: questions.get(id) ?? 0,
      stuckAt: stuckMeta ? { title: stuckMeta.title, href: `/lessons/${stuckMeta.slug}`, students: stuckCount } : null,
    })
  }

  // Программа роадмапа - как у сертификата (isRoadmapCompleted): только его опубликованные курсы без
  // «только по назначению». Курсы других карт в темах (sharedCourses) в неё не входят.
  const roadmaps = await collectAllPages(({ page, limit }) => payload.find({ collection: 'roadmaps', where: { isPublished: { equals: true } }, select: { title: true, slug: true }, depth: 0, sort: 'title', page, limit, overrideAccess: true, req }), { label: 'роадмапы для аналитики' })
  const roadmapRows: RoadmapRow[] = []
  const programmes = new Map<number, number[]>()
  for (const roadmap of roadmaps) {
    const programme = courses.filter((course) => Number(course.roadmap_id) === roadmap.id && !course.assigned_only).map((course) => Number(course.id))
    programmes.set(roadmap.id, programme)
    const ordered = programme.flatMap((id) => lessons.get(id) ?? [])
    const withAccess = students.filter((user) => programme.some((id) => access.get(user)?.has(id)))
    const learners = students.filter((user) => startedIn(user, ordered))
    if (withAccess.length === 0 && learners.length === 0) continue
    const periodRows = programme.flatMap((id) => [...(activity.get(id)?.entries() ?? [])])
    const activeUsers = new Set(periodRows.filter(([, item]) => item.minutes > 0 || item.lessons > 0).map(([user]) => user))
    roadmapRows.push({
      id: roadmap.id, title: roadmap.title, href: `/roadmaps/${roadmap.slug}`, courses: programme.length, lessons: ordered.length,
      access: withAccess.length, started: learners.length,
      completed: ordered.length > 0 ? withAccess.filter((user) => doneIn(user, ordered) === ordered.length).length : 0,
      medianProgress: medianPercent(withAccess.map((user) => percentOf(doneIn(user, ordered), ordered.length))),
      period: { minutes: periodRows.reduce((sum, [, item]) => sum + item.minutes, 0), active: activeUsers.size },
    })
  }

  const inRoadmap = query.roadmap === null ? null : new Set(programmes.get(query.roadmap) ?? courses.filter((course) => Number(course.roadmap_id) === query.roadmap).map((course) => Number(course.id)))
  const visible = courseRows.filter((row) => inRoadmap === null || inRoadmap.has(row.id))
  return {
    period: query.period,
    roadmap: query.roadmap,
    students: students.length,
    roadmaps: roadmapRows.sort((left, right) => right.started - left.started || right.access - left.access || left.title.localeCompare(right.title, 'ru-RU')),
    courses: visible.filter((row) => row.started > 0).sort((left, right) => right.period.minutes - left.period.minutes || right.started - left.started || left.title.localeCompare(right.title, 'ru-RU')),
    unopened: visible.filter((row) => row.started === 0 && row.access > 0).sort((left, right) => right.access - left.access || left.title.localeCompare(right.title, 'ru-RU')).map(({ id, title, href, access: count }) => ({ id, title, href, access: count })),
  }
}

/** Воронка одного курса по урокам: где ученики перестают проходить. */
export async function courseDetail(payload: Payload, courseId: number): Promise<CourseDetail | null> {
  const [course] = rowsOf<{ id: number; title: string; slug: string; is_bootcamp: boolean | null }>(await db(payload).execute(sql`select id, title, slug, is_bootcamp from courses where id = ${courseId}`))
  if (!course) return null
  const students = await studentIds(payload)
  const ordered = (await programmeLessons(payload, [courseId])).get(courseId) ?? []
  const ids = intArray(ordered.map((lesson) => lesson.id))
  const who = intArray(students)
  type Count = { lesson_id: number; count: string | number }
  const [completed, viewed, ended, questions, notes] = await Promise.all([
    db(payload).execute(sql`select lesson_id, count(distinct user_id) as count from user_progress where is_completed and lesson_id = any(${ids}::int[]) and user_id = any(${who}::int[]) group by 1`),
    db(payload).execute(sql`select lesson_id, count(*) as count from lesson_learning_states where lesson_id = any(${ids}::int[]) and user_id = any(${who}::int[]) group by 1`),
    db(payload).execute(sql`select lesson_id, count(*) as count from lesson_learning_states s where lesson_id = any(${ids}::int[]) and user_id = any(${who}::int[])
      and jsonb_typeof(s.positions) = 'object' and exists (select 1 from jsonb_each(s.positions) e where jsonb_typeof(e.value) = 'object' and e.value->>'ended' = 'true') group by 1`),
    db(payload).execute(sql`select lesson_id, count(*) as count from comments where parent_comment_id is null and deleted_at is null and lesson_id = any(${ids}::int[]) and user_id = any(${who}::int[]) group by 1`),
    db(payload).execute(sql`select lesson_id, count(*) as count from notes where lesson_id = any(${ids}::int[]) and user_id = any(${who}::int[]) group by 1`),
  ].map((query) => query.then((result) => new Map(rowsOf<Count>(result).map((row) => [Number(row.lesson_id), num(row.count)])))))
  const started = rowsOf<{ count: string | number }>(await db(payload).execute(sql`
    select count(distinct user_id) as count from (
      select user_id from user_progress where is_completed and lesson_id = any(${ids}::int[]) and user_id = any(${who}::int[])
      union select user_id from lesson_learning_states where lesson_id = any(${ids}::int[]) and user_id = any(${who}::int[])) s`))[0]
  const completedCounts = ordered.map((lesson) => completed.get(lesson.id) ?? 0)
  const drop = biggestDrop(completedCounts)
  return {
    id: Number(course.id), title: course.title, href: coursePath({ slug: course.slug, isBootcamp: course.is_bootcamp }), started: num(started?.count),
    lessons: ordered.map((lesson, index) => ({
      id: lesson.id, title: lesson.title, href: `/lessons/${lesson.slug}`, position: index + 1,
      completed: completedCounts[index], viewed: viewed.get(lesson.id) ?? 0, videoEnded: ended.get(lesson.id) ?? 0,
      questions: questions.get(lesson.id) ?? 0, notes: notes.get(lesson.id) ?? 0, drop: drop === index,
    })),
  }
}
