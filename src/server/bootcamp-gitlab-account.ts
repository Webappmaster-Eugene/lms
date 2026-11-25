import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { lockLearningAccess } from '@/payload/hooks/learningAccessLock'
import type { BootcampLead } from '@/payload-types'
import { rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

const reportedIds = (owner: number | ReturnType<typeof sql>) => sql`
    select gitlab_user_id as gid from bootcamp_enrollments where lms_user_id = ${owner} and status = 'done' and gitlab_user_id > 0
    union select gitlab_user_id from tutoring_projects where student_id = ${owner} and state in ('ready', 'revoked') and gitlab_user_id > 0`

/** Только однозначные привязки исполнителя. Почта сама по себе не подтверждает владение GitLab. */
export const verifiedGitlabIds = (owner: number | ReturnType<typeof sql>) => sql`
  select links.gid from (${reportedIds(owner)}) links
  where not exists (select from bootcamp_enrollments e where e.gitlab_user_id=links.gid and e.lms_user_id is distinct from ${owner})
    and not exists (select from tutoring_projects t where t.gitlab_user_id=links.gid and t.student_id is distinct from ${owner})`

/** Неизвестная форма старого журнала требует проверки на стороне GitLab. */
export const noReportedGitlabWork = (steps: ReturnType<typeof sql>) => sql`case
  when ${steps} is null then true when jsonb_typeof(${steps}) <> 'array' then false
  else not exists (select from jsonb_array_elements(${steps}) step where step->>'key' is null or
    (step->>'key' like 'gitlab_%' and step->>'state' is distinct from 'pending')) end`

/** Вторая оплаченная программа ждет только пока у первой выдачи действительно есть работа. */
export async function advanceWaitingAccounts(payload: Payload) {
  const tx = payload.db as unknown as { drizzle: { execute(query: ReturnType<typeof sql>): Promise<unknown> } }
  await tx.drizzle.execute(sql`
    with candidates as (
      select distinct on (lms_user_id) id, lms_user_id from bootcamp_enrollments
      where status = 'queued' and needs_verified_gitlab_account and gitlab_user_id is null and lms_user_id is not null
        and revoke_requested_at is null order by lms_user_id, id
    )
    update bootcamp_enrollments c set needs_verified_gitlab_account = false, error = null, updated_at = now()
    from candidates w where c.id = w.id and c.status = 'queued' and c.gitlab_user_id is null
      and exists (select from bootcamp_enrollments b where b.lms_user_id = w.lms_user_id and b.id < w.id
        and b.revoked_at is not null and b.needs_verified_gitlab_account is not true)
      and not exists (select from tutoring_projects t where t.student_id = w.lms_user_id)
      and not exists (select from bootcamp_enrollments b where b.lms_user_id = w.lms_user_id and b.id <> w.id and (
        b.started_at is not null or coalesce(b.attempts, 0) > 0 or b.gitlab_user_id is not null or b.gitlab_project_id is not null
        or b.status = 'done' or (b.needs_verified_gitlab_account is not true and b.revoked_at is null)
        or not (${noReportedGitlabWork(sql`b.steps`)})
      ))`)
  await tx.drizzle.execute(sql`
    update bootcamp_enrollments c set status = 'failed', finished_at = now(), updated_at = now(),
      error = 'Первая выдача не подтвердила учетную запись GitLab. Проверьте предыдущий проект, затем повторите выдачу.'
    where c.status = 'queued' and c.needs_verified_gitlab_account and c.gitlab_user_id is null and c.revoke_requested_at is null
      and not exists (select from bootcamp_enrollments b where b.id <> c.id and b.lms_user_id = c.lms_user_id
        and b.status in ('queued','running') and b.revoke_requested_at is null and b.needs_verified_gitlab_account is not true)
      and not exists (select from tutoring_projects t where t.student_id = c.lms_user_id and t.state in ('queued','running'))
      and not exists (select from (${verifiedGitlabIds(sql`c.lms_user_id`)}) known having count(*) = 1)`)
}

export async function reserveGitlabIdentity(req: PayloadRequest, lead: BootcampLead, username: string, group: string) {
  const tx = await txDb(req)
  // Обе покупки с одним адресом, а также разные адреса, выбравшие одинаковый логин, проверяются последовательно.
  await tx.execute(sql`select pg_advisory_xact_lock(7290, hashtext(lower(${lead.email})))`)
  await tx.execute(sql`select pg_advisory_xact_lock(7291, hashtext(${username}))`)
  const email = lead.email.toLowerCase()
  const [owner] = rowsOf<{ id: number }>(await tx.execute(sql`select id from users where email = ${email}`))
  if (owner) {
    await lockLearningAccess(req, owner.id)
    const locked = rowsOf(await tx.execute(sql`select id from users where id = ${owner.id} and email = ${email} for share`))
    if (!locked.length) throw new EnrollmentInputError('Почта ученика изменилась. Обновите заявку.', 409)
    if ((await getAuthoritativeLearningPolicy(req.payload, owner.id, req)).role !== 'student') {
      throw new EnrollmentInputError('Этот адрес принадлежит администратору. Для обучения и выдачи проекта укажите почту отдельной учетной записи ученика.', 409)
    }
  }
  const [taken] = rowsOf(await tx.execute(sql`
    select id from bootcamp_enrollments where gitlab_username = ${username}
      and (stream_group = ${group} or lms_user_id is distinct from ${owner?.id ?? null}::integer or lms_user_id is null) limit 1`))
  if (taken) throw new EnrollmentInputError('Имя проекта занято в этом потоке или закреплено за другим учеником', 409)
  const [reservation] = rowsOf(await tx.execute(sql`
    select id from bootcamp_leads where id <> ${lead.id} and status in ('admitted', 'paid')
      and admission->'enrollment'->>'username' = ${username}
      and (lower(email) <> lower(${lead.email}) or admission->'enrollment'->>'group' = ${group}) limit 1`))
  if (reservation) throw new EnrollmentInputError('Это имя проекта уже указано в другой заявке. Выберите другое.', 409)
  if (!owner) return { needsVerification: false, gitlabUserId: null }
  const [identity] = rowsOf<{ total: number; gid: number | null; observed: number }>(await tx.execute(sql`
    select count(*)::int as total, min(gid) as gid, (select count(*)::int from (${reportedIds(owner.id)}) all_links) as observed
    from (${verifiedGitlabIds(owner.id)}) verified`))
  if (identity.observed !== identity.total || identity.total > 1) throw new EnrollmentInputError('Привязка ученика к GitLab неоднозначна. Сверьте учетную запись перед зачислением.', 409)
  if (identity.gid) return { needsVerification: true, gitlabUserId: Number(identity.gid) }
  const [previous] = rowsOf(await tx.execute(sql`
    select id from bootcamp_enrollments where lms_user_id = ${owner.id} and revoked_at is null and revoke_requested_at is null
    union all select id from tutoring_projects where student_id = ${owner.id} and (state in ('queued','running','failed') or gitlab_user_id > 0) limit 1`))
  return { needsVerification: Boolean(previous), gitlabUserId: null }
}
