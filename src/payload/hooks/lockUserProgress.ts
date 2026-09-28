import type { CollectionBeforeChangeHook } from 'payload'
import { lockUserPoints } from '@/lib/user-lock'
import { relationId } from '@/lib/relation-id'

/**
 * Первым делом в транзакции прогресса берёт блокировку на пользователя: afterChange-хуки
 * (баллы, достижения, серия) параллельных отметок иначе упираются друг в друга deadlock-ом.
 */
export const lockUserProgress: CollectionBeforeChangeHook = async ({ req, data, originalDoc }) => {
  if (req.context?.skipHooks) return data
  const owner = data.user ?? originalDoc?.user
  if (owner == null) return data
  await lockUserPoints(req, relationId(owner))
  return data
}
