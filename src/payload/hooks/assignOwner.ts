import type { CollectionBeforeChangeHook } from 'payload'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

/**
 * Владелец записи: проставляется при создании и не меняется при обновлении.
 *
 * Поле `user` обязательное, а клиент его не присылает — иначе студент мог бы
 * записать прогресс или заметку на чужое имя. Админ вправе указать
 * пользователя явно (например, проставить прогресс студенту), всем остальным
 * владелец подставляется принудительно. При обновлении не-админ владельца не
 * меняет: иначе свою заметку можно было переписать на другого пользователя.
 */
export const assignOwner: CollectionBeforeChangeHook = async ({ req, data, operation, originalDoc }) => {
  if (req.context?.skipHooks) return data
  if (!req.user) return data
  const isAdmin = (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role === 'admin'

  if (operation === 'update') {
    if (!isAdmin && 'user' in data && originalDoc) {
      const owner = originalDoc.user
      data.user = owner !== null && typeof owner === 'object' ? owner.id : owner
    }
    return data
  }

  if (operation !== 'create') return data

  if (!isAdmin || data.user == null) {
    data.user = req.user.id
  }

  return data
}
