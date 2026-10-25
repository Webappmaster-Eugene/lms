import type { CollectionAfterChangeHook, Payload, PayloadRequest, Where } from 'payload'

import { buildGuideAccess, type GuidesAccessMode } from '@/lib/guide-access'
import { learningGrantIsActive, learningRelationId, type LearningGrant } from '@/lib/learning-access'
import { collectAllPages } from '@/lib/paginate'
import { logger } from '@/lib/telemetry'

type GrantRow = LearningGrant & { id: number; user: unknown }
type Recipient = { id: number; role: string; guidesAccessMode: GuidesAccessMode; isActive: boolean }

/** Ученики с их ролью и режимом гайдов: политика доступа главнее полей users, как в getAuthoritativeLearningPolicy. */
async function students(payload: Payload, req: PayloadRequest, ids?: number[]): Promise<Recipient[]> {
  const userWhere: Where = ids ? { and: [{ isActive: { equals: true } }, { id: { in: ids } }] } : { isActive: { equals: true } }
  const [users, policies] = await Promise.all([
    collectAllPages(({ page, limit }) => payload.find({ collection: 'users', where: userWhere, select: { role: true, guidesAccessMode: true, isActive: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'ученики для уведомления о гайде' }),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'learning-access-policies', where: ids ? { user: { in: ids } } : undefined, select: { user: true, role: true, guidesMode: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'политики доступа для уведомления о гайде' }),
  ])
  const byUser = new Map(policies.map((policy) => [learningRelationId(policy.user), policy]))
  return users.flatMap((user) => {
    const policy = byUser.get(user.id)
    const role = policy ? policy.role : user.role
    if (role === 'admin' || user.isActive !== true) return []
    const mode = (policy ? policy.guidesMode : user.guidesAccessMode) === 'all' ? 'all' : 'assigned'
    return [{ id: user.id, role: 'student', guidesAccessMode: mode, isActive: true }]
  })
}

async function guideGrants(payload: Payload, req: PayloadRequest, guideId: number, userId?: number): Promise<GrantRow[]> {
  const where: Where = { and: [{ 'target.relationTo': { equals: 'guides' } }, { 'target.value': { equals: guideId } }, ...(userId ? [{ user: { equals: userId } }] : [])] }
  const grants = await collectAllPages(({ page, limit }) => payload.find({ collection: 'learning-access-grants', where, select: { user: true, target: true, effect: true, startsAt: true, expiresAt: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'назначения гайда' })
  return grants as unknown as GrantRow[]
}

function canRead(user: Recipient, grants: GrantRow[], guideId: number, now: number, isPublic = false): boolean {
  return buildGuideAccess(user, grants, [{ id: guideId, isPublished: true, isPublic }], now).canAccessGuide(guideId)
}

async function notify(payload: Payload, req: PayloadRequest, userIds: number[], data: { title: string; message: string; link: string }) {
  for (const user of userIds) {
    await payload.create({ collection: 'notifications', data: { user, ...data, type: 'info', isRead: false }, req, overrideAccess: true, depth: 0 })
  }
}

/** Кому открыт опубликованный гайд прямо сейчас: режим «все гайды» или действующее назначение, без запрета. */
export async function guideRecipients(payload: Payload, req: PayloadRequest, guideId: number, now = Date.now()): Promise<number[]> {
  const [users, grants, guide] = await Promise.all([
    students(payload, req), guideGrants(payload, req, guideId),
    payload.findByID({ collection: 'guides', id: guideId, select: { isPublic: true }, depth: 0, overrideAccess: true, req }),
  ])
  const byUser = new Map<number, GrantRow[]>()
  for (const grant of grants) {
    const user = learningRelationId(grant.user)
    if (user !== null) byUser.set(user, [...(byUser.get(user) ?? []), grant])
  }
  return users.filter((user) => canRead(user, byUser.get(user.id) ?? [], guideId, now, guide.isPublic === true)).map((user) => user.id)
}

/** Первая публикация гайда (computeGuideMeta проставил announcedAt) — уведомление всем, кому он открыт. */
export const announceGuide: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (req.context?.skipHooks || !doc.isPublished || !doc.announcedAt || previousDoc?.announcedAt) return doc
  try {
    const recipients = await guideRecipients(req.payload, req, doc.id)
    await notify(req.payload, req, recipients, { title: 'Новый гайд', message: `«${doc.title}». ${doc.summary ?? ''}`.trim(), link: `/guides/${doc.slug}` })
  } catch (error) {
    logger.error('Не удалось разослать уведомление о новом гайде', error, { 'guide.id': doc.id })
    throw error
  }
  return doc
}

/**
 * Назначение гайда ученику — уведомление, если гайд уже опубликован и раньше ученику был закрыт.
 * Неопубликованный гайд ученик получит уведомлением о публикации; отложенное назначение — без уведомления.
 */
export const notifyGuideGrant: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (req.context?.skipHooks || doc.target?.relationTo !== 'guides' || doc.effect !== 'allow') return doc
  const now = Date.now()
  if (!learningGrantIsActive(doc, now)) return doc
  if (operation === 'update' && previousDoc?.effect === 'allow' && learningGrantIsActive(previousDoc, now) && learningRelationId(previousDoc.target?.value) === learningRelationId(doc.target.value)) return doc
  const guideId = learningRelationId(doc.target.value)
  const userId = learningRelationId(doc.user)
  if (guideId === null || userId === null) return doc
  try {
    const guide = await req.payload.findByID({ collection: 'guides', id: guideId, select: { title: true, slug: true, isPublished: true, isPublic: true, announcedAt: true }, depth: 0, overrideAccess: true, req, disableErrors: true })
    if (!guide?.isPublished || !guide.announcedAt) return doc
    if (guide.isPublic) return doc
    const [user] = await students(req.payload, req, [userId])
    if (!user) return doc
    const grants = await guideGrants(req.payload, req, guideId, userId)
    if (!canRead(user, grants, guideId, now) || canRead(user, grants.filter((grant) => grant.id !== doc.id), guideId, now)) return doc
    await notify(req.payload, req, [userId], { title: 'Вам открыт гайд', message: `«${guide.title}» — откройте в разделе «Гайды».`, link: `/guides/${guide.slug}` })
  } catch (error) {
    logger.error('Не удалось отправить уведомление о назначенном гайде', error, { 'guide.id': guideId, 'user.id': userId })
    throw error
  }
  return doc
}

/** Ученику включили режим «все гайды» — одно уведомление вместо рассылки по каждому гайду. */
export const notifyGuidesModeOpened: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (req.context?.skipHooks || operation !== 'update' || doc.role !== 'student' || doc.guidesMode !== 'all' || previousDoc?.guidesMode === 'all') return doc
  const userId = learningRelationId(doc.user)
  if (userId === null) return doc
  try {
    const published = await req.payload.count({ collection: 'guides', where: { isPublished: { equals: true } }, overrideAccess: true, req })
    if (!published.totalDocs) return doc
    await notify(req.payload, req, [userId], { title: 'Вам открыты все гайды', message: 'Пошаговые инструкции по карьере, работе с ИИ и своему делу — в разделе «Гайды».', link: '/guides' })
  } catch (error) {
    logger.error('Не удалось отправить уведомление об открытых гайдах', error, { 'user.id': userId })
    throw error
  }
  return doc
}
