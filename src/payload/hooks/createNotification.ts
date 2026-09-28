import type { CollectionAfterChangeHook } from 'payload'
import { withSpan, logger } from '@/lib/telemetry'
import { relationId } from '@/lib/relation-id'
import { skipHooksReq } from '@/lib/payload-req'

/**
 * Hook: создаёт in-app уведомление при важных событиях.
 */
export const createPointsNotification: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc
  if (req.context?.skipHooks) return doc

  // Числом: запись в поле связи строку не принимает
  const userId = relationId(doc.user)
  const reason = doc.reason as string

  const notificationMap: Record<string, { title: string; type: string; link: string }> = {
    course_completed: {
      title: 'Курс завершён!',
      type: 'course_completed',
      link: '/profile',
    },
    roadmap_completed: {
      title: 'Роадмап завершён!',
      type: 'roadmap_completed',
      link: '/profile',
    },
  }

  const config = notificationMap[reason]
  if (!config) return doc

  return withSpan('hook.createPointsNotification', { 'user.id': userId, 'notification.type': config.type }, async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (req.payload as any).create({
        req: skipHooksReq(req),
        collection: 'notifications',
        data: {
          user: userId,
          title: config.title,
          message: doc.description ?? `+${doc.amount} баллов`,
          type: config.type,
          link: config.link,
          isRead: false,
        },
      })
    } catch (err) {
      logger.error('Failed to create notification', err, { 'user.id': userId, 'notification.type': config.type })
    }

    return doc
  })
}

export const createAchievementNotification: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc
  if (req.context?.skipHooks) return doc

  // Числом: запись в поле связи строку не принимает
  const userId = relationId(doc.user)

  return withSpan('hook.createAchievementNotification', { 'user.id': userId }, async () => {
    try {
      const achievementId = String(
        typeof doc.achievement === 'object' ? doc.achievement.id : doc.achievement,
      )
      const achievement = await req.payload.findByID({
        req,
        collection: 'achievements',
        id: achievementId,
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (req.payload as any).create({
        req: skipHooksReq(req),
        collection: 'notifications',
        data: {
          user: userId,
          title: `Достижение: ${achievement.title}`,
          message: achievement.description ?? '',
          type: 'achievement',
          link: '/profile',
          isRead: false,
        },
      })
    } catch (err) {
      logger.error('Failed to create achievement notification', err, { 'user.id': userId })
    }

    return doc
  })
}
