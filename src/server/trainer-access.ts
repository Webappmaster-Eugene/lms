import { APIError, type Access, type Payload, type PayloadRequest } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import { buildTrainerAccess, type TrainerAccessSnapshot, type TrainerAccessUser } from '@/lib/trainer-access'
import type { LearningGrant } from '@/lib/learning-access'
import { getAuthoritativeLearningPolicy, clearAuthoritativeLearningMode } from '@/server/learning-access-policy'

const policies = new WeakMap<PayloadRequest, Map<number, Promise<TrainerAccessSnapshot>>>()
export class TrainerAccessError extends APIError {
  constructor() { super('Доступ к тренажёру или этой задаче не назначен', 403) }
}
export function invalidateTrainerAccess(req: PayloadRequest): void {
  policies.delete(req)
  clearAuthoritativeLearningMode(req)
}
async function load(payload: Payload, user: TrainerAccessUser | null | undefined, req?: Partial<PayloadRequest>): Promise<TrainerAccessSnapshot> {
  const empty = { topics: [], tasks: [] }
  if (!user) return buildTrainerAccess(user, [], empty)
  const actual = await getAuthoritativeLearningPolicy(payload, user.id, req)
  if (actual.role === 'admin') return buildTrainerAccess({ ...user, role: 'admin' }, [], empty)
  const current = await payload.db.findOne({ collection: 'users', where: { id: { equals: user.id } }, req })
  if (!current || !('isActive' in current) || current.isActive !== true) return buildTrainerAccess(null, [], empty)
  const resolved: TrainerAccessUser = { id: user.id, role: actual.role, trainerAccessMode: actual.trainerMode, learningCatalogVisibility: actual.catalogVisibility, isActive: true }
  if (resolved.trainerAccessMode === 'disabled') return buildTrainerAccess(resolved, [], empty)
  const [grants, topics, tasks] = await Promise.all([
    collectAllPages(({ page, limit }) => payload.find({ collection: 'learning-access-grants', where: { user: { equals: user.id } }, select: { target: true, effect: true, startsAt: true, expiresAt: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'назначения тренажёра' }),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'trainer-topics', select: { isPublished: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'публикация тем тренажёра' }),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'trainer-tasks', select: { topic: true, isPublished: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'метаданные прав задач тренажёра' }),
  ])
  return buildTrainerAccess(resolved, grants as LearningGrant[], { topics, tasks })
}
export async function getTrainerAccess(payload: Payload, user: TrainerAccessUser | null | undefined, req?: Partial<PayloadRequest>): Promise<TrainerAccessSnapshot> {
  if (!req || !user) return load(payload, user, req)
  const request = req as PayloadRequest
  let values = policies.get(request)
  if (!values) { values = new Map(); policies.set(request, values) }
  let promise = values.get(user.id)
  if (!promise) { promise = load(payload, user, req); values.set(user.id, promise) }
  return promise
}
export async function requireTrainerTaskAccess(payload: Payload, user: TrainerAccessUser | null | undefined, task: number | { id: number }, req?: Partial<PayloadRequest>): Promise<void> {
  if (!(await getTrainerAccess(payload, user, req)).canAccessTask(typeof task === 'number' ? task : task.id)) throw new TrainerAccessError()
}
export const trainerTaskReadAccess: Access = async ({ req }) => {
  if (!req.user) return false
  const scope = await getTrainerAccess(req.payload, req.user, req)
  return scope.admin ? true : scope.taskWhere
}
export const trainerTopicReadAccess: Access = async ({ req }) => {
  if (!req.user) return false
  const scope = await getTrainerAccess(req.payload, req.user, req)
  return scope.admin ? true : { id: { in: scope.browseTopicIds.length ? scope.browseTopicIds : [-1] } }
}

/** Must run before progress/reward hooks acquire the users row. */
export async function guardTrainerProgress(input: { req: PayloadRequest; data: Record<string, unknown>; originalDoc?: Record<string, unknown> }): Promise<Record<string, unknown>> {
  const { req, data, originalDoc } = input
  const { learningRelationId } = await import('@/lib/learning-access')
  const owner = learningRelationId(data.user ?? originalDoc?.user)
  const task = learningRelationId(data.task ?? originalDoc?.task)
  if (owner === null || task === null || !req.user) return data
  const { lockLearningAccess } = await import('@/payload/hooks/learningAccessLock')
  await lockLearningAccess(req, owner)
  invalidateTrainerAccess(req)
  const policy = await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)
  if (policy.role !== 'admin') {
    if (owner !== req.user.id) throw new TrainerAccessError()
    await requireTrainerTaskAccess(req.payload, { id: owner }, task, req)
  }
  return data
}
