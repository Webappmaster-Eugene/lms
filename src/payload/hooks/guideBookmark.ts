import { APIError, type CollectionBeforeChangeHook } from 'payload'

import { learningRelationId } from '@/lib/learning-access'
import { getGuideAccess, invalidateGuideAccess } from '@/server/guide-access'
import { lockLearningAccess } from '@/payload/hooks/learningAccessLock'

/** Сохранить можно только выданный гайд: иначе закладка раскрыла бы, что гайд существует. */
export const guardGuideBookmark: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (!req.user) return data
  const oldGuide = learningRelationId(originalDoc?.guide)
  const guide = learningRelationId(data.guide ?? originalDoc?.guide)
  if (operation === 'update' && oldGuide !== null && guide !== oldGuide) throw new APIError('Нельзя переносить закладку на другой гайд', 400)
  if (guide === null) return data
  await lockLearningAccess(req, req.user.id)
  invalidateGuideAccess(req)
  if (!(await getGuideAccess(req.payload, req.user, req)).canAccessGuide(guide)) throw new APIError('Гайд недоступен', 403)
  return data
}
