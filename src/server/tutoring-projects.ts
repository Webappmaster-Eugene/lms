import 'server-only'

import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { parseVerdict } from '@/lib/bootcamp-progress'
import { isTutoringProgram, tutoringHttpsUrl, type TutoringProgram } from '@/lib/tutoring'
import type { User } from '@/payload-types'
import { adminLink } from '@/server/admin-telegram'
import { inTransaction, rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { findProgram } from '@/server/bootcamp-programs'
import { tutoringWebhookToken } from '@/server/bootcamp-worker-auth'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { TutoringProblem } from '@/server/tutoring'

export async function tutoringProject(payload: Payload, req: PayloadRequest, student: number, program: TutoringProgram) {
  const { docs } = await payload.find({
    collection: 'tutoring-projects', req, limit: 1, depth: 0, overrideAccess: true,
    where: { and: [{ student: { equals: student } }, { program: { equals: program } }] },
  })
  return docs[0] ?? null
}

export async function queueTutoringProject(payload: Payload, actor: User, streamId: number, participant: number, input: string) {
  return inTransaction(payload, actor, async req => {
    if ((await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') throw new TutoringProblem('Проект открывает наставник')
    const db = await txDb(req)
    await db.execute(sql`select id from tutoring_participants where id = ${participant} for update`)
    const member = await payload.findByID({ collection: 'tutoring-participants', id: participant, depth: 1, req, overrideAccess: true, disableErrors: true })
    const stream = member?.stream
    const student = member?.student
    if (!stream || typeof stream === 'number' || stream.id !== streamId || stream.status !== 'active' ||
      !member?.active || !student || typeof student === 'number' || student.isActive === false) {
      throw new TutoringProblem('Сначала откройте доступ ученика и потока')
    }
    await db.execute(sql`select id from users where id = ${student.id} for update`)
    const existing = await tutoringProject(payload, req, student.id, stream.program)
    if (existing && ['queued', 'running', 'ready', 'revoking'].includes(existing.state)) return existing
    const program = await findProgram(payload, stream.program, req)
    if (!program?.gitlabCourseProject || !program.gradingProject) throw new TutoringProblem('У программы не настроены стартер и грейдер GitLab')
    const { docs: [enrolled] } = await payload.find({
      collection: 'bootcamp-enrollments', req, limit: 1, depth: 0, overrideAccess: true,
      where: { lmsUser: { equals: student.id } },
    })
    const username = existing?.projectId ? existing.username : enrolled?.gitlabUsername || input.toLowerCase()
    if (!/^[a-z0-9][a-z0-9_.-]{1,59}$/.test(username)) throw new TutoringProblem('Укажите логин GitLab из латинских букв, цифр, точки, дефиса или подчёркивания')
    const group = existing?.projectId ? existing.group : `mentoring-${stream.program}`
    const [bootcampGroup, conflict] = await Promise.all([
      payload.find({ collection: 'bootcamp-streams', req, depth: 0, limit: 1, overrideAccess: true, where: { gitlabGroup: { equals: group } } }),
      payload.find({
        collection: 'tutoring-projects', req, depth: 0, limit: 1, overrideAccess: true,
        where: { and: [{ group: { equals: group } }, { username: { equals: username } }, { student: { not_equals: student.id } }] },
      }),
    ])
    if (group === program.gitlabStreamGroup || bootcampGroup.docs.length) throw new TutoringProblem('Группа GitLab менторства занята буткемпом')
    if (conflict.docs.length) throw new TutoringProblem('Такой логин уже используется в группе GitLab')
    const data = { student: student.id, program: stream.program, username, group,
      courseProject: program.gitlabCourseProject, gradingProject: program.gradingProject,
      state: 'queued' as const, attempts: 0, lease: null, leasedAt: null, error: null }
    return existing
      ? payload.update({ collection: 'tutoring-projects', id: existing.id, req, depth: 0, overrideAccess: true, data })
      : payload.create({ collection: 'tutoring-projects', req, depth: 0, overrideAccess: true, data })
  })
}

const activeMembership = sql`exists (
  select 1 from tutoring_participants m join tutoring_streams s on s.id = m.stream_id
  join users u on u.id = m.student_id
  where m.student_id = p.student_id and s.program::text = p.program::text
    and m.active = true and s.status = 'active' and u.is_active is distinct from false and u.role = 'student'
)`

export async function claimTutoringProject(payload: Payload) {
  return inTransaction(payload, null, async req => {
    const db = await txDb(req)
    await db.execute(sql`update tutoring_projects
      set state = case when state = 'revoking' then 'revoke_failed'::enum_tutoring_projects_state else 'failed'::enum_tutoring_projects_state end,
        lease = null, error = 'Исполнитель не отчитался после пяти попыток', updated_at = now()
      where state in ('running', 'revoking') and leased_at < now() - interval '10 minutes' and attempts >= 5`)
    const [next] = rowsOf<{ id: number; revoke: boolean; state: string }>(await db.execute(sql`
      select p.id, p.state, not ${activeMembership} as revoke from tutoring_projects p
      where (
        ${activeMembership} and (p.state in ('queued', 'revoked') or
          (p.state in ('running', 'revoking') and p.leased_at < now() - interval '10 minutes'))
      ) or (
        not ${activeMembership} and p.project_id is not null and p.gitlab_user_id is not null and (
          p.state in ('ready', 'queued', 'failed') or (p.state in ('running', 'revoking') and p.leased_at < now() - interval '10 minutes')
        )
      ) order by p.updated_at, p.id for update skip locked limit 1`))
    if (!next) return { job: null }
    const lease = randomUUID()
    const data = await payload.update({
      collection: 'tutoring-projects', id: Number(next.id), req, depth: 1, overrideAccess: true,
      data: { state: next.revoke ? 'revoking' : 'running', lease, leasedAt: new Date().toISOString() },
    })
    await db.execute(sql`update tutoring_projects set attempts = case when ${next.state} in ('queued', 'ready', 'revoked', 'failed') then 1 else attempts + 1 end where id = ${data.id}`)
    const student = data.student
    if (!student || typeof student === 'number') throw new Error('Tutoring project without a student')
    return { job: {
      id: data.id, lease, revoke: next.revoke, username: data.username, email: student.email,
      firstName: student.firstName || student.email, lastName: student.lastName || '',
      group: data.group, courseProject: data.courseProject, gradingProject: data.gradingProject,
      gitlabProjectId: data.projectId, gitlabUserId: data.gitlabUserId,
    }, webhook: { url: adminLink(`/api/tutoring/gitlab-events?project=${data.id}`), token: tutoringWebhookToken(data.id) } }
  })
}

type Json = Record<string, unknown>
const obj = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const idOf = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
const string = (value: unknown) => typeof value === 'string' ? value : ''

export async function reportTutoringProject(payload: Payload, id: number, input: unknown) {
  const body = obj(input)
  const status = string(body.status)
  if (!['running', 'done', 'failed', 'revoked', 'revoke_failed'].includes(status)) throw new EnrollmentInputError('Неизвестный статус', 400)
  return inTransaction(payload, null, async req => {
    const db = await txDb(req)
    await db.execute(sql`select id from tutoring_projects where id = ${id} for update`)
    const current = await payload.findByID({ collection: 'tutoring-projects', id, req, depth: 0, overrideAccess: true, disableErrors: true })
    const revoking = status === 'revoked' || status === 'revoke_failed'
    if (!current || !current.lease || current.lease !== body.lease || current.state !== (revoking ? 'revoking' : 'running')) {
      throw new EnrollmentInputError('Задание уже передано другому исполнителю или закрыто', 409)
    }
    const projectId = idOf(body.gitlabProjectId) ?? current.projectId
    const gitlabUserId = idOf(body.gitlabUserId) ?? current.gitlabUserId
    const url = string(body.gitlabProjectUrl) || current.projectUrl
    if ((current.projectId && projectId !== current.projectId) || (current.gitlabUserId && gitlabUserId !== current.gitlabUserId) ||
      (url && (!tutoringHttpsUrl(url) || !new URL(url).pathname.endsWith(`/${current.group}/${current.username}`)))) {
      throw new EnrollmentInputError('Учётка или адрес проекта не совпадают с заданием', 409)
    }
    if (status === 'done' && (!projectId || !gitlabUserId || !url)) throw new EnrollmentInputError('Проект или учётка не подтверждены', 400)
    const state = status === 'done' ? 'ready' : status as 'running' | 'failed' | 'revoked' | 'revoke_failed'
    await payload.update({ collection: 'tutoring-projects', id, req, overrideAccess: true,
      data: { state, projectId, gitlabUserId, projectUrl: url, lease: status === 'running' ? current.lease : null,
        leasedAt: status === 'running' ? new Date().toISOString() : null, error: string(body.error).slice(0, 1500) || null } })
    return { ok: true }
  })
}

export function tutoringMergeRequest(projectUrl: string, mr: string): number | null {
  if (!tutoringHttpsUrl(mr)) return null
  const base = new URL(projectUrl)
  const url = new URL(mr)
  const prefix = base.pathname.replace(/\/$/, '') + '/-/merge_requests/'
  if (base.origin !== url.origin || !url.pathname.startsWith(prefix)) return null
  const iid = url.pathname.slice(prefix.length)
  return /^[1-9]\d{0,9}$/.test(iid) ? Number(iid) : null
}

export async function tutoringVerdict(payload: Payload, req: PayloadRequest, project: number, mrIid: number) {
  const { docs } = await payload.find({
    collection: 'tutoring-checks', req, limit: 1, depth: 0, overrideAccess: true,
    where: { and: [{ project: { equals: project } }, { mrIid: { equals: mrIid } }] },
  })
  return docs[0] ?? null
}

export async function recordTutoringVerdict(payload: Payload, id: number, event: string | null, input: unknown) {
  const body = obj(input)
  const note = obj(body.object_attributes)
  const pushed = event === 'Merge Request Hook' && note.action === 'update' && typeof note.oldrev === 'string'
  const mr = pushed ? note : obj(body.merge_request)
  const author = obj(body.user)
  const iid = idOf(mr.iid)
  if (!iid) return false
  const trustedNote = event === 'Note Hook' && note.noteable_type === 'MergeRequest' && /^group_\d+_bot_/.test(string(author.username))
  const verdict = trustedNote ? parseVerdict(string(note.note)) : null
  const date = new Date(string(note.updated_at || note.created_at))
  if ((!verdict && !pushed) || !Number.isFinite(date.getTime())) return false

  return inTransaction(payload, null, async req => {
    const db = await txDb(req)
    await db.execute(sql`select id from tutoring_projects where id = ${id} for update`)
    const project = await payload.findByID({ collection: 'tutoring-projects', id, req, depth: 0, overrideAccess: true, disableErrors: true })
    if (!project || !isTutoringProgram(project.program) || !project.projectId || project.projectId !== idOf(obj(body.project).id) ||
      !project.projectUrl || tutoringMergeRequest(project.projectUrl, string(mr.url)) !== iid) return false
    const old = await tutoringVerdict(payload, req, id, iid)
    if (old && Date.parse(old.reportedAt) >= date.getTime()) return false
    if (!verdict && !old) return false
    const data = { project: id, mrIid: iid, stage: verdict?.week ?? old?.stage ?? 0, verdict: verdict?.verdict ?? 'pending',
      passed: verdict?.checksPassed ?? null, total: verdict?.checksTotal ?? null, reportedAt: date.toISOString() }
    if (old) await payload.update({ collection: 'tutoring-checks', id: old.id, req, overrideAccess: true, data })
    else await payload.create({ collection: 'tutoring-checks', req, overrideAccess: true, data })
    return true
  })
}
