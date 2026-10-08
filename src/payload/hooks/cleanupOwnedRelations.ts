import type { CollectionBeforeDeleteHook, CollectionSlug } from 'payload'

import { logger } from '@/lib/telemetry'

/**
 * Удаляет записи, у которых обязательная связь указывает на удаляемый документ.
 *
 * Внешние ключи Payload создаёт с ON DELETE SET NULL, а колонка связи NOT NULL -
 * удаление студента с прогрессом или выданного достижения падало ошибкой NOT NULL,
 * и Payload отвечал «Something went wrong». Чистим зависимые записи заранее, в той же транзакции.
 */
function cleanupDependents(
  label: string,
  dependents: readonly { collection: CollectionSlug; field: string }[],
): CollectionBeforeDeleteHook {
  return async ({ req, id }) => {
    for (const { collection, field } of dependents) {
      try {
        await req.payload.delete({ req, collection, where: { [field]: { equals: id } } })
      } catch (error) {
        logger.error(`Не удалось очистить связи: ${label}`, error, { 'doc.id': String(id), collection })
        throw error
      }
    }
  }
}

/** Всё, что принадлежит пользователю: прогресс, баллы, достижения, заметки, уведомления */
export const cleanupUserRelations = cleanupDependents('пользователь', [
  { collection: 'lesson-learning-states', field: 'user' },
  { collection: 'user-progress', field: 'user' },
  { collection: 'user-trainer-progress', field: 'user' },
  { collection: 'points-transactions', field: 'user' },
  { collection: 'user-achievements', field: 'user' },
  { collection: 'certificates', field: 'user' },
  { collection: 'notifications', field: 'user' },
  { collection: 'streaks', field: 'user' },
  { collection: 'notes', field: 'user' },
  { collection: 'bookmarks', field: 'user' },
  { collection: 'comments', field: 'user' },
  { collection: 'interview-rooms', field: 'owner' },
])

/** Выданные экземпляры достижения; начисленные за него баллы остаются в истории */
export const cleanupAchievementRelations = cleanupDependents('достижение', [
  { collection: 'user-achievements', field: 'achievement' },
])

/** Прогресс и закладки задачи тренажёра: без них удаление задачи упиралось в NOT NULL */
export const cleanupTaskRelations = cleanupDependents('задача тренажёра', [
  { collection: 'user-trainer-progress', field: 'task' },
  { collection: 'bookmarks', field: 'task' },
])
