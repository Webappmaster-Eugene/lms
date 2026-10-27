import type { Access, FieldAccess } from 'payload'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

export const isAdmin: Access = async ({ req }) => {
  const user = req.user
  if (!user) return false
  if (!req.payload) return false
  return (await getAuthoritativeLearningPolicy(req.payload, user.id, req)).role === 'admin'
}

/** Поле только для администратора: роль из политики, как у коллекций, а не из строки сессии. */
export const isAdminField: FieldAccess = async ({ req }) => {
  if (!req.user || !req.payload) return false
  return (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role === 'admin'
}
