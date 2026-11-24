import { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

import { txDb } from '@/server/bootcamp-lead-events'

const automaticUsernamePrefix = 'mc-student-'

export const automaticTutoringUsername = (student: number) => automaticUsernamePrefix + student

export function groupUsedByBootcamp(group: string | ReturnType<typeof sql>) {
  return sql`(exists (select 1 from bootcamp_streams b where b.gitlab_group = ${group})
    or exists (select 1 from bootcamp_programs b where b.gitlab_stream_group = ${group}))`
}

// У старого участия может не быть снимка адреса. Доверяем текущему адресу
// только при доказуемой неизменности профиля или подтверждённой связи с GitLab.
export const approvedInviteEmail = sql`coalesce(m.gitlab_invite_email, case when u.updated_at < m.created_at or exists (
  select 1 from bootcamp_enrollments e where e.lms_user_id = u.id and e.gitlab_user_id > 0
    and lower(e.email) = lower(u.email)
) then lower(u.email) end)`

/**
 * Участие и очередь меняются в одной транзакции. При опросе исполнитель также
 * подбирает по одному ученику, добавленному до выката или до настройки программы.
 */
export async function enqueueMissingTutoringProjects(req: PayloadRequest, scope?: { participant: number } | { stream: number }) {
  const db = await txDb(req)
  const restriction = !scope ? sql`` : 'participant' in scope ? sql`and m.id = ${scope.participant}` : sql`and s.id = ${scope.stream}`
  await db.execute(sql`
    insert into tutoring_projects (student_id, program, username, "group", course_project, grading_project, gitlab_user_id, gitlab_email)
    select m.student_id, s.program::text::enum_tutoring_projects_program, identity.username,
           c.mentoring_gitlab_group, c.gitlab_course_project, c.grading_project, known.gitlab_user_id, ${approvedInviteEmail}
      from tutoring_participants m
      join tutoring_streams s on s.id = m.stream_id
      join users u on u.id = m.student_id
      join bootcamp_programs c on c.key = s.program::text
      left join lateral (
        select accounts.username, accounts.gitlab_user_id from (
          select e.gitlab_username as username, e.gitlab_user_id, 0 as priority, e.id
            from bootcamp_enrollments e where e.lms_user_id = m.student_id and e.gitlab_user_id > 0
          union all
          select p.username, p.gitlab_user_id, 1 as priority, p.id
            from tutoring_projects p where p.student_id = m.student_id and p.gitlab_user_id > 0
        ) accounts
        order by accounts.priority, accounts.id limit 1
      ) known on true
      cross join lateral (
        select coalesce(known.username, ${automaticUsernamePrefix}::text || m.student_id::text) as username
      ) identity
     where s.status = 'active' and m.active and u.is_active is distinct from false and u.role = 'student'
       ${restriction}
       and ${approvedInviteEmail} is not null
       and c.mentoring_gitlab_group <> '' and c.mentoring_grader_user_id > 0
       and c.gitlab_course_project <> '' and c.grading_project <> ''
       and not ${groupUsedByBootcamp(sql`c.mentoring_gitlab_group`)}
       and not exists (
         select 1 from tutoring_projects p where (p.student_id = m.student_id and p.program::text = s.program::text)
           or (p."group" = c.mentoring_gitlab_group and p.username = identity.username)
       )
     order by m.id
     ${scope ? sql`` : sql`limit 1`}
     on conflict do nothing
  `)
}
