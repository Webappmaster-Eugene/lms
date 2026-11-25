import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'
import { parseDefense, type BootcampDefense } from '@/lib/bootcamp-defense'
import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { relationId } from '@/lib/relation-id'
import type { User } from '@/payload-types'
import { lockLearningAccess } from '@/payload/hooks/learningAccessLock'
import { inTransaction, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

export async function recordDefense(payload: Payload, actor: User, id: number, input: unknown): Promise<BootcampDefense> {
  const change = parseDefense(input)
  return inTransaction(payload, actor, async req => {
    if (actor.isActive === false || (await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') {
      throw new EnrollmentInputError('Защиту принимает наставник', 403)
    }
    const db = await txDb(req)
    // Возврат денег блокирует сначала заявку, затем зачисление.
    await db.execute(sql`select l.id from bootcamp_leads l join bootcamp_enrollments e on e.lead_id = l.id where e.id = ${id} for update of l`)
    await db.execute(sql`select id from bootcamp_enrollments where id = ${id} for update`)
    const enrollment = await payload.findByID({ collection: 'bootcamp-enrollments', id, depth: 0, req, overrideAccess: true, disableErrors: true })
    if (!enrollment) throw new EnrollmentInputError('Зачисление не найдено', 404)
    const lead = await payload.findByID({ collection: 'bootcamp-leads', id: relationId(enrollment.lead), depth: 0, req, overrideAccess: true })
    if (!lead.paidAt || lead.status === 'refunded' || enrollment.status !== 'done' || !enrollment.lmsUser || enrollment.revokeRequestedAt || enrollment.revokedAt) {
      throw new EnrollmentInputError('Защиту можно принять у оплаченного и зачисленного участника с действующим доступом', 409)
    }
    if (enrollment.defenseOutcome === change.outcome && enrollment.defenseUrl === change.url && enrollment.defenseRecordedAt) {
      return { outcome: change.outcome, url: change.url, recordedAt: enrollment.defenseRecordedAt }
    }
    if ((enrollment.defenseRecordedAt ?? '') !== change.revision || (enrollment.defenseOutcome === 'passed' && change.outcome !== 'passed')) {
      throw new EnrollmentInputError('Результат уже сохранен. Обновите карточку.', 409)
    }
    if (change.outcome === 'passed') {
      if (!enrollment.manualsCourse) throw new EnrollmentInputError('У старого зачисления не подтвержден оплаченный курс. Перед выпуском сверьте назначение в карточке ученика.', 409)
      const course = relationId(enrollment.manualsCourse)
      const studentId = relationId(enrollment.lmsUser)
      await lockLearningAccess(req, studentId)
      const grant = (await payload.find({ collection: 'learning-access-grants', where: { ruleKey: { equals: `${studentId}:courses:${course}` } }, limit: 1, depth: 0, req, overrideAccess: true })).docs[0]
      if (!grant || grant.effect !== 'allow') throw new EnrollmentInputError('У ученика закрыт доступ к курсу. Проверьте назначения в карточке ученика.', 409)
      if (grant.expiresAt) {
        if (!grant.note?.startsWith('Буткемп: поток ')) {
          throw new EnrollmentInputError('Срок доступа задан отдельным назначением. Проверьте его перед выпуском.', 409)
        }
        await payload.update({ collection: 'learning-access-grants', id: grant.id, data: { expiresAt: null }, req, overrideAccess: false })
      }
    }
    const recordedAt = new Date().toISOString()
    await payload.update({ collection: 'bootcamp-enrollments', id, depth: 0, req, overrideAccess: true, data: {
      defenseOutcome: change.outcome, defenseUrl: change.url, defenseRecordedAt: recordedAt, defenseMentor: actor.id,
      ...(change.outcome === 'passed' ? { accessUntil: null } : {}),
    } })
    return { outcome: change.outcome, url: change.url, recordedAt }
  })
}
