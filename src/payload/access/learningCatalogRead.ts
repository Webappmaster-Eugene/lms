import type { Access, Where } from 'payload'

import { getLearningAccess } from '@/server/learning-access'

export const learningCourseRead: Access = async ({ req }) => {
  if (!req.user) return false
  const policy = await getLearningAccess(req.payload, req.user, req)
  return policy.admin ? true : { id: { in: policy.browseCourseIds } }
}

export const learningSectionRead: Access = async ({ req }) => {
  if (!req.user) return false
  const policy = await getLearningAccess(req.payload, req.user, req)
  return policy.admin ? true : { id: { in: policy.browseSectionIds } }
}

export const learningRoadmapRead: Access = async ({ req }) => {
  if (!req.user) return false
  const policy = await getLearningAccess(req.payload, req.user, req)
  return policy.admin ? true : { id: { in: policy.browseRoadmapIds } }
}

export const learningNodeRead: Access = async ({ req }) => {
  if (!req.user) return false
  const policy = await getLearningAccess(req.payload, req.user, req)
  return policy.admin ? true : { id: { in: policy.browseNodeIds } }
}

export const learningEdgeRead: Access = async ({ req }) => {
  if (!req.user) return false
  const policy = await getLearningAccess(req.payload, req.user, req)
  if (policy.admin) return true
  const where: Where = { and: [
    { roadmap: { in: policy.browseRoadmapIds } },
    { source: { in: policy.browseNodeIds } }, { target: { in: policy.browseNodeIds } },
  ] }
  return where
}
