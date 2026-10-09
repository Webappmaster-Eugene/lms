import type { Where } from 'payload'

import { learningGrantIsActive, learningRelationId, type LearningGrant } from '@/lib/learning-access'

export type TrainerAccessMode = 'all' | 'assigned' | 'disabled'
export type TrainerAccessUser = { id: number; role?: string | null; trainerAccessMode?: TrainerAccessMode | null; learningCatalogVisibility?: 'catalog' | 'assigned' | null; isActive?: boolean | null }
export type TrainerTopicMetadata = { id: number; isPublished?: boolean | null }
export type TrainerTaskMetadata = { id: number; topic: unknown; isPublished?: boolean | null }
export type TrainerAccessSnapshot = {
  admin: boolean
  mode: TrainerAccessMode
  catalogVisibility: 'catalog' | 'assigned'
  taskWhere: Where
  accessibleTaskIds: number[]
  browseTaskIds: number[]
  browseTopicIds: number[]
  hasAccess: boolean
  canAccessTask: (id: number) => boolean
  canBrowseTask: (id: number) => boolean
}

export function buildTrainerAccess(user: TrainerAccessUser | null | undefined, grants: LearningGrant[], metadata: { topics: TrainerTopicMetadata[]; tasks: TrainerTaskMetadata[] }, now = Date.now()): TrainerAccessSnapshot {
  const admin = user?.role === 'admin'
  const mode = user?.trainerAccessMode ?? 'all'
  const catalogVisibility = user?.learningCatalogVisibility === 'assigned' ? 'assigned' : 'catalog'
  const topics = new Set(metadata.topics.filter(topic => topic.isPublished).map(topic => topic.id))
  const rules = new Map<string, 'allow' | 'deny'>()
  for (const grant of grants) {
    const id = learningRelationId(grant.target?.value)
    if (id === null || !learningGrantIsActive(grant, now)) continue
    const key = `${grant.target.relationTo}:${id}`
    if (grant.effect === 'deny' || !rules.has(key)) rules.set(key, grant.effect)
  }
  const accessible = new Set<number>()
  const browse = new Set<number>()
  const browseTopics = new Set<number>()
  let hasTopicAccess = false
  if (admin || (user && user.isActive !== false && mode !== 'disabled')) {
    for (const topicId of topics) {
      const decision = rules.get(`trainer-topics:${topicId}`)
      const allowed = admin || (decision ? decision === 'allow' : mode === 'all')
      hasTopicAccess ||= allowed
      if (allowed || catalogVisibility === 'catalog') browseTopics.add(topicId)
    }
  }
  for (const task of metadata.tasks) {
    const topicId = learningRelationId(task.topic)
    if (!admin && (!user || user.isActive === false || mode === 'disabled' || !task.isPublished || topicId === null || !topics.has(topicId))) continue
    const decision = rules.get(`trainer-tasks:${task.id}`) ?? rules.get(`trainer-topics:${topicId}`)
    const allowed = admin || (decision ? decision === 'allow' : mode === 'all')
    if (allowed) accessible.add(task.id)
    if (allowed || catalogVisibility === 'catalog') {
      browse.add(task.id)
      if (topicId !== null) browseTopics.add(topicId)
    }
  }
  return { admin, mode, catalogVisibility,
    taskWhere: admin ? {} : { id: { in: accessible.size ? [...accessible] : [-1] } },
    accessibleTaskIds: [...accessible], browseTaskIds: [...browse], browseTopicIds: [...browseTopics],
    hasAccess: admin || (Boolean(user) && user?.isActive !== false && mode === 'all') || hasTopicAccess || accessible.size > 0,
    canAccessTask: id => admin || accessible.has(id), canBrowseTask: id => admin || browse.has(id),
  }
}
