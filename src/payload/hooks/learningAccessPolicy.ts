import { AuthenticationError, type CollectionAfterChangeHook, type CollectionAfterReadHook, type CollectionBeforeLoginHook, type PayloadRequest } from 'payload'

import { learningRelationId } from '@/lib/learning-access'
import { clearAuthoritativeLearningMode, getAuthoritativeLearningPolicy, type AuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { invalidateLearningAccess } from '@/server/learning-access'

const auditActors = new WeakMap<PayloadRequest, Map<number, number>>()

export function markLearningAccessAuditActor(req: PayloadRequest, userId: number, actorId: number): void {
  const actors = auditActors.get(req) ?? new Map<number, number>()
  actors.set(userId, actorId)
  auditActors.set(req, actors)
}

export function consumeLearningAccessAuditActor(req: PayloadRequest, userId: number): number | null {
  const actors = auditActors.get(req)
  const actor = actors?.get(userId) ?? null
  actors?.delete(userId)
  if (!actors?.size) auditActors.delete(req)
  return actor
}

export async function persistLearningAccessPolicy(req: PayloadRequest, userId: number, next: Pick<AuthoritativeLearningPolicy, 'mode' | 'role'> & Partial<Pick<AuthoritativeLearningPolicy, 'catalogVisibility' | 'trainerMode'>>): Promise<void> {
  const existing = await req.payload.find({ collection: 'learning-access-policies', where: { user: { equals: userId } }, limit: 1, depth: 0, overrideAccess: true, req })
  const previousCapability = req.context.syncLearningAccessPolicy
  req.context.syncLearningAccessPolicy = true
  try {
    const policy = existing.docs[0]
    next = { ...next, catalogVisibility: next.catalogVisibility ?? policy?.catalogVisibility ?? 'catalog', trainerMode: next.trainerMode ?? policy?.trainerMode ?? 'all' }
    if (policy) {
      if (policy.mode !== next.mode || policy.role !== next.role || policy.catalogVisibility !== next.catalogVisibility || policy.trainerMode !== next.trainerMode) await req.payload.update({ collection: 'learning-access-policies', id: policy.id, data: next, overrideAccess: true, req })
    } else await req.payload.create({ collection: 'learning-access-policies', data: { user: userId, ...next }, overrideAccess: true, req })
  } finally {
    if (previousCapability === undefined) delete req.context.syncLearningAccessPolicy
    else req.context.syncLearningAccessPolicy = previousCapability
  }
  clearAuthoritativeLearningMode(req)
  invalidateLearningAccess(req)
}

/** Runs even for seeds/skipHooks: notification preferences must never skip policy creation. */
export const createLearningAccessPolicy: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation === 'create') await persistLearningAccessPolicy(req, doc.id, { mode: doc.learningAccessMode === 'all' ? 'all' : 'assigned', role: doc.role === 'admin' ? 'admin' : 'student', catalogVisibility: doc.learningCatalogVisibility === 'catalog' ? 'catalog' : 'assigned', trainerMode: doc.trainerAccessMode === 'all' || doc.trainerAccessMode === 'disabled' ? doc.trainerAccessMode : 'assigned' })
  return doc
}

export const reflectLearningAccessPolicy: CollectionAfterReadHook = async ({ doc, req }) => {
  const id = learningRelationId(doc)
  if (id !== null && (Object.hasOwn(doc, 'learningAccessMode') || Object.hasOwn(doc, 'role') || Object.hasOwn(doc, 'learningCatalogVisibility') || Object.hasOwn(doc, 'trainerAccessMode'))) {
    const actual = await getAuthoritativeLearningPolicy(req.payload, id, req)
    if (Object.hasOwn(doc, 'learningAccessMode')) doc.learningAccessMode = actual.mode
    if (Object.hasOwn(doc, 'role')) doc.role = actual.role
    if (Object.hasOwn(doc, 'learningCatalogVisibility')) doc.learningCatalogVisibility = actual.catalogVisibility
    if (Object.hasOwn(doc, 'trainerAccessMode')) doc.trainerAccessMode = actual.trainerMode
  }
  return doc
}

export const normalizeLearningLoginIdentity: CollectionBeforeLoginHook = async ({ user, req }) => {
  const current = await req.payload.db.findOne({ collection: 'users', where: { id: { equals: user.id } }, req })
  if (!current || ('isActive' in current && current.isActive === false) || !('hash' in current) || !('salt' in current) || current.hash !== user.hash || current.salt !== user.salt || !('email' in current) || current.email !== user.email) throw new AuthenticationError(req.t)
  clearAuthoritativeLearningMode(req)
  const actual = await getAuthoritativeLearningPolicy(req.payload, user.id, req)
  return { ...user, role: actual.role, learningAccessMode: actual.mode, learningCatalogVisibility: actual.catalogVisibility, trainerAccessMode: actual.trainerMode }
}
