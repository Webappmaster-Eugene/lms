import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Проставляет владельца записи при создании.
 *
 * Поле `user` обязательное, а клиент его не присылает — иначе студент мог бы
 * записать прогресс или заметку на чужое имя. Админ вправе указать
 * пользователя явно (например, проставить прогресс студенту), всем остальным
 * владелец подставляется принудительно.
 */
export const assignOwner: CollectionBeforeChangeHook = ({ req, data, operation }) => {
  if (operation !== 'create') return data
  if (req.context?.skipHooks) return data
  if (!req.user) return data

  if (req.user.role !== 'admin' || data.user == null) {
    data.user = req.user.id
  }

  return data
}
