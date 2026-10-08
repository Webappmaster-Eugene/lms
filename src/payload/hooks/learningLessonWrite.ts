import { APIError, type CollectionBeforeChangeHook } from 'payload'

import { learningRelationId } from '@/lib/learning-access'
import { requireLessonAccess } from '@/server/learning-access'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

/** Runs before completion/XP hooks, including updates with an omitted lesson field. */
export const guardLearningLessonWrite: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  // Trusted maintenance Local API writes have no actor; REST create/update access still requires one.
  if (!req.user) return data
  if ((await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role === 'admin') return data
  const oldLesson = learningRelationId(originalDoc?.lesson)
  const newLesson = learningRelationId(data.lesson ?? originalDoc?.lesson)
  if (operation === 'update' && oldLesson !== null) {
    await requireLessonAccess(req.payload, req.user, oldLesson, req)
    if (newLesson !== oldLesson) throw new APIError('Нельзя переносить учебную запись на другой урок', 400)
  }
  if (newLesson !== null) await requireLessonAccess(req.payload, req.user, newLesson, req)
  return data
}
