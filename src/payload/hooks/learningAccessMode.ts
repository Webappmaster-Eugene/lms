import type { CollectionAfterChangeHook } from 'payload'

import { invalidateLearningAccess } from '@/server/learning-access'
import { consumeLearningAccessAuditActor } from '@/payload/hooks/learningAccessPolicy'

export const auditLearningAccessMode: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== 'update') return doc
  const actorId = consumeLearningAccessAuditActor(req, doc.id)
  if (doc.learningAccessMode === previousDoc?.learningAccessMode && doc.role === previousDoc?.role) return doc
  invalidateLearningAccess(req)
  if (actorId !== null) {
    if (doc.learningAccessMode !== previousDoc?.learningAccessMode) await req.payload.create({ collection: 'learning-access-audit', overrideAccess: true, req, data: {
      actorId, userId: doc.id, operation: 'mode', targetType: 'users', targetId: doc.id,
      effect: doc.learningAccessMode === 'all' ? 'allow' : 'deny',
      previous: { mode: previousDoc?.learningAccessMode ?? 'assigned' }, current: { mode: doc.learningAccessMode ?? 'assigned' },
    } })
    if (doc.role !== previousDoc?.role) await req.payload.create({ collection: 'learning-access-audit', overrideAccess: true, req, data: {
      actorId, userId: doc.id, operation: 'mode', targetType: 'users.role', targetId: doc.id,
      effect: doc.role === 'admin' ? 'allow' : 'deny', previous: { role: previousDoc?.role ?? 'student' }, current: { role: doc.role ?? 'student' },
    } })
  }
  return doc
}
