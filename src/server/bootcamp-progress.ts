import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { formatFreezeDate } from '@/lib/account-freeze'
import { weeklySummaryWindow } from '@/lib/bootcamp-funnel'
import {
  BOOTCAMP_PROGRAM_WEEKS, REVIEW_SLA_DAYS, scheduleLag, weekCell,
  type BootcampProgressReport, type ProgressStudent, type SubmissionFacts,
} from '@/lib/bootcamp-progress'
import { loadPublishedProgrammeLessons } from '@/lib/course-completion'
import { relationKey } from '@/lib/course-lessons'
import { median } from '@/lib/learning-analytics'
import { collectAllPages } from '@/lib/paginate'
import { logger } from '@/lib/telemetry'
import { adminLink, notifyAdmins, notifyAdminsAfterCommit } from '@/server/admin-telegram'
import { inTransaction, txDb } from '@/server/bootcamp-lead-events'
import { studentRows } from '@/server/learning-analytics'

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = (payload: Payload) => (payload.db as unknown as { drizzle: Db }).drizzle
const rowsOf = <T>(result: unknown) => (result as { rows?: T[] }).rows ?? []
const iso = (value: unknown) => value === null || value === undefined ? null : new Date(value as string).toISOString()
const num = (value: unknown) => value === null || value === undefined ? null : Number(value)
const intArray = (ids: Iterable<number>) => `{${[...ids].filter((id) => Number.isSafeInteger(id)).join(',')}}`

export const PROGRESS_ADMIN_PATH = '/admin/bootcamp-progress'

type StreamDoc = { id: number; title: string; program: string; gitlabGroup: string; startsAt: string; weeks?: { week: number; dueAt: string }[] | null }
type EnrollmentRow = { id: number; lead_id: number; first_name: string; last_name: string; gitlab_username: string; gitlab_project_url: string | null; lms_user_id: number | null; is_test: boolean }
type SubmissionRow = { enrollment_id: number; week: number; mr_iid: number; mr_url: string | null; opened_at: string | null; last_commit_at: string | null; pipeline_status: 'success' | 'failed' | null; pipeline_at: string | null; verdict: SubmissionFacts['verdict']; checks_passed: number | null; checks_total: number | null; verdict_at: string | null; merged_at: string | null; closed_at: string | null }

async function streams(payload: Payload, req?: PayloadRequest): Promise<StreamDoc[]> {
  return await collectAllPages(({ page, limit }) => payload.find({ collection: 'bootcamp-streams', sort: '-startsAt', depth: 0, page, limit, overrideAccess: true, ...(req ? { req } : {}) }), { label: 'потоки буткемпа' }) as StreamDoc[]
}

const facts = (row: SubmissionRow): SubmissionFacts => ({
  mrIid: Number(row.mr_iid), mrUrl: row.mr_url, openedAt: iso(row.opened_at), lastCommitAt: iso(row.last_commit_at), pipelineStatus: row.pipeline_status, pipelineAt: iso(row.pipeline_at),
  verdict: row.verdict, checksPassed: num(row.checks_passed), checksTotal: num(row.checks_total), verdictAt: iso(row.verdict_at), mergedAt: iso(row.merged_at), closedAt: iso(row.closed_at),
})

/**
 * Учёба потока: ученики из зачислений с группой потока (зачисление завершено, доступ не закрыт),
 * матрица недель по сдачам, отставание от сроков потока, активность в GitLab и LMS, методички.
 */
export async function bootcampProgress(payload: Payload, req: PayloadRequest, query: { stream: number | null; withTest: boolean }, now = Date.now()): Promise<BootcampProgressReport> {
  const all = await streams(payload, req)
  const stream = (query.stream === null ? all[0] : all.find((item) => item.id === query.stream)) ?? null
  const empty = { students: 0, onPlan: 0, lagOne: 0, lagMore: 0, waitingReview: 0, overdueReview: 0, medianReviewHours: null }
  const list = all.map(({ id, title }) => ({ id, title }))
  if (!stream) return { streams: list, stream: null, summary: empty, students: [] }
  const enrollments = rowsOf<EnrollmentRow>(await db(payload).execute(sql`
    select e.id, e.lead_id, e.first_name, e.last_name, e.gitlab_username, e.gitlab_project_url, e.lms_user_id, coalesce(l.is_test, false) as is_test
    from bootcamp_enrollments e left join bootcamp_leads l on l.id = e.lead_id
    where e.stream_group = ${stream.gitlabGroup} and e.status = 'done' and e.revoked_at is null
    order by e.last_name, e.first_name, e.id`)).filter((row) => query.withTest || !row.is_test)
  const ids = enrollments.map((row) => Number(row.id))
  const userIds = enrollments.flatMap((row) => row.lms_user_id ? [Number(row.lms_user_id)] : [])
  const [submissions, gitlabEvents, lms, program] = await Promise.all([
    db(payload).execute(sql`select * from bootcamp_week_submissions where enrollment_id = any(${intArray(ids)}::int[])`).then((result) => rowsOf<SubmissionRow>(result)),
    db(payload).execute(sql`select lead_id, max(created_at) as at from bootcamp_lead_events where type = 'gitlab_event' and lead_id = any(${intArray(enrollments.map((row) => Number(row.lead_id)))}::int[]) group by 1`).then((result) => rowsOf<{ lead_id: number; at: string }>(result)),
    userIds.length ? studentRows(payload, req, { period: 30, userIds, withCourses: false }, now) : Promise.resolve([]),
    payload.find({ collection: 'bootcamp-programs', where: { key: { equals: stream.program } }, select: { manualsCourse: true }, depth: 0, limit: 1, overrideAccess: true, req }).then((result) => result.docs[0] ?? null),
  ])
  const manualsCourse = program?.manualsCourse ? Number(relationKey(program.manualsCourse)) : null
  const manualLessons = manualsCourse ? await loadPublishedProgrammeLessons(req, [manualsCourse]) : []
  const manualDone = manualsCourse && userIds.length ? rowsOf<{ user_id: number; done: string | number }>(await db(payload).execute(sql`
    select p.user_id, count(*) as done from user_progress p where p.is_completed and p.user_id = any(${intArray(userIds)}::int[])
      and p.lesson_id = any(${intArray(manualLessons.map((lesson) => lesson.id))}::int[]) group by 1`)) : []
  const dueByWeek = new Map((stream.weeks ?? []).map((item) => [Number(item.week), item.dueAt]))
  const byEnrollment = new Map<number, SubmissionRow[]>()
  for (const row of submissions) byEnrollment.set(Number(row.enrollment_id), [...(byEnrollment.get(Number(row.enrollment_id)) ?? []), row])
  const lastGitlab = new Map(gitlabEvents.map((row) => [Number(row.lead_id), iso(row.at)]))
  const lmsRows = new Map(lms.map((row) => [row.id, row]))
  const manuals = new Map(manualDone.map((row) => [Number(row.user_id), Number(row.done)]))

  const students: ProgressStudent[] = enrollments.map((row) => {
    const items = byEnrollment.get(Number(row.id)) ?? []
    const weeks = Array.from({ length: BOOTCAMP_PROGRAM_WEEKS }, (_, index) => {
      const week = index + 1
      return weekCell(week, items.filter((item) => Number(item.week) === week).map(facts), dueByWeek.get(week) ?? null, now)
    })
    const lag = scheduleLag(weeks, now)
    const submissionTimes = items.flatMap((item) => [item.opened_at, item.last_commit_at, item.pipeline_at, item.verdict_at, item.merged_at].flatMap((value) => iso(value) ?? []))
    const lastGitlabAt = [lastGitlab.get(Number(row.lead_id)) ?? null, ...submissionTimes].filter((value): value is string => value !== null).sort().at(-1) ?? null
    const lmsRow = row.lms_user_id ? lmsRows.get(Number(row.lms_user_id)) : undefined
    return {
      enrollmentId: Number(row.id), userId: row.lms_user_id ? Number(row.lms_user_id) : null,
      title: `${row.first_name} ${row.last_name}`.trim() || row.gitlab_username, gitlabUsername: row.gitlab_username, projectUrl: row.gitlab_project_url,
      isTest: row.is_test === true, frozen: lmsRow?.freeze != null, lastGitlabAt, lastLmsAt: lmsRow?.lastActivityAt ?? null,
      manuals: manualsCourse ? { done: row.lms_user_id ? manuals.get(Number(row.lms_user_id)) ?? 0 : 0, total: manualLessons.length } : null,
      ...lag, weeks,
    }
  })
  const cells = students.flatMap((student) => student.weeks)
  // Ревью - от зелёного вердикта по последним коммитам до слияния; вердикт по устаревшим коммитам не в счёт.
  const reviewHours = submissions.flatMap((row) => {
    const verdictAt = row.verdict === 'passed' && row.verdict_at ? Date.parse(row.verdict_at) : NaN
    const mergedAt = row.merged_at ? Date.parse(row.merged_at) : NaN
    const fresh = !row.last_commit_at || Date.parse(row.last_commit_at) <= verdictAt
    return fresh && mergedAt >= verdictAt ? [(mergedAt - verdictAt) / 3_600_000] : []
  })
  const medianHours = median(reviewHours)
  return {
    streams: list,
    stream: { id: stream.id, title: stream.title, program: stream.program, startsAt: stream.startsAt, gitlabGroup: stream.gitlabGroup },
    summary: {
      students: students.length,
      onPlan: students.filter((student) => student.lag === 0).length,
      lagOne: students.filter((student) => student.lag === 1).length,
      lagMore: students.filter((student) => student.lag >= 2).length,
      waitingReview: cells.filter((cell) => cell.state === 'review').length,
      overdueReview: cells.filter((cell) => cell.overdue).length,
      medianReviewHours: medianHours === null ? null : Math.round(medianHours * 10) / 10,
    },
    students,
  }
}

type AlertRow = { id: number; week: number; mr_url: string | null; verdict_at: string; gitlab_username: string; first_name: string; last_name: string; lead_id: number }

/**
 * Сдача ждёт ревью дольше 3 дней - одно сообщение наставнику. Отметка ставится условным UPDATE
 * до отправки, поэтому повторный запуск планировщика второго сообщения не шлёт. Новый вердикт
 * после новых коммитов снимает отметку: срок ответа считается заново.
 */
export async function submissionReviewAlerts(payload: Payload): Promise<number> {
  const due = rowsOf<AlertRow>(await db(payload).execute(sql`
    update bootcamp_week_submissions s set review_alert_at = now(), updated_at = now()
    from bootcamp_enrollments e left join bootcamp_leads l on l.id = e.lead_id
    where s.enrollment_id = e.id and not coalesce(l.is_test, false)
      and s.verdict = 'passed' and s.merged_at is null and s.closed_at is null and s.review_alert_at is null
      and s.verdict_at < now() - make_interval(days => ${REVIEW_SLA_DAYS})
      and (s.last_commit_at is null or s.last_commit_at <= s.verdict_at)
    returning s.id, s.week, s.mr_url, s.verdict_at, e.gitlab_username, e.first_name, e.last_name, e.lead_id`))
  for (const row of due) {
    await notifyAdmins({
      title: `Сдача ждёт ревью больше ${REVIEW_SLA_DAYS} дней: ${row.first_name} ${row.last_name}`.trim(),
      lines: [`Неделя ${Number(row.week)}, проверка пройдена ${formatFreezeDate(row.verdict_at)}`, `GitLab: ${row.gitlab_username}`],
      link: row.mr_url ?? adminLink(PROGRESS_ADMIN_PATH),
    })
  }
  return due.length
}

// Больше строк в одном сообщении Telegram уже не читаются: остальное - на экране по ссылке.
const MAX_LINES = 25

/**
 * По понедельникам - отстающие от плана потока и сдачи, которые ждут ревью. Одна сводка на поток
 * в неделю: отметка в admin-digests вставляется первой в транзакции. Поток до первого срока и
 * поток, закончившийся больше двух недель назад, молчат.
 */
export async function sendBootcampLaggingDigest(payload: Payload, now = new Date()): Promise<number> {
  const window = weeklySummaryWindow(now)
  if (!window) return 0
  let sent = 0
  for (const stream of await streams(payload)) {
    const dues = (stream.weeks ?? []).map((item) => Date.parse(item.dueAt)).filter(Number.isFinite)
    if (dues.length === 0 || Math.min(...dues) > now.getTime() || Math.max(...dues) + 14 * 86_400_000 < now.getTime()) continue
    try {
      const done = await inTransaction(payload, null, async (req) => {
        const tx = await txDb(req)
        const marked = rowsOf(await tx.execute(sql`
          insert into admin_digests (kind, period) values ('bootcamp-lagging', ${`${window.week}:${stream.id}`})
          on conflict (kind, period) do nothing returning id`))
        if (marked.length === 0) return false
        const report = await bootcampProgress(payload, req, { stream: stream.id, withTest: false }, now.getTime())
        const lagging = report.students.filter((student) => student.lag > 0 && !student.frozen).sort((left, right) => right.lag - left.lag || left.title.localeCompare(right.title, 'ru-RU'))
        if (lagging.length === 0 && report.summary.waitingReview === 0) return false
        const lines = lagging.slice(0, MAX_LINES).map((student) => `${student.title} - не принято ${student.lag} из ${student.planned}: недели ${student.weeks.filter((cell) => cell.late && cell.state !== 'accepted').map((cell) => cell.week).join(', ')}`)
        if (lagging.length > MAX_LINES) lines.push(`и ещё ${lagging.length - MAX_LINES}`)
        lines.push(report.summary.waitingReview > 0 ? `Ждут ревью: ${report.summary.waitingReview}, из них дольше ${REVIEW_SLA_DAYS} дней: ${report.summary.overdueReview}` : 'Сдач, которые ждут ревью, нет')
        await tx.execute(sql`update admin_digests set summary = ${lines.join('\n').slice(0, 4000)}, updated_at = now() where kind = 'bootcamp-lagging' and period = ${`${window.week}:${stream.id}`}`)
        await notifyAdminsAfterCommit(req, { title: `${stream.title}: отстают от плана ${lagging.length} из ${report.summary.students}`, lines, link: adminLink(`${PROGRESS_ADMIN_PATH}?stream=${stream.id}`) })
        return true
      })
      if (done) sent += 1
    } catch (error) {
      logger.error('Bootcamp lagging digest failed', error, { 'stream.id': stream.id })
    }
  }
  return sent
}
