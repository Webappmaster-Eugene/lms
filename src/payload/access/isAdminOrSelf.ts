import type { Access } from 'payload'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

export const isAdminOrSelf: Access = async ({ req }) => {
  const user = req.user
  if (!user) return false
  if (!req.payload) return false
  if ((await getAuthoritativeLearningPolicy(req.payload, user.id, req)).role === 'admin') return true

  return {
    user: {
      equals: user.id,
    },
  }
}
