import type { Access, Where } from 'payload'

import { getTrainerAccess } from '@/server/trainer-access'
import { getLearningAccess } from '@/server/learning-access'

function relationWhere(where: Where, relation = 'lesson'): Where {
  const result: Where = {}
  for (const [key, value] of Object.entries(where)) {
    if ((key === 'and' || key === 'or') && Array.isArray(value)) result[key] = value.map((item) => relationWhere(item as Where, relation))
    else result[`${relation}.${key}`] = value
  }
  return result
}

export function learningStateRead({ comments = false, allowTask = false } = {}): Access {
  return async ({ req }) => {
    if (!req.user) return false
    const policy = await getLearningAccess(req.payload, req.user, req)
    if (policy.admin) return true
    const owner: Where = comments ? { or: [{ user: { equals: req.user.id } }, { 'parentComment.user': { equals: req.user.id } }] } : { user: { equals: req.user.id } }
    const lessonAccess = relationWhere(policy.lessonWhere)
    const taskAccess = allowTask ? relationWhere((await getTrainerAccess(req.payload, req.user, req)).taskWhere, 'task') : {}
    return { and: [owner, allowTask ? { or: [{ and: [{ lesson: { exists: false } }, { task: { exists: true } }, taskAccess] }, lessonAccess] } : lessonAccess] }
  }
}
