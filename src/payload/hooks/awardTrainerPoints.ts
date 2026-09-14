import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { DEFAULT_POINTS } from '@/lib/points-config'
import type { PointsReason } from '@/lib/points-config'
import { relationId } from '@/lib/relation-id'
import { withSpan, logger } from '@/lib/telemetry'
import { skipHooksReq } from '@/lib/payload-req'

/**
 * Hook: начисляет баллы при решении задачи тренажёра.
 *
 * Защита от дублей:
 * - Перед начислением проверяется наличие существующей транзакции
 * - При race condition (duplicate key) — ошибка перехватывается
 * - totalPoints пересчитывается как SUM всех транзакций (идемпотентно)
 *
 * Все обращения к БД идут через req: local API тогда работает в транзакции
 * исходного запроса. Без этого запись в users уходит отдельным соединением и
 * встаёт на блокировке, которую держит незавершённая внешняя транзакция.
 */
export const awardTrainerPoints: CollectionAfterChangeHook = async ({
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
  const taskId = relationId(doc.task)

  return withSpan('hook.awardTrainerPoints', { 'user.id': userId, 'task.id': taskId }, async () => {
    // Защита от повторного начисления
    const existingTx = await req.payload.find({
      req,
      collection: 'points-transactions',
      where: {
        user: { equals: userId },
        reason: { equals: 'trainer_task_completed' },
        relatedEntity: { equals: String(taskId) },
      },
      limit: 1,
    })

    if (existingTx.totalDocs > 0) {
      return doc
    }

    // Загружаем настройки баллов
    let taskPoints = DEFAULT_POINTS.TRAINER_TASK_COMPLETED as number

    try {
      const settings = await req.payload.findGlobal({ req, slug: 'site-settings' })
      if (settings.points) {
        const configuredPoints = (settings.points as Record<string, unknown>).trainerTaskCompleted
        if (typeof configuredPoints === 'number') {
          taskPoints = configuredPoints
        }
      }
    } catch {
      // fallback to defaults
    }

    // Проверяем, есть ли у задачи собственная награда
    try {
      const task = typeof doc.task === 'object'
        ? doc.task
        : await req.payload.findByID({ req, collection: 'trainer-tasks', id: taskId })

      if (task && typeof task.pointsReward === 'number' && task.pointsReward > 0) {
        taskPoints = task.pointsReward
      }
    } catch {
      // fallback to config/default
    }

    // Начисляем баллы
    const created = await safeCreateTransaction(
      req, userId, taskPoints, 'trainer_task_completed', String(taskId), 'Задача тренажёра решена',
    )

    // Пересчёт идемпотентен и выполняется всегда: если транзакция уже была, а
    // totalPoints разошёлся с суммой, иначе это расхождение не исправит ничто
    await recalculateTotalPoints(req, userId)

    if (created) {
      logger.info(`Trainer points awarded: ${taskPoints} points for user ${userId}, task ${taskId}`)
    }

    return doc
  })
}

async function safeCreateTransaction(
  req: PayloadRequest,
  userId: number,
  amount: number,
  reason: PointsReason,
  relatedEntity: string,
  description: string,
): Promise<boolean> {
  return withSpan('awardTrainerPoints.safeCreateTransaction', { 'user.id': userId, 'points.reason': reason }, async () => {
    const existing = await req.payload.find({
      req,
      collection: 'points-transactions',
      where: {
        user: { equals: userId },
        reason: { equals: reason },
        relatedEntity: { equals: relatedEntity },
      },
      limit: 1,
    })

    if (existing.totalDocs > 0) return false

    try {
      await req.payload.create({
        req: skipHooksReq(req),
        collection: 'points-transactions',
        data: {
          user: userId,
          amount,
          reason,
          relatedEntity,
          description,
        },
      })
      return true
    } catch {
      return false
    }
  })
}

async function recalculateTotalPoints(req: PayloadRequest, userId: number) {
  return withSpan('awardTrainerPoints.recalculateTotalPoints', { 'user.id': userId }, async () => {
    const allTransactions = await req.payload.find({
      req,
      collection: 'points-transactions',
      where: { user: { equals: userId } },
      limit: 10000,
    })

    const totalPoints = allTransactions.docs.reduce((sum, tx) => sum + (tx.amount ?? 0), 0)

    await req.payload.update({
      req: skipHooksReq(req),
      collection: 'users',
      id: userId,
      data: { totalPoints },
    })
  })
}
