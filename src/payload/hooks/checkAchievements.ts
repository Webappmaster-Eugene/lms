import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { relationId } from '@/lib/relation-id'
import { withSpan } from '@/lib/telemetry'
import { skipHooksReq } from '@/lib/payload-req'
import { streakView } from '@/lib/streak'
import { collectAllPages } from '@/lib/paginate'

/**
 * Hook: проверяет и выдаёт достижения при изменении прогресса пользователя.
 *
 * Запускается на collection: user-progress, afterChange (после awardPoints).
 *
 * Все обращения к БД идут через req: local API тогда работает в транзакции
 * исходного запроса. Без этого запись в users уходит отдельным соединением и
 * встаёт на блокировке, которую держит незавершённая внешняя транзакция.
 */
export const checkAchievements: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
  collection,
}) => {
  if (req.context?.skipHooks) return doc
  if (collection.slug === 'user-trainer-progress' && doc.verifiedBy !== 'server') return doc

  const justCompleted =
    doc.isCompleted === true &&
    (operation === 'create' || previousDoc?.isCompleted !== true ||
      (collection.slug === 'user-trainer-progress' && previousDoc?.verifiedBy !== 'server'))

  if (!justCompleted) return doc

  const userId = relationId(doc.user)

  return withSpan('hook.checkAchievements', { 'user.id': userId }, async () => {
    // Загружаем данные параллельно
    const [achievementDocs, userAchievementDocs, user, completedLessons, courseBonuses, roadmapBonuses, trainerProgress, streaks] =
      await Promise.all([
        collectAllPages(
          ({ page, limit }) =>
            req.payload.find({
              req,
              collection: 'achievements',
              where: { isActive: { equals: true } },
              sort: 'id',
              page,
              limit,
            }),
          { label: 'активные достижения' },
        ),
        collectAllPages(
          ({ page, limit }) =>
            req.payload.find({
              req,
              collection: 'user-achievements',
              where: { user: { equals: userId } },
              select: { achievement: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `достижения пользователя ${userId}` },
        ),
        req.payload.findByID({ req, collection: 'users', id: userId }),
        collectAllPages(({ page, limit }) => req.payload.find({
          req, collection: 'user-progress', depth: 0, select: { lesson: true }, sort: 'id', page, limit,
          where: { user: { equals: userId }, isCompleted: { equals: true } },
        }), { label: `уникальные пройденные уроки пользователя ${userId}` }),
        collectAllPages(
          ({ page, limit }) =>
            req.payload.find({
              req,
              collection: 'certificates',
              where: {
                user: { equals: userId },
                type: { equals: 'course' },
              },
              select: { relatedEntity: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `бонусы за курсы пользователя ${userId}` },
        ),
        collectAllPages(
          ({ page, limit }) =>
            req.payload.find({
              req,
              collection: 'certificates',
              where: {
                user: { equals: userId },
                type: { equals: 'roadmap' },
              },
              select: { relatedEntity: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `бонусы за роадмапы пользователя ${userId}` },
        ),
        req.payload.find({
          req,
          collection: 'user-trainer-progress',
          where: {
            user: { equals: userId },
            isCompleted: { equals: true },
            verifiedBy: { equals: 'server' },
          },
          limit: 0, // только totalDocs
        }),
        req.payload.find({ req, collection: 'streaks', where: { user: { equals: userId } }, depth: 0, limit: 1 }),
      ])

    const unlockedIds = new Set(
      userAchievementDocs.map((ua) =>
        String(typeof ua.achievement === 'object' ? ua.achievement.id : ua.achievement),
      ),
    )

    // Множества конкретных завершённых сущностей
    const completedCourseEntityIds = new Set(
      courseBonuses
        .filter((t) => t.relatedEntity)
        .map((t) => String(t.relatedEntity)),
    )

    const completedRoadmapEntityIds = new Set(
      roadmapBonuses
        .filter((t) => t.relatedEntity)
        .map((t) => String(t.relatedEntity)),
    )

    const stats: UserStats = {
      completedLessonCount: new Set(completedLessons.map(progress => String(typeof progress.lesson === 'object' ? progress.lesson.id : progress.lesson))).size,
      completedCourseCount: completedCourseEntityIds.size,
      completedRoadmapCount: completedRoadmapEntityIds.size,
      completedTrainerTaskCount: trainerProgress.totalDocs,
      totalPoints: user.totalPoints ?? 0,
      streakDays: streakView(streaks.docs[0]).days,
      completedCourseEntityIds,
      completedRoadmapEntityIds,
    }

    let pointsAwarded = 0

    // Points goals run after activity rewards and in ascending threshold order.
    const ordered = [...achievementDocs].sort((a, b) => {
      if (a.criteriaType === 'total_points' && b.criteriaType !== 'total_points') return 1
      if (b.criteriaType === 'total_points' && a.criteriaType !== 'total_points') return -1
      return a.criteriaType === 'total_points' ? a.criteriaValue - b.criteriaValue : a.id - b.id
    })
    for (const achievement of ordered) {
      if (unlockedIds.has(String(achievement.id))) continue

      const met = checkCriteria(
        achievement.criteriaType ?? '',
        achievement.criteriaValue ?? 0,
        achievement.criteriaEntityId ?? null,
        stats,
      )

      if (!met) continue

      // Выдаём достижение
      // The owning user row is locked before any progress write. Propagate DB
      // failures so progress, rewards and notifications roll back together.
      // Без skipHooks: хуки достижения шлют письмо и уведомление в колокольчик
      await req.payload.create({
        req,
        collection: 'user-achievements',
        data: {
          user: userId,
          achievement: achievement.id,
          unlockedAt: new Date().toISOString(),
        },
      })

      // Начисляем бонусные баллы за достижение
      if (achievement.pointsReward && achievement.pointsReward > 0) {
        await req.payload.create({
          req: skipHooksReq(req),
          collection: 'points-transactions',
          data: {
            user: userId,
            amount: achievement.pointsReward,
            reason: 'achievement_unlocked' as const,
            relatedEntity: String(achievement.id),
            description: `Достижение: ${achievement.title}`,
          },
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
  streakDays: number
  completedCourseEntityIds: Set<string>
  completedRoadmapEntityIds: Set<string>
}

export function checkCriteria(
  criteriaType: string,
  criteriaValue: number,
  criteriaEntityId: string | null,
  stats: UserStats,
): boolean {
  if (!Number.isFinite(criteriaValue) || criteriaValue < 1) return false
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

    case 'streak_days':
      return stats.streakDays >= criteriaValue

    case 'trainer_task_count':
      return stats.completedTrainerTaskCount >= criteriaValue

    default:
      return false
  }
}

async function recalculateTotalPoints(req: PayloadRequest, userId: number) {
  return withSpan('checkAchievements.recalculateTotalPoints', { 'user.id': userId }, async () => {
    const transactions = await collectAllPages(
      ({ page, limit }) =>
        req.payload.find({
          req,
          collection: 'points-transactions',
          where: { user: { equals: userId } },
          select: { amount: true },
          depth: 0,
          sort: 'id',
          page,
          limit,
        }),
      { label: `транзакции баллов пользователя ${userId}` },
    )

    const totalPoints = transactions.reduce((sum, tx) => sum + (tx.amount ?? 0), 0)

    await req.payload.update({
      req: skipHooksReq(req),
      collection: 'users',
      id: userId,
      data: { totalPoints },
    })
  })
}
