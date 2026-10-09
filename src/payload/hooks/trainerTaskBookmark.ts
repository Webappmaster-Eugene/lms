import { APIError, type CollectionBeforeChangeHook } from 'payload'

import { learningRelationId } from '@/lib/learning-access'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { invalidateTrainerAccess, requireTrainerTaskAccess } from '@/server/trainer-access'
import { lockLearningAccess } from '@/payload/hooks/learningAccessLock'

export const guardTrainerTaskBookmark: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (!req.user || (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role === 'admin') return data
  const oldTask = learningRelationId(originalDoc?.task)
  const task = learningRelationId(data.task ?? originalDoc?.task)
  if (operation === 'update' && oldTask !== null && task !== oldTask) throw new APIError('Нельзя переносить закладку на другую задачу', 400)
  if (task !== null) {
    await lockLearningAccess(req, req.user.id)
    invalidateTrainerAccess(req)
    await requireTrainerTaskAccess(req.payload, req.user, task, req)
  }
  return data
}
