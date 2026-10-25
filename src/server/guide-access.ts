import type { Access, Payload, PayloadRequest } from 'payload'

import { buildGuideAccess, publicGuideWhere, type GuideAccessSnapshot } from '@/lib/guide-access'
import type { LearningGrant } from '@/lib/learning-access'
import { collectAllPages } from '@/lib/paginate'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

const policies = new WeakMap<PayloadRequest, Map<number, Promise<GuideAccessSnapshot>>>()

export function invalidateGuideAccess(req: PayloadRequest): void {
  policies.delete(req)
}

async function load(payload: Payload, user: { id: number } | null | undefined, req?: Partial<PayloadRequest>): Promise<GuideAccessSnapshot> {
  if (!user) {
    const guides = await collectAllPages(({ page, limit }) => payload.find({ collection: 'guides', where: publicGuideWhere, select: { isPublished: true, isPublic: true }, depth: 0, page, limit, overrideAccess: true, req }), { label: 'публичные гайды' })
    return buildGuideAccess(null, [], guides)
  }
  // Роль и режим — из отдельной политики: строку users перезаписывает сессия входа.
  const actual = await getAuthoritativeLearningPolicy(payload, user.id, req)
  if (actual.role === 'admin') return buildGuideAccess({ id: user.id, role: 'admin' }, [], [])
  const current = await payload.db.findOne({ collection: 'users', where: { id: { equals: user.id } }, req })
  if (!current || !('isActive' in current) || current.isActive !== true) return load(payload, null, req)
  const [grants, guides] = await Promise.all([
    collectAllPages(({ page, limit }) => payload.find({ collection: 'learning-access-grants', where: { and: [{ user: { equals: user.id } }, { 'target.relationTo': { equals: 'guides' } }] }, select: { target: true, effect: true, startsAt: true, expiresAt: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'назначения гайдов' }),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'guides', where: { isPublished: { equals: true } }, select: { isPublished: true, isPublic: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'публикация гайдов' }),
  ])
  return buildGuideAccess({ id: user.id, role: 'student', guidesAccessMode: actual.guidesMode, isActive: true }, grants as LearningGrant[], guides)
}

export async function getGuideAccess(payload: Payload, user: { id: number } | null | undefined, req?: Partial<PayloadRequest>): Promise<GuideAccessSnapshot> {
  if (!req || !user) return load(payload, user, req)
  const request = req as PayloadRequest
  let values = policies.get(request)
  if (!values) { values = new Map(); policies.set(request, values) }
  let promise = values.get(user.id)
  if (!promise) { promise = load(payload, user, req); values.set(user.id, promise) }
  return promise
}

export const guideReadAccess: Access = async ({ req }) => {
  if (!req.user) return publicGuideWhere
  const scope = await getGuideAccess(req.payload, req.user, req)
  return scope.admin ? true : scope.guideWhere
}
