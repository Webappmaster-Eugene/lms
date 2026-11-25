import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { relationId } from '@/lib/relation-id'
import { logger } from '@/lib/telemetry'
import type { User } from '@/payload-types'
import { lockLearningAccess } from '@/payload/hooks/learningAccessLock'
import { inTransaction, rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

export type CourseGrantChoice = { id: number; title: string; course: number }

const grantsFor = (student: number) => sql`
  select g.id, c.title, c.id as course from learning_access_grants g
  join courses c on g.rule_key = concat(g.user_id, ':courses:', c.id) and c.is_bootcamp
  where g.user_id = ${student} and g.effect = 'allow'`

export async function legacyCourseChoices(req: PayloadRequest, student: number) {
  if (!req.user || req.user.isActive === false || (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role !== 'admin') return []
  const db = req.payload.db as unknown as { drizzle: { execute(query: ReturnType<typeof sql>): Promise<unknown> } }
  return rowsOf<CourseGrantChoice>(await db.drizzle.execute(sql`${grantsFor(student)} order by c.title, c.id`))
}

export async function confirmLegacyCourse(payload: Payload, actor: User, enrollmentId: number, input: unknown) {
  const { grantId } = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  if (typeof grantId !== 'number' || !Number.isSafeInteger(grantId) || grantId <= 0) throw new EnrollmentInputError('Выберите назначение курса этому ученику')
  const course = await inTransaction(payload, actor, async req => {
    if (actor.isActive === false || (await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') throw new EnrollmentInputError('Курс подтверждает наставник', 403)
    const tx = await txDb(req)
    await tx.execute(sql`select id from bootcamp_enrollments where id = ${enrollmentId} for update`)
    const enrollment = await payload.findByID({ collection: 'bootcamp-enrollments', id: enrollmentId, depth: 0, req, overrideAccess: true, disableErrors: true })
    if (!enrollment?.lmsUser) throw new EnrollmentInputError('У этого зачисления нет учетной записи ученика', 409)
    const student = relationId(enrollment.lmsUser)
    await lockLearningAccess(req, student)
    const [grant] = rowsOf<CourseGrantChoice>(await tx.execute(sql`${grantsFor(student)} and g.id = ${grantId}`))
    if (!grant) throw new EnrollmentInputError('У ученика нет такого назначения. Обновите карточку.', 409)
    if (enrollment.manualsCourse) {
      if (relationId(enrollment.manualsCourse) !== grant.course) throw new EnrollmentInputError('Оплаченный курс уже закреплен', 409)
      return grant.course
    }
    await payload.update({ collection: 'bootcamp-enrollments', id: enrollmentId, data: { manualsCourse: grant.course }, req, overrideAccess: true })
    return grant.course
  })
  logger.info('Confirmed paid course for historical bootcamp enrollment', { 'enrollment.id': enrollmentId, 'course.id': course, 'actor.id': actor.id })
  return { course }
}
