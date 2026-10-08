import type { Access, Where } from 'payload'

import { getLearningAccess } from '@/server/learning-access'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

export const learningCourseRead: Access = async ({ req }) => {
  if (!req.user) return false
  const policy = await getLearningAccess(req.payload, req.user, req)
  if (policy.admin) return true
  return { id: { in: policy.browseCourseIds } }
}

export const learningSectionRead: Access = async ({ req }) => {
  if (!req.user) return false
  const policy = await getLearningAccess(req.payload, req.user, req)
  if (policy.admin) return true
  const where: Where = { and: [{ isPublished: { equals: true } }, { course: { in: policy.browseCourseIds } }] }
  return where
}

export const learningNodeRead: Access = async ({ req }) => {
  if (!req.user) return false
  if ((await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role === 'admin') return true
  return { 'roadmap.isPublished': { equals: true } }
}
