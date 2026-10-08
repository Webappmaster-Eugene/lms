import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'

/** Stable keys survive title edits and make deployment bootstrap idempotent. */
export const DEFAULT_ACHIEVEMENTS = [
  { slug: 'first-lesson', title: 'Первый шаг', description: 'Пройдите первый урок', criteriaType: 'lesson_count', criteriaValue: 1, pointsReward: 5 },
  { slug: 'five-lessons', title: 'Хорошее начало', description: 'Пройдите 5 уроков', criteriaType: 'lesson_count', criteriaValue: 5, pointsReward: 10 },
  { slug: 'ten-lessons', title: 'Десятка', description: 'Пройдите 10 уроков', criteriaType: 'lesson_count', criteriaValue: 10, pointsReward: 20 },
  { slug: 'twenty-five-lessons', title: 'Марафонец', description: 'Пройдите 25 уроков', criteriaType: 'lesson_count', criteriaValue: 25, pointsReward: 50 },
  { slug: 'fifty-lessons', title: 'Уверенный темп', description: 'Пройдите 50 уроков', criteriaType: 'lesson_count', criteriaValue: 50, pointsReward: 75 },
  { slug: 'first-course', title: 'Курс пройден', description: 'Завершите любой курс целиком', criteriaType: 'course_completion', criteriaValue: 1, pointsReward: 30 },
  { slug: 'three-courses', title: 'Три вершины', description: 'Завершите 3 курса целиком', criteriaType: 'course_completion', criteriaValue: 3, pointsReward: 75 },
  { slug: 'first-roadmap', title: 'Мастер пути', description: 'Завершите любой роадмап', criteriaType: 'roadmap_completion', criteriaValue: 1, pointsReward: 150 },
  { slug: 'five-hundred-points', title: 'Коллекционер баллов', description: 'Наберите 500 баллов', criteriaType: 'total_points', criteriaValue: 500, pointsReward: 50 },
  { slug: 'first-trainer-task', title: 'Первая задача', description: 'Решите первую задачу тренажёра', criteriaType: 'trainer_task_count', criteriaValue: 1, pointsReward: 10 },
  { slug: 'five-trainer-tasks', title: 'Разминка пройдена', description: 'Решите 5 задач тренажёра', criteriaType: 'trainer_task_count', criteriaValue: 5, pointsReward: 20 },
  { slug: 'ten-trainer-tasks', title: 'Практик', description: 'Решите 10 задач тренажёра', criteriaType: 'trainer_task_count', criteriaValue: 10, pointsReward: 30 },
  { slug: 'twenty-five-trainer-tasks', title: 'Решатель', description: 'Решите 25 задач тренажёра', criteriaType: 'trainer_task_count', criteriaValue: 25, pointsReward: 60 },
  { slug: 'three-day-streak', title: 'Вхожу в ритм', description: 'Завершайте урок или задачу 3 дня подряд', criteriaType: 'streak_days', criteriaValue: 3, pointsReward: 15 },
  { slug: 'seven-day-streak', title: 'Неделя практики', description: 'Завершайте урок или задачу 7 дней подряд', criteriaType: 'streak_days', criteriaValue: 7, pointsReward: 35 },
  { slug: 'thirty-day-streak', title: 'Месяц в ритме', description: 'Завершайте урок или задачу 30 дней подряд', criteriaType: 'streak_days', criteriaValue: 30, pointsReward: 100 },
] as const

export async function bootstrapDefaultAchievements(payload: Payload): Promise<void> {
  const req = await createLocalReq({}, payload)
  try {
    if (!await initTransaction(req)) throw new Error('Achievement catalogue transaction could not start')
    const transactionId = await req.transactionID
    const adapter = payload.db as unknown as { sessions: Record<string | number, { db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } } | undefined> }
    const db = transactionId === undefined ? undefined : adapter.sessions[transactionId]?.db
    if (!db) throw new Error('Achievement catalogue requires a transaction')
    await db.execute(sql`select pg_advisory_xact_lock(7207, 1)`)
    for (const definition of DEFAULT_ACHIEVEMENTS) {
      const keyed = await payload.find({ req, collection: 'achievements', where: { slug: { equals: definition.slug } }, limit: 1, depth: 0 })
      if (keyed.totalDocs > 0) continue
      // Adopt the previous seeded definition without changing rewards, text or admin settings.
      const legacy = await payload.find({
        req, collection: 'achievements', depth: 0, limit: 1,
        where: { and: [
          { slug: { exists: false } }, { title: { equals: definition.title } },
          { criteriaType: { equals: definition.criteriaType } }, { criteriaValue: { equals: definition.criteriaValue } },
          { criteriaEntityId: { exists: false } },
        ] },
      })
      if (legacy.docs[0]) {
        await payload.update({ req, collection: 'achievements', id: legacy.docs[0].id, data: { slug: definition.slug } })
      } else {
        await payload.create({ req, collection: 'achievements', data: { ...definition, isActive: true } })
      }
    }
    await commitTransaction(req)
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}
