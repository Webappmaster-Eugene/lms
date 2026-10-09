import { sql } from '@payloadcms/db-postgres'
import { APIError, Forbidden, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook, type PayloadRequest } from 'payload'

import { learningRelationId } from '@/lib/learning-access'
import { consumeRawCollectionPatch } from '@/payload/hooks/rawCollectionPatch'
import { validateLearningGrant } from '@/payload/hooks/learningAccessGrants'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { invalidateLearningAccess } from '@/server/learning-access'
import { markLearningAccessAuditActor, persistLearningAccessPolicy } from '@/payload/hooks/learningAccessPolicy'

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
type SessionsAdapter = { drizzle: Executor; sessions?: Record<string | number, { db: Executor } | undefined> }

async function transactionDb(req: PayloadRequest): Promise<Executor> {
  const adapter = req.payload.db as unknown as SessionsAdapter
  const transactionID = await req.transactionID
  const db = transactionID === undefined ? undefined : adapter.sessions?.[transactionID]?.db
  if (!db) throw new APIError('Учебные назначения требуют транзакции', 500)
  return db
}

function refreshOriginal(originalDoc: Record<string, unknown>, current: Record<string, unknown>): void {
  for (const key of Object.keys(originalDoc)) delete originalDoc[key]
  Object.assign(originalDoc, current)
}

function mergeActualPatch(current: Record<string, unknown>, data: Record<string, unknown>, keys: ReadonlySet<string>): Record<string, unknown> {
  const merged = { ...current }
  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    if (data[key] !== undefined) merged[key] = data[key]
  }
  return merged
}

export async function lockLearningAccess(req: PayloadRequest, userId: number): Promise<void> {
  const adapter = req.payload.db as unknown as SessionsAdapter
  const transactionID = await req.transactionID
  const db = (transactionID !== undefined && adapter.sessions?.[transactionID]?.db) || adapter.drizzle
  await db.execute(sql`select pg_advisory_xact_lock(7204, ${userId})`)
}

/** Parent deletion must precede child cleanup in the same order used by video and assignment writes. */
export const lockLearningUserDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const userId = learningRelationId(id)
  if (userId === null) throw new APIError('Пользователь не найден', 404)
  const db = await transactionDb(req)
  await db.execute(sql`select pg_advisory_xact_lock(7203, ${userId})`)
  await db.execute(sql`select pg_advisory_xact_lock(7204, ${userId})`)
  await db.execute(sql`select id from users where id = ${userId} for update`)
}

export const lockLearningGrantChange: CollectionBeforeChangeHook = async ({ req, data, originalDoc, operation }) => {
  if (operation === 'update' && originalDoc) {
    const patch = consumeRawCollectionPatch(req, 'learning-access-grants', originalDoc.id)
    if (!patch) throw new APIError('Исходные поля назначения не определены', 409)
    const owners = [learningRelationId(originalDoc.user), patch.keys.has('user') ? learningRelationId(data.user) : null].filter((id): id is number => id !== null)
    for (const userId of [...new Set(owners)].sort((a, b) => a - b)) await lockLearningAccess(req, userId)
    invalidateLearningAccess(req)
    const current = await req.payload.db.findOne({ collection: 'learning-access-grants', where: { id: { equals: originalDoc.id } }, req })
    if (!current) throw new APIError('Назначение удалено; обновите страницу', 409)
    // Moving a rule while this operation waited changes its lock owner: abort rather than acquiring locks out of order.
    if (learningRelationId('user' in current ? current.user : null) !== learningRelationId(originalDoc.user)) throw new APIError('Ученик назначения изменился; обновите страницу', 409)
    const merged = mergeActualPatch(current, data, patch.keys)
    const userId = learningRelationId(merged.user)
    const target = merged.target as { relationTo?: string; value?: unknown } | undefined
    const targetId = learningRelationId(target?.value)
    if (userId === null || targetId === null || !target?.relationTo) throw new APIError('Назначение больше не содержит учебную цель', 409)
    merged.ruleKey = `${userId}:${target.relationTo}:${targetId}`
    await validateLearningGrant({ data: merged, originalDoc: current, req, operation: 'update', collection: req.payload.collections['learning-access-grants'].config, context: req.context })
    refreshOriginal(originalDoc, current)
    return merged
  }
  const owners = [learningRelationId(data.user), learningRelationId(originalDoc?.user)].filter((id): id is number => id !== null)
  for (const userId of [...new Set(owners)].sort((a, b) => a - b)) await lockLearningAccess(req, userId)
  invalidateLearningAccess(req)
  await validateLearningGrant({ data, originalDoc, req, operation, collection: req.payload.collections['learning-access-grants'].config, context: req.context })
  return data
}

export const lockLearningGrantDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const grant = await req.payload.findByID({ collection: 'learning-access-grants', id, depth: 0, select: { user: true }, overrideAccess: true, req })
  const userId = learningRelationId(grant.user)
  if (userId !== null) {
    await lockLearningAccess(req, userId)
    const current = await req.payload.db.findOne({ collection: 'learning-access-grants', where: { id: { equals: id } }, req })
    if (current && learningRelationId('user' in current ? current.user : null) !== userId) throw new APIError('Ученик назначения изменился; обновите страницу', 409)
  }
}

export const lockLearningModeChange: CollectionBeforeChangeHook = async ({ req, data, originalDoc, operation }) => {
  if (operation !== 'update' || !originalDoc) return data
  const patch = consumeRawCollectionPatch(req, 'users', originalDoc.id)
  if (!patch) throw new APIError('Исходные поля профиля не определены', 409)
  const db = await transactionDb(req)
  // Never take 7204 here: trainer transactions already hold this users row; manager uses 7204 -> row.
  await db.execute(sql`select id from users where id = ${originalDoc.id} for update`)
  invalidateLearningAccess(req)
  const current = await req.payload.db.findOne({ collection: 'users', where: { id: { equals: originalDoc.id } }, req })
  if (!current) throw new APIError('Пользователь удалён; обновите страницу', 409)
  const actualPolicy = await getAuthoritativeLearningPolicy(req.payload, Number(originalDoc.id), req)
  const currentWithMode = { ...current, learningAccessMode: actualPolicy.mode, role: actualPolicy.role }
  const keys = new Set(patch.keys)
  // System XP/password updates may bypass field access; they still cannot reassign learning access.
  const actorRole = req.user ? (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role : 'student'
  if (!patch.overrideAccess && req.user && actorRole !== 'admin' && req.user.id !== Number(originalDoc.id)) throw new Forbidden(req.t)
  if (actorRole !== 'admin') { keys.delete('learningAccessMode'); keys.delete('role') }
  if (!patch.overrideAccess) {
    for (const field of req.payload.collections.users.config.fields) {
      if (!('name' in field) || !keys.has(field.name) || !('access' in field) || !field.access?.update) continue
      const allowed = await field.access.update({ id: current.id, req, doc: current, data, siblingData: data })
      if (!allowed) keys.delete(field.name)
    }
  }
  const merged = mergeActualPatch(currentWithMode, data, keys)
  if (keys.has('learningAccessMode') || keys.has('role')) {
    await persistLearningAccessPolicy(req, Number(originalDoc.id), { mode: merged.learningAccessMode === 'all' ? 'all' : 'assigned', role: merged.role === 'admin' ? 'admin' : 'student' })
    if (req.user && actorRole === 'admin') markLearningAccessAuditActor(req, Number(originalDoc.id), req.user.id)
  }
  refreshOriginal(originalDoc, currentWithMode)
  return merged
}
