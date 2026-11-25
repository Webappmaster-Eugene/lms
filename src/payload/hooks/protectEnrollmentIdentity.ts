import { sql } from '@payloadcms/db-postgres'
import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

import { rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

const address = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : ''

export async function recordEnrollmentIdentity(req: PayloadRequest, studentId: number, previous: string | null, email: string | null) {
  await req.payload.create({ collection: 'learning-access-audit', req, overrideAccess: true, data: {
    // Нулевой id означает изменение системным процессом без сессии пользователя.
    actorId: req.user?.id ?? 0, userId: studentId, operation: 'update', targetType: 'enrollmentIdentity', targetId: studentId,
    effect: email ? 'allow' : 'deny', previous: { email: previous }, current: { email },
  } })
}

export async function lastConfirmedEnrollmentEmail(req: PayloadRequest, studentId: number) {
  // Payload при создании сессии целиком переписывает строку users.
  // Событие в отдельной таблице защищает от повторной выдачи по старой копии этой строки.
  const { docs: [event] } = await req.payload.find({ collection: 'learning-access-audit', req, overrideAccess: true,
    depth: 0, limit: 1, sort: '-id', select: { effect: true, current: true },
    where: { and: [{ userId: { equals: studentId } }, { targetType: { equals: 'enrollmentIdentity' } }] },
  })
  const current = event?.current
  return event?.effect === 'allow' && current && typeof current === 'object' && !Array.isArray(current) && typeof current.email === 'string'
    ? current.email : null
}

export async function hasEnrollmentIdentity(req: PayloadRequest, studentId: number, expectedEmail: string) {
  const email = address(expectedEmail)
  const db = await txDb(req)
  const [match] = rowsOf<{ id: number }>(await db.execute(sql`
    select id from users where id = ${studentId} and is_active is true
      and lower(email) = ${email} and enrollment_identity_email = lower(email)
    for share
  `))
  return Boolean(match && await lastConfirmedEnrollmentEmail(req, studentId) === email)
}

/** lockLearningModeChange уже заблокировал строку и загрузил актуальный originalDoc. */
export const protectEnrollmentIdentity: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  if (operation === 'create') {
    const sendsInvite = !req.context?.skipHooks && !req.context?.suppressInvite
    const trusted = sendsInvite && req.user?.isActive !== false && req.user &&
      (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role === 'admin'
    data.enrollmentIdentityEmail = trusted && data.role !== 'admin' ? address(data.email) || null : null
  } else if (originalDoc) {
    const oldEmail = address(originalDoc.email)
    const nextEmail = data.email === undefined ? oldEmail : address(data.email)
    data.enrollmentIdentityEmail = nextEmail === oldEmail ? originalDoc.enrollmentIdentityEmail ?? null : null
    if (nextEmail !== oldEmail) await recordEnrollmentIdentity(req, originalDoc.id, originalDoc.enrollmentIdentityEmail ?? null, null)
  }
  return data
}

export async function recordInvitedEnrollmentIdentity(req: PayloadRequest, studentId: number) {
  if (!req.user) return
  const db = await txDb(req)
  const [saved] = rowsOf<{ email: string | null }>(await db.execute(sql`select enrollment_identity_email as email from users where id = ${studentId}`))
  if (saved?.email) await recordEnrollmentIdentity(req, studentId, null, saved.email)
}
