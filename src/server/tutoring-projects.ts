import 'server-only'

import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { parseVerdict } from '@/lib/bootcamp-progress'
import { isTutoringProgram, TUTORING_GITLAB_ATTEMPTS, tutoringHttpsUrl } from '@/lib/tutoring'
import type { User } from '@/payload-types'
import { adminLink } from '@/server/admin-telegram'
import { inTransaction, rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { findProgram } from '@/server/bootcamp-programs'
import { tutoringWebhookToken } from '@/server/bootcamp-worker-auth'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { mergeRequestHead, tutoringMergeRequestSnapshot, updateTutoringMergeRequest } from '@/server/tutoring-merge-requests'
import { TutoringProblem } from '@/server/tutoring'
import { tutoringMergeRequest, tutoringProject } from '@/server/tutoring-student-project'
import { approvedInviteEmail, automaticTutoringUsername, enqueueMissingTutoringProjects, groupUsedByBootcamp } from '@/server/tutoring-project-queue'

export { tutoringMergeRequest, tutoringProject }

export async function queueTutoringProject(payload: Payload, actor: User, streamId: number, participant: number, inviteEmail = '') {
  return inTransaction(payload, actor, async req => {
    if ((await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') throw new TutoringProblem('Проект открывает наставник')
    const db = await txDb(req)
    await db.execute(sql`select id from tutoring_participants where id = ${participant} for update`)
    const member = await payload.findByID({ collection: 'tutoring-participants', id: participant, depth: 1, req, overrideAccess: true, disableErrors: true })
    const stream = member?.stream
    const student = member?.student
    if (!stream || typeof stream === 'number' || stream.id !== streamId || stream.status !== 'active' ||
      !member?.active || !student || typeof student === 'number' || student.isActive === false || student.role !== 'student') {
      throw new TutoringProblem('Сначала откройте доступ ученика и потока')
    }
    if (inviteEmail && !member.gitlabInviteEmail) {
      const [account] = rowsOf<{ email: string }>(await db.execute(sql`select email from users where id = ${student.id} for share`))
      if (account?.email.toLowerCase() !== inviteEmail.trim().toLowerCase()) {
        throw new TutoringProblem('Подтверждённая почта должна совпадать с адресом ученика в LMS')
      }
      await payload.update({ collection: 'tutoring-participants', id: member.id, req, overrideAccess: true,
        data: { gitlabInviteEmail: account.email.toLowerCase() } })
    }
    await enqueueMissingTutoringProjects(req, { participant })
    await db.execute(sql`select id from tutoring_projects where student_id = ${student.id} and program = ${stream.program} for update`)
    const existing = await tutoringProject(payload, req, student.id, stream.program)
    if (existing && ['queued', 'running', 'ready', 'revoking'].includes(existing.state)) return existing
    const program = await findProgram(payload, stream.program, req)
    if (!program?.gitlabCourseProject || !program.gradingProject || !program.mentoringGitlabGroup || !program.mentoringGraderUserId) {
      throw new TutoringProblem('Для менторства не настроена приватная группа GitLab и учётка автопроверки')
    }
    const group = existing?.projectId ? existing.group : program.mentoringGitlabGroup
    const [shared] = rowsOf<{ occupied: boolean }>(await db.execute(sql`select ${groupUsedByBootcamp(group)} as occupied`))
    if (shared.occupied) throw new TutoringProblem('Группа GitLab менторства занята буткемпом')
    if (!existing) throw new TutoringProblem('Проверьте почту приглашения и настройки группы GitLab')
    return payload.update({ collection: 'tutoring-projects', id: existing.id, req, depth: 0, overrideAccess: true, data: {
      group, courseProject: program.gitlabCourseProject, gradingProject: program.gradingProject,
      state: 'queued', attempts: 0, lease: null, leasedAt: null, error: null,
    } })
  })
}

const activeMembership = sql`exists (
  select 1 from tutoring_participants m join tutoring_streams s on s.id = m.stream_id
  join users u on u.id = m.student_id
  where m.student_id = p.student_id and s.program::text = p.program::text
    and m.active = true and s.status = 'active' and u.is_active is distinct from false and u.role = 'student'
)`

export async function retryTutoringRevocation(payload: Payload, actor: User, streamId: number, participant: number) {
  return inTransaction(payload, actor, async req => {
    if ((await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') throw new TutoringProblem('Отзыв доступа повторяет наставник')
    const db = await txDb(req)
    const retried = rowsOf<{ id: number }>(await db.execute(sql`
      update tutoring_projects p set attempts = 0, leased_at = null, updated_at = now()
        from tutoring_participants m join tutoring_streams s on s.id = m.stream_id
       where m.id = ${participant} and s.id = ${streamId} and m.student_id = p.student_id
         and s.program::text = p.program::text and not ${activeMembership}
         and p.state = 'revoke_failed' and p.attempts >= ${TUTORING_GITLAB_ATTEMPTS}
         and p.project_id is not null and p.gitlab_user_id is not null
       returning p.id
    `))
    if (!retried.length) throw new TutoringProblem('Проверьте состояние проекта и доступ ученика к другим потокам программы')
  })
}

export async function claimTutoringProject(payload: Payload) {
  return inTransaction(payload, null, async req => {
    const db = await txDb(req)
    await enqueueMissingTutoringProjects(req)
    await db.execute(sql`update tutoring_projects
      set state = case when state = 'revoking' then 'revoke_failed'::enum_tutoring_projects_state else 'failed'::enum_tutoring_projects_state end,
        lease = null, error = 'Исполнитель не отчитался после пяти попыток', updated_at = now()
      where state in ('running', 'revoking') and leased_at < now() - interval '10 minutes' and attempts >= ${TUTORING_GITLAB_ATTEMPTS}`)
    const [next] = rowsOf<{ id: number; revoke: boolean; state: string; shared: boolean; email: string | null }>(await db.execute(sql`
      select p.id, p.state, not ${activeMembership} as revoke, ${groupUsedByBootcamp(sql`p."group"`)} as shared,
        coalesce(p.gitlab_email, (
          select ${approvedInviteEmail} from tutoring_participants m join tutoring_streams s on s.id = m.stream_id
            join users u on u.id = m.student_id where m.student_id = p.student_id and s.program::text = p.program::text
            and s.status = 'active' and m.active and ${approvedInviteEmail} is not null order by m.id limit 1
        )) as email from tutoring_projects p
      where (
        ${activeMembership} and (p.state in ('queued', 'revoked', 'revoke_failed') or
          (p.state in ('running', 'revoking') and p.leased_at < now() - interval '10 minutes'))
      ) or (
        not ${activeMembership} and p.project_id is not null and p.gitlab_user_id is not null and (
          p.state in ('ready', 'queued', 'failed') or (p.state in ('running', 'revoking') and p.leased_at < now() - interval '10 minutes') or
          (p.state = 'revoke_failed' and p.attempts < ${TUTORING_GITLAB_ATTEMPTS}
            and (p.leased_at is null or p.leased_at + p.attempts * interval '1 minute' <= now()))
        )
      ) order by revoke desc, p.updated_at, p.id for update skip locked limit 1`))
    if (!next) return { job: null }
    if (!next.revoke && (next.shared || !next.email)) {
      await payload.update({ collection: 'tutoring-projects', id: next.id, req, overrideAccess: true,
        data: { state: 'failed', lease: null, error: next.shared ? 'Группа GitLab менторства занята буткемпом' : 'Подтвердите почту приглашения ученика в GitLab' } })
      return { job: null }
    }
    const lease = randomUUID()
    const data = await payload.update({
      collection: 'tutoring-projects', id: Number(next.id), req, depth: 1, overrideAccess: true,
      data: { state: next.revoke ? 'revoking' : 'running', gitlabEmail: next.email, lease, leasedAt: new Date().toISOString() },
    })
    const retry = next.revoke ? ['revoking', 'revoke_failed'].includes(next.state) : next.state === 'running'
    await db.execute(sql`update tutoring_projects set attempts = ${retry ? sql`attempts + 1` : 1} where id = ${data.id}`)
    const program = next.revoke ? null : await findProgram(payload, data.program, req)
    const student = data.student
    if (!student || typeof student === 'number') throw new Error('Tutoring project without a student')
    return { job: {
      id: data.id, lease, revoke: next.revoke, username: data.username, email: data.gitlabEmail ?? student.email,
      autoResolveUsername: data.username === automaticTutoringUsername(student.id),
      firstName: student.firstName || data.gitlabEmail || student.email, lastName: student.lastName || '',
      group: data.group, courseProject: data.courseProject, gradingProject: data.gradingProject, graderUserId: program?.mentoringGraderUserId ?? null,
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
        leasedAt: status === 'running' || status === 'revoke_failed' ? new Date().toISOString() : null,
        error: string(body.error).slice(0, 1500) || null } })
    return { ok: true }
  })
}

export async function tutoringVerdict(payload: Payload, req: PayloadRequest, project: number, mrIid: number) {
  const { docs } = await payload.find({
    collection: 'tutoring-checks', req, limit: 1, depth: 0, overrideAccess: true,
    where: { and: [{ project: { equals: project } }, { mrIid: { equals: mrIid } }] },
  })
  return docs[0] ?? null
}

export async function recordTutoringGitlabEvent(payload: Payload, id: number, event: string | null, input: unknown) {
  const body = obj(input)
  const note = obj(body.object_attributes)
  const mrEvent = event === 'Merge Request Hook'
  const pushed = mrEvent && note.action === 'update' && typeof note.oldrev === 'string'
  const mr = mrEvent ? note : obj(body.merge_request)
  const author = obj(body.user)
  const iid = idOf(mr.iid)
  if (!iid) return false
  const trustedNote = event === 'Note Hook' && note.noteable_type === 'MergeRequest'
  const verdict = trustedNote ? parseVerdict(string(note.note)) : null
  const date = new Date(string(note.updated_at || note.created_at))
  if ((!verdict && !mrEvent) || !Number.isFinite(date.getTime())) return false

  return inTransaction(payload, null, async req => {
    const db = await txDb(req)
    await db.execute(sql`select id from tutoring_projects where id = ${id} for update`)
    const project = await payload.findByID({ collection: 'tutoring-projects', id, req, depth: 0, overrideAccess: true, disableErrors: true })
    if (!project || !isTutoringProgram(project.program) || !project.projectId || project.projectId !== idOf(obj(body.project).id) ||
      !project.projectUrl || tutoringMergeRequest(project.projectUrl, string(mr.url)) !== iid) return false
    if (verdict) {
      const program = await findProgram(payload, project.program, req)
      if (!program?.mentoringGraderUserId || idOf(author.id) !== program.mentoringGraderUserId) return false
    }
    const at = date.toISOString()
    const snapshot = await tutoringMergeRequestSnapshot(payload, req, id, iid)
    const snapshotChanged = mrEvent && await updateTutoringMergeRequest(payload, req, project, iid, mr, at, snapshot)
    if (!pushed && !verdict) return snapshotChanged
    const old = await tutoringVerdict(payload, req, id, iid)
    const eventHead = mergeRequestHead(mr)
    if (pushed && !snapshotChanged && snapshot?.headSha && eventHead && snapshot.headSha !== eventHead && at <= snapshot.eventAt) return false
    if (!verdict && (!old || (old.commitSha && eventHead?.startsWith(old.commitSha)))) return snapshotChanged
    const marker = verdict ? /<!--\s*grader:\d{1,2}:([0-9a-f]{7,64})\s*-->/i.exec(string(note.note))?.[1].toLowerCase() : null
    if (verdict && marker) {
      if ((eventHead && !eventHead.startsWith(marker)) ||
          (snapshot?.headSha && !snapshot.headSha.startsWith(marker) &&
           !(eventHead && Date.parse(string(mr.updated_at)) > Date.parse(snapshot.eventAt)))) return false
    }
    const superseded = pushed && snapshotChanged && eventHead && old?.commitSha && snapshot?.headSha?.startsWith(old.commitSha)
    const confirmsPending = old?.verdict === 'pending' && marker && snapshot?.headSha?.startsWith(marker)
    if (!superseded && old && (old.reportedAt > at || (old.reportedAt === at && !confirmsPending))) return snapshotChanged
    const data = { project: id, mrIid: iid, stage: verdict?.week ?? old?.stage ?? 0, verdict: verdict?.verdict ?? 'pending',
      passed: verdict?.checksPassed ?? null, total: verdict?.checksTotal ?? null, commitSha: marker ?? null, reportedAt: at }
    if (old) await payload.update({ collection: 'tutoring-checks', id: old.id, req, overrideAccess: true, data })
    else await payload.create({ collection: 'tutoring-checks', req, overrideAccess: true, data })
    return true
  })
}
