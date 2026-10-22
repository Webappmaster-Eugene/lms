import type { Access, Where } from 'payload'

import { getGuideAccess } from '@/server/guide-access'
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

export function learningStateRead({ comments = false, allowTask = false, allowGuide = false } = {}): Access {
  return async ({ req }) => {
    if (!req.user) return false
    const policy = await getLearningAccess(req.payload, req.user, req)
    if (policy.admin) return true
    const owner: Where = comments ? { or: [{ user: { equals: req.user.id } }, { 'parentComment.user': { equals: req.user.id } }] } : { user: { equals: req.user.id } }
    const targets: Where[] = [relationWhere(policy.lessonWhere)]
    if (allowTask) {
      const taskAccess = relationWhere((await getTrainerAccess(req.payload, req.user, req)).taskWhere, 'task')
      targets.unshift({ and: [{ lesson: { exists: false } }, { task: { exists: true } }, taskAccess] })
    }
    if (allowGuide) {
      // Закрытый гайд прячет и закладку на него: выдача гайда — отдельное решение ментора.
      const guideAccess = relationWhere((await getGuideAccess(req.payload, req.user, req)).guideWhere, 'guide')
      targets.unshift({ and: [{ lesson: { exists: false } }, { task: { exists: false } }, { guide: { exists: true } }, guideAccess] })
    }
    return { and: [owner, targets.length > 1 ? { or: targets } : targets[0]] }
  }
}
