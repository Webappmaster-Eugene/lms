import type { FieldAccess } from 'payload'

import { learningRelationId } from '@/lib/learning-access'
import { canAccessCourse } from '@/server/learning-access'

export const learningCourseDescriptionRead: FieldAccess = async ({ req, doc }) => {
  if (!req.user) return false
  const id = learningRelationId(doc)
  return id !== null && canAccessCourse(req.payload, req.user, id, req)
}
