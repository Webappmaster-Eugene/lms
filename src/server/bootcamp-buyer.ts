import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { ownedProjectLink, webLink, type BootcampDefense, type DefenseOutcome } from '@/lib/bootcamp-defense'
import type { EnrollmentStatus } from '@/lib/bootcamp-enrollment'
import type { User } from '@/payload-types'
import { getAccountFreeze } from '@/server/account-freeze'
import { rowsOf } from '@/server/bootcamp-lead-events'
import { getBootcamps } from '@/server/bootcamps'

type Scope = { leadId: number } | { courseId: number }
type BuyerRow = {
  status: EnrollmentStatus
  course_id: number | null
  stream_group: string
  gitlab_username: string
  gitlab_project_url: string | null
  defense_outcome: DefenseOutcome | null
  defense_url: string | null
  defense_recorded_at: string | Date | null
}

export async function getBuyerEnrollment(payload: Payload, user: User | null, req: PayloadRequest, scope: Scope) {
  if (!user || user.isActive === false || (await getAccountFreeze(payload, user.id, req)).active) return null
  const adapter = payload.db as unknown as { drizzle: { execute(query: ReturnType<typeof sql>): Promise<unknown> } }
  // Владелец определяется учетной записью зачисления, даже если ссылку из письма переслали.
  const [row] = rowsOf<BuyerRow>(await adapter.drizzle.execute(sql`
    select e.status, e.manuals_course_id as course_id, e.stream_group,
      e.gitlab_username, e.gitlab_project_url, e.defense_outcome, e.defense_url, e.defense_recorded_at
    from bootcamp_enrollments e join bootcamp_leads l on l.id = e.lead_id
    where e.lms_user_id = ${user.id} and l.paid_at is not null and l.status <> 'refunded'
      and e.revoke_requested_at is null and e.revoked_at is null
      and ${'leadId' in scope ? sql`e.lead_id = ${scope.leadId}` : sql`e.manuals_course_id = ${scope.courseId}`}
    order by e.created_at desc, e.id desc limit 1`))
  if (!row) return null
  const course = (await getBootcamps(payload, user, req)).find(item => item.id === row.course_id)
  const projectUrl = row.status === 'done' ? ownedProjectLink(row.gitlab_project_url, row.stream_group, row.gitlab_username) : null
  const defenseUrl = webLink(row.defense_url)
  const defense: BootcampDefense | null = row.defense_outcome && defenseUrl && row.defense_recorded_at
    ? { outcome: row.defense_outcome, url: defenseUrl, recordedAt: new Date(row.defense_recorded_at).toISOString() } : null
  return { courseHref: course ? `/bootcamp/${encodeURIComponent(course.slug)}` : null, projectStatus: row.status, projectUrl, defense }
}
