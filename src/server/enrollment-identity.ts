import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { AssignmentInputError } from '@/components/learning-access/contracts'
import type { User } from '@/payload-types'
import { lastConfirmedEnrollmentEmail, recordEnrollmentIdentity } from '@/payload/hooks/protectEnrollmentIdentity'
import { inTransaction, rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

export { hasEnrollmentIdentity } from '@/payload/hooks/protectEnrollmentIdentity'

type LockedStudent = { email: string; enrollment_identity_email: string | null; updated_at: Date | string; is_active: boolean }

export async function confirmEnrollmentIdentity(payload: Payload, actor: User, studentId: number, expectedEmail: string, revision?: string) {
  return inTransaction(payload, actor, async req => {
    if (actor.isActive === false || (await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') {
      throw new AssignmentInputError('Связь адреса с учеником подтверждает администратор', 403)
    }
    const db = await txDb(req)
    const [student] = rowsOf<LockedStudent>(await db.execute(sql`
      select email, enrollment_identity_email, updated_at, is_active from users where id = ${studentId} for update
    `))
    if (!student || !student.is_active || (await getAuthoritativeLearningPolicy(payload, studentId, req)).role !== 'student') {
      throw new AssignmentInputError('Выберите действующую учетную запись ученика', 409)
    }
    const email = student.email.toLowerCase()
    if (expectedEmail.trim().toLowerCase() !== email) throw new AssignmentInputError('Адрес изменился. Обновите карточку и сверьте его еще раз.', 409)
    if (student.enrollment_identity_email === email && await lastConfirmedEnrollmentEmail(req, studentId) === email) return
    if (revision !== undefined && new Date(student.updated_at).toISOString() !== revision) {
      throw new AssignmentInputError('Карточка изменилась. Обновите страницу и повторите сверку.', 409)
    }
    await db.execute(sql`update users set enrollment_identity_email = ${email}, updated_at = now() where id = ${studentId}`)
    await recordEnrollmentIdentity(req, studentId, student.enrollment_identity_email, email)
  })
}
