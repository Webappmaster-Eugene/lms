import type { Where } from 'payload'

import { learningGrantIsActive, learningRelationId, type LearningGrant } from '@/lib/learning-access'

export type GuidesAccessMode = 'all' | 'assigned'
export type GuideAccessUser = { id: number; role?: string | null; guidesAccessMode?: GuidesAccessMode | null; isActive?: boolean | null }
export type GuideMetadata = { id: number; isPublished?: boolean | null; isPublic?: boolean | null }
export const publicGuideWhere: Where = { and: [{ isPublished: { equals: true } }, { isPublic: { equals: true } }] }
export type GuideAccessSnapshot = {
  admin: boolean
  mode: GuidesAccessMode
  guideWhere: Where
  accessibleGuideIds: number[]
  hasAccess: boolean
  canAccessGuide: (id: number) => boolean
}

/**
 * Гайды не входят в доступ к обучению: без режима «все» открыт только назначенный гайд.
 * Публичные опубликованные гайды доступны всем. Для остальных запрет сильнее назначения.
 */
export function buildGuideAccess(user: GuideAccessUser | null | undefined, grants: LearningGrant[], guides: GuideMetadata[], now = Date.now()): GuideAccessSnapshot {
  const admin = user?.role === 'admin'
  const mode: GuidesAccessMode = user?.guidesAccessMode === 'all' ? 'all' : 'assigned'
  const rules = new Map<number, 'allow' | 'deny'>()
  for (const grant of grants) {
    const id = learningRelationId(grant.target?.value)
    if (grant.target?.relationTo !== 'guides' || id === null || !learningGrantIsActive(grant, now)) continue
    if (grant.effect === 'deny' || !rules.has(id)) rules.set(id, grant.effect)
  }
  const accessible = new Set<number>()
  if (!admin) {
    for (const guide of guides) {
      if (!guide.isPublished) continue
      if (guide.isPublic) { accessible.add(guide.id); continue }
      if (!user || user.isActive === false) continue
      const decision = rules.get(guide.id)
      if (decision ? decision === 'allow' : mode === 'all') accessible.add(guide.id)
    }
  }
  return {
    admin, mode,
    guideWhere: admin ? {} : { and: [{ isPublished: { equals: true } }, { id: { in: accessible.size ? [...accessible] : [-1] } }] },
    accessibleGuideIds: [...accessible],
    hasAccess: admin || accessible.size > 0,
    canAccessGuide: (id) => admin || accessible.has(id),
  }
}
