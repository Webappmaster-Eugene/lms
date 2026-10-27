import type { Payload, PayloadRequest } from 'payload'

import type { LearningAccessSnapshot } from '@/lib/learning-access'
import { learningRelationId } from '@/lib/learning-access'
import { collectAllPages } from '@/lib/paginate'
import { buildNodeExtras, type NodeExtra } from '@/lib/roadmap-node-extras'
import { getGuideAccess } from '@/server/guide-access'

type ExtrasNode = { id: number; nodeType: string; guides?: number[] | null; bootcamps?: number[] | null }

/** Гайды и буткемпы видимых тем карты: названия, ссылки, доступ и отметка «Прочитан». */
export async function getRoadmapNodeExtras(
  payload: Payload,
  user: { id: number } | null | undefined,
  access: LearningAccessSnapshot,
  nodes: ExtrasNode[],
  req: Partial<PayloadRequest>,
): Promise<Map<number, NodeExtra[]>> {
  const topics = nodes.filter((node) => node.nodeType !== 'category' && access.canBrowseNode(node.id))
  const guideIds = [...new Set(topics.flatMap((node) => node.guides ?? []))]
  const bootcampIds = [...new Set(topics.flatMap((node) => node.bootcamps ?? []))]
  if (!guideIds.length && !bootcampIds.length) return new Map()

  // Название закрытого гайда или буткемпа на карте показано намеренно: доступ проверяется ниже,
  // а наружу уходят только название и адрес гайда — не текст и не адрес закрытого буткемпа.
  const [guides, bootcamps, guideAccess] = await Promise.all([
    guideIds.length
      ? collectAllPages(({ page, limit }) => payload.find({ collection: 'guides', where: { and: [{ id: { in: guideIds } }, { isPublished: { equals: true } }] }, select: { title: true, slug: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'гайды тем роадмапа' })
      : [],
    bootcampIds.length
      ? collectAllPages(({ page, limit }) => payload.find({ collection: 'courses', where: { and: [{ id: { in: bootcampIds } }, { isBootcamp: { equals: true } }, { isPublished: { equals: true } }, { 'roadmap.isPublished': { equals: true } }] }, select: { title: true, slug: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'буткемпы тем роадмапа' })
      : [],
    guideIds.length ? getGuideAccess(payload, user, req) : null,
  ])
  const openGuideIds = guides.filter((guide) => guideAccess?.canAccessGuide(guide.id)).map((guide) => guide.id)
  const reads = user && openGuideIds.length
    ? await collectAllPages(({ page, limit }) => payload.find({ collection: 'guide-reads', where: { and: [{ user: { equals: user.id } }, { guide: { in: openGuideIds } }] }, select: { guide: true }, depth: 0, sort: 'id', page, limit, overrideAccess: false, req }), { label: 'прочитанные гайды тем' })
    : []

  return buildNodeExtras({
    nodes: topics,
    guides,
    bootcamps,
    canAccessGuide: (id) => guideAccess?.canAccessGuide(id) ?? false,
    canBrowseBootcamp: (id) => access.canBrowseCourse(id),
    readGuideIds: new Set(reads.flatMap((item) => learningRelationId(item.guide) ?? [])),
  })
}
