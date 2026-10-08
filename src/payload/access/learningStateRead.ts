import type { Access, Where } from 'payload'

import { getLearningAccess } from '@/server/learning-access'

function lessonRelationWhere(where: Where): Where {
  const result: Where = {}
  for (const [key, value] of Object.entries(where)) {
    if ((key === 'and' || key === 'or') && Array.isArray(value)) result[key] = value.map((item) => lessonRelationWhere(item as Where))
    else result[`lesson.${key}`] = value
  }
  return result
}

export function learningStateRead({ comments = false, allowTask = false } = {}): Access {
  return async ({ req }) => {
    if (!req.user) return false
    const policy = await getLearningAccess(req.payload, req.user, req)
    if (policy.admin) return true
    const owner: Where = comments ? { or: [{ user: { equals: req.user.id } }, { 'parentComment.user': { equals: req.user.id } }] } : { user: { equals: req.user.id } }
    const lessonAccess = lessonRelationWhere(policy.lessonWhere)
    return { and: [owner, allowTask ? { or: [{ and: [{ lesson: { exists: false } }, { task: { exists: true } }] }, lessonAccess] } : lessonAccess] }
  }
}
