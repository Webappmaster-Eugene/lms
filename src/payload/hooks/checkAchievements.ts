import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { relationId } from '@/lib/relation-id'
import { withSpan } from '@/lib/telemetry'

/**
 * Hook: проверяет и выдаёт достижения при изменении прогресса пользователя.
 *
 * Запускается на collection: user-progress, afterChange (после awardPoints).
 */
export const checkAchievements: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (req.context?.skipHooks) return doc

  const justCompleted =
    doc.isCompleted === true &&
    (operation === 'create' || previousDoc?.isCompleted !== true)

  if (!justCompleted) return doc

  const userId = relationId(doc.user)

  return withSpan('hook.checkAchievements', { 'user.id': userId }, async () => {
    // Загружаем данные параллельно
    const [achievements, userAchievements, user, completedLessons, courseTransactions, roadmapTransactions, trainerProgress] =
      await Promise.all([
        req.payload.find({
          req,
          collection: 'achievements',
          where: { isActive: { equals: true } },
          limit: 100,
        }),
        req.payload.find({
          req,
          collection: 'user-achievements',
          where: { user: { equals: userId } },
          limit: 1000,
        }),
        req.payload.findByID({ req, collection: 'users', id: userId }),
        req.payload.find({
          req,
          collection: 'user-progress',
          where: {
            user: { equals: userId },
            isCompleted: { equals: true },
          },
          limit: 0, // только totalDocs
        }),
        req.payload.find({
          req,
          collection: 'points-transactions',
          where: {
            user: { equals: userId },
            reason: { equals: 'course_completed' },
          },
          limit: 1000,
        }),
        req.payload.find({
          req,
          collection: 'points-transactions',
          where: {
            user: { equals: userId },
            reason: { equals: 'roadmap_completed' },
          },
          limit: 1000,
        }),
        req.payload.find({
          req,
          collection: 'user-trainer-progress',
          where: {
            user: { equals: userId },
            isCompleted: { equals: true },
          },
          limit: 0, // только totalDocs
        }),
      ])

    const unlockedIds = new Set(
      userAchievements.docs.map((ua) =>
        String(typeof ua.achievement === 'object' ? ua.achievement.id : ua.achievement),
      ),
    )

    // Множества конкретных завершённых сущностей
    const completedCourseEntityIds = new Set(
      courseTransactions.docs
        .filter((t) => t.relatedEntity)
        .map((t) => String(t.relatedEntity)),
    )

    const completedRoadmapEntityIds = new Set(
      roadmapTransactions.docs
        .filter((t) => t.relatedEntity)
        .map((t) => String(t.relatedEntity)),
    )

    const stats: UserStats = {
      completedLessonCount: completedLessons.totalDocs,
      completedCourseCount: courseTransactions.totalDocs,
      completedRoadmapCount: roadmapTransactions.totalDocs,
      completedTrainerTaskCount: trainerProgress.totalDocs,
      totalPoints: user.totalPoints ?? 0,
      completedCourseEntityIds,
      completedRoadmapEntityIds,
    }

    let pointsAwarded = 0

    for (const achievement of achievements.docs) {
      if (unlockedIds.has(String(achievement.id))) continue

      const met = checkCriteria(
        achievement.criteriaType ?? '',
        achievement.criteriaValue ?? 0,
        achievement.criteriaEntityId ?? null,
        stats,
      )

      if (!met) continue

      // Выдаём достижение
      try {
        await req.payload.create({
          req,
          collection: 'user-achievements',
          data: {
            user: userId,
            achievement: achievement.id,
            unlockedAt: new Date().toISOString(),
          },
          context: { skipHooks: true },
        })
      } catch {
        // Дубль (race condition) — пропускаем
        continue
      }

      // Начисляем бонусные баллы за достижение
      if (achievement.pointsReward && achievement.pointsReward > 0) {
        await req.payload.create({
          req,
          collection: 'points-transactions',
          data: {
            user: userId,
            amount: achievement.pointsReward,
            reason: 'achievement_unlocked' as const,
            relatedEntity: String(achievement.id),
            description: `Достижение: ${achievement.title}`,
          },
          context: { skipHooks: true },
        })

        pointsAwarded += achievement.pointsReward
        // Обновляем stats для следующих проверок
        stats.totalPoints += achievement.pointsReward
      }
    }

    // Пересчитываем totalPoints если были начислены баллы за достижения
    if (pointsAwarded > 0) {
      await recalculateTotalPoints(req, userId)
    }

    return doc
  })
}

type UserStats = {
  completedLessonCount: number
  completedCourseCount: number
  completedRoadmapCount: number
  completedTrainerTaskCount: number
  totalPoints: number
  completedCourseEntityIds: Set<string>
  completedRoadmapEntityIds: Set<string>
}

function checkCriteria(
  criteriaType: string,
  criteriaValue: number,
  criteriaEntityId: string | null,
  stats: UserStats,
): boolean {
  switch (criteriaType) {
    case 'lesson_count':
      return stats.completedLessonCount >= criteriaValue

    case 'course_completion':
      if (criteriaEntityId) {
        return stats.completedCourseEntityIds.has(criteriaEntityId)
      }
      return stats.completedCourseCount >= criteriaValue

    case 'roadmap_completion':
      if (criteriaEntityId) {
        return stats.completedRoadmapEntityIds.has(criteriaEntityId)
      }
      return stats.completedRoadmapCount >= criteriaValue

    case 'total_points':
      return stats.totalPoints >= criteriaValue

    case 'trainer_task_count':
      return stats.completedTrainerTaskCount >= criteriaValue

    default:
      return false
  }
}

async function recalculateTotalPoints(req: PayloadRequest, userId: number) {
  return withSpan('checkAchievements.recalculateTotalPoints', { 'user.id': userId }, async () => {
    const allTransactions = await req.payload.find({
      req,
      collection: 'points-transactions',
      where: { user: { equals: userId } },
      limit: 10000,
    })

    const totalPoints = allTransactions.docs.reduce((sum, tx) => sum + (tx.amount ?? 0), 0)

    await req.payload.update({
      req,
      collection: 'users',
      id: userId,
      data: { totalPoints },
      context: { skipHooks: true },
    })
  })
}
