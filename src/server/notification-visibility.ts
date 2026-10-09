import type { Payload, PayloadRequest } from 'payload'

import { getLearningAccess } from '@/server/learning-access'
import { getTrainerAccess } from '@/server/trainer-access'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

/** Recheck referenced materials at read/delivery time; notification history stays intact. */
export async function notificationLinkIsVisible(payload: Payload, userId: number, link: string | null | undefined, req?: Partial<PayloadRequest>): Promise<boolean> {
  if (!link) return true
  const policy = await getAuthoritativeLearningPolicy(payload, userId, req)
  if (policy.role === 'admin') return true
  let parts: string[]
  try { parts = new URL(link, 'https://learn.mentorcareer.ru').pathname.split('/').filter(Boolean).map(decodeURIComponent) } catch { return false }
  const user = { id: userId }
  if (parts[0] === 'trainer') {
    const scope = await getTrainerAccess(payload, user, req)
    if (!scope.hasAccess) return false
    if (parts[1] === 'interview') return scope.mode === 'all'
    if (parts.length === 1 || parts[1] === 'tasks') return true
    if (parts.length === 2) {
      const result = await payload.find({ collection: 'trainer-topics', where: { slug: { equals: parts[1] } }, select: { slug: true }, limit: 1, depth: 0, overrideAccess: true, req })
      return Boolean(result.docs[0] && scope.browseTopicIds.includes(result.docs[0].id))
    }
    const result = await payload.find({ collection: 'trainer-tasks', where: { slug: { equals: parts[2] } }, select: { topic: true }, limit: 1, depth: 0, overrideAccess: true, req })
    return Boolean(result.docs[0] && scope.canBrowseTask(result.docs[0].id))
  }
  if (policy.catalogVisibility !== 'assigned') return true
  const scope = await getLearningAccess(payload, user, req)
  const slug = parts[1]
  if (!slug) return true
  if (parts[0] === 'courses') {
    const result = await payload.find({ collection: 'courses', where: { slug: { equals: slug } }, select: { slug: true }, limit: 1, depth: 0, overrideAccess: true, req })
    return Boolean(result.docs[0] && scope.canBrowseCourse(result.docs[0].id))
  }
  if (parts[0] === 'roadmaps') {
    const result = await payload.find({ collection: 'roadmaps', where: { slug: { equals: slug } }, select: { slug: true }, limit: 1, depth: 0, overrideAccess: true, req })
    return Boolean(result.docs[0] && scope.canBrowseRoadmap(result.docs[0].id))
  }
  if (parts[0] === 'lessons') {
    const result = await payload.find({ collection: 'lessons', where: { slug: { equals: slug } }, select: { course: true, section: true, isPublished: true }, limit: 1, depth: 0, overrideAccess: true, req })
    return Boolean(result.docs[0] && scope.canBrowseLessonMetadata(result.docs[0]))
  }
  return true
}
