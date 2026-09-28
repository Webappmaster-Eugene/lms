import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Владелец записи: проставляется при создании и не меняется при обновлении.
 *
 * Поле `user` обязательное, а клиент его не присылает — иначе студент мог бы
 * записать прогресс или заметку на чужое имя. Админ вправе указать
 * пользователя явно (например, проставить прогресс студенту), всем остальным
 * владелец подставляется принудительно. При обновлении не-админ владельца не
 * меняет: иначе свою заметку можно было переписать на другого пользователя.
 */
export const assignOwner: CollectionBeforeChangeHook = ({ req, data, operation, originalDoc }) => {
  if (req.context?.skipHooks) return data
  if (!req.user) return data

  if (operation === 'update') {
    if (req.user.role !== 'admin' && 'user' in data && originalDoc) {
      const owner = originalDoc.user
      data.user = owner !== null && typeof owner === 'object' ? owner.id : owner
    }
    return data
  }

  if (operation !== 'create') return data

  if (req.user.role !== 'admin' || data.user == null) {
    data.user = req.user.id
  }

  return data
}
