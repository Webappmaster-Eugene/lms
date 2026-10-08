import { Forbidden, ValidationError, type CollectionAfterChangeHook, type CollectionAfterDeleteHook, type CollectionBeforeValidateHook, type PayloadRequest } from 'payload'

import { learningRelationId, learningTargetCollections, type LearningTargetCollection } from '@/lib/learning-access'
import { recordLearningAssignment } from '@/lib/learning-observability'
import { invalidateLearningAccess } from '@/server/learning-access'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

type GrantDocument = {
  id: number
  user: unknown
  target: { relationTo: LearningTargetCollection; value: unknown }
  effect: 'allow' | 'deny'
  startsAt?: string | null
  expiresAt?: string | null
}

export const validateLearningGrant: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!req.user || (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role !== 'admin') throw new Forbidden(req.t)
  if (!data) return data
  const merged = { ...originalDoc, ...data }
  const userId = learningRelationId(merged.user)
  const target = merged.target as GrantDocument['target'] | undefined
  const targetId = learningRelationId(target?.value)
  if (userId === null || targetId === null || !target || !learningTargetCollections.includes(target.relationTo)) {
    throw new ValidationError({ collection: 'learning-access-grants', errors: [
      ...(userId === null ? [{ path: 'user', message: 'Выберите ученика' }] : []),
      ...(targetId === null || !target || !learningTargetCollections.includes(target.relationTo) ? [{ path: 'target', message: 'Выберите существующую учебную цель' }] : []),
    ] })
  }
  const startsAt = merged.startsAt ? Date.parse(merged.startsAt) : null
  const expiresAt = merged.expiresAt ? Date.parse(merged.expiresAt) : null
  if ((startsAt !== null && !Number.isFinite(startsAt)) || (expiresAt !== null && !Number.isFinite(expiresAt)) || (startsAt !== null && expiresAt !== null && expiresAt <= startsAt)) {
    throw new ValidationError({ collection: 'learning-access-grants', errors: [{ path: 'expiresAt', message: 'Окончание доступа должно быть позже начала; даты должны быть корректны' }] })
  }
  data.ruleKey = `${userId}:${target.relationTo}:${targetId}`
  return data
}

async function auditGrant(req: PayloadRequest, doc: GrantDocument, operation: 'create' | 'update' | 'delete', previous?: GrantDocument) {
  const actorId = learningRelationId(req.user)
  const userId = learningRelationId(doc.user)
  const targetId = learningRelationId(doc.target.value)
  if (!req.user || (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role !== 'admin' || actorId === null || userId === null || targetId === null) throw new Forbidden(req.t)
  await req.payload.create({
    collection: 'learning-access-audit', overrideAccess: true, req,
    data: { actorId, userId, grantId: doc.id, operation, targetType: doc.target.relationTo, targetId, effect: doc.effect,
      previous: previous ? { userId: learningRelationId(previous.user), targetType: previous.target.relationTo, targetId: learningRelationId(previous.target.value), effect: previous.effect, startsAt: previous.startsAt, expiresAt: previous.expiresAt } : null,
      current: operation === 'delete' ? null : { startsAt: doc.startsAt, expiresAt: doc.expiresAt },
    },
  })
  invalidateLearningAccess(req)
  recordLearningAssignment({ actorId, userId, operation, targetType: doc.target.relationTo, targetId, effect: doc.effect })
}

export const auditLearningGrantChange: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  await auditGrant(req, doc as GrantDocument, operation, operation === 'update' ? previousDoc as GrantDocument | undefined : undefined)
  return doc
}

export const auditLearningGrantDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  await auditGrant(req, doc as GrantDocument, 'delete')
  return doc
}
