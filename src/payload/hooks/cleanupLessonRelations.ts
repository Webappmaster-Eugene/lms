import type { CollectionBeforeDeleteHook } from 'payload'

import { logger } from '@/lib/telemetry'

/** Коллекции, которые ссылаются на урок и без очистки держат его в базе. */
const DEPENDENTS = ['user-progress', 'notes', 'comments'] as const

/**
 * Удаляет записи, привязанные к уроку.
 *
 * Внешние ключи не дают удалить урок, на котором остались прогресс, заметка
 * или комментарий, а Payload отвечает на это «Something went wrong» — по
 * такому сообщению причину не найти. Чистим зависимости заранее.
 */
export const cleanupLessonRelations: CollectionBeforeDeleteHook = async ({ req, id }) => {
  for (const collection of DEPENDENTS) {
    try {
      await req.payload.delete({
        req,
        collection,
        where: { lesson: { equals: id } },
      })
    } catch (error) {
      logger.error('Не удалось очистить связи урока', error, {
        'lesson.id': String(id),
        'collection': collection,
      })
      throw error
    }
  }
}
