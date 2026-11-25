import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import { notFound } from 'next/navigation'

import type { TutoringProgram } from '@/lib/tutoring'
import { rowsOf } from '@/server/bootcamp-lead-events'
import { requireTutoringProgram } from '@/server/tutoring-bootcamps'

export const taskLabels = {
  review: 'На проверке',
  project: 'Проблемы с доступом к GitLab',
  payment: 'Ожидают перевода',
}
export type TutoringTaskKind = keyof typeof taskLabels
export type TutoringTask = {
  kind: TutoringTaskKind
  member: number
  stream: number
  title: string
  email: string
  meeting: number | null
  amount: number | null
  total: number
}

export async function tutoringWorkQueue(program: TutoringProgram, filter?: string, rawPage?: string) {
  const { payload, isAdmin, base } = await requireTutoringProgram(program)
  if (!isAdmin) notFound()
  const kind = Object.hasOwn(taskLabels, filter ?? '') ? filter as TutoringTaskKind : null
  const parsed = Number(rawPage)
  const page = kind && Number.isSafeInteger(parsed) && parsed > 0 && parsed < 1_000_000 ? parsed : 1
  const size = kind ? 15 : 3
  const offset = (page - 1) * size
  const result = await payload.db.drizzle.execute(sql`
    with members as (
      select p.id as member, p.student_id, p.active, s.id as stream, s.title, s.status, u.email
      from tutoring_participants p join tutoring_streams s on s.id = p.stream_id
      join users u on u.id = p.student_id
      where s.program = ${program}
    ), project_problems as (
      select distinct on (m.student_id) m.member, j.updated_at
      from members m left join tutoring_projects j on j.student_id = m.student_id and j.program = ${program}
      where (m.active and m.status = 'active' and (j.id is null or j.state = 'failed'))
        or j.state = 'revoke_failed'
      order by m.student_id, m.active desc, m.member desc
    ), tasks as (
      select 'review' as kind, r.participant_id as member, r.meeting, null::numeric as amount, r.updated_at
      from tutoring_reviews r join members m on m.member = r.participant_id
      where r.status = 'submitted' and m.active and m.status = 'active'
      union all
      select 'payment', c.participant_id, c.meeting, c.amount_kopecks, c.updated_at
      from tutoring_charges c join members m on m.member = c.participant_id where c.status = 'due'
      union all
      select 'project', member, null, null, updated_at from project_problems
    ), ordered as (
      select t.*, row_number() over (partition by kind order by updated_at, member, meeting) as pos,
        count(*) over (partition by kind)::int as total from tasks t
      where ${kind}::text is null or kind = ${kind}
    )
    select t.kind, m.member, m.stream, m.title, m.email, t.meeting, t.amount, t.total
    from ordered t join members m on m.member = t.member
    where t.pos > ${offset} and t.pos <= ${offset + size}
    order by t.kind, t.pos
  `)
  return { base, kind, page, size, now: Date.now(), tasks: rowsOf<TutoringTask>(result) }
}
