import type { Access } from 'payload'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

export const isAdmin: Access = async ({ req }) => {
  const user = req.user
  if (!user) return false
  if (!req.payload) return false
  return (await getAuthoritativeLearningPolicy(req.payload, user.id, req)).role === 'admin'
}
