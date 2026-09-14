import type { CollectionAfterChangeHook } from 'payload'
import { relationId } from '@/lib/relation-id'
import { withSpan, logger } from '@/lib/telemetry'
import { skipHooksReq } from '@/lib/payload-req'

type StreakDoc = {
  id: string | number
  currentStreak?: number | null
  longestStreak?: number | null
  lastActivityDate?: string | null
  totalActiveDays?: number | null
}

/**
 * Hook: обновляет серию (streak) при завершении урока.
 */
export const updateStreak: CollectionAfterChangeHook = async ({
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
  const today = new Date().toISOString().split('T')[0]

  return withSpan('hook.updateStreak', { 'user.id': userId }, async () => {
    try {
      const existing = await req.payload.find({
        req,
        collection: 'streaks',
        where: { user: { equals: userId } },
        limit: 1,
      })

      if (existing.docs.length > 0) {
        const streak = existing.docs[0] as StreakDoc
        // Payload отдаёт дату полным ISO, а сравниваем мы календарные дни
        const lastDate = streak.lastActivityDate?.split('T')[0] ?? null

        if (lastDate === today) return doc

        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toISOString().split('T')[0]

        let newStreak: number
        if (lastDate === yesterdayStr) {
          newStreak = (streak.currentStreak ?? 0) + 1
        } else {
          newStreak = 1
        }

        const newLongest = Math.max(newStreak, streak.longestStreak ?? 0)

        await req.payload.update({
          req: skipHooksReq(req),
          collection: 'streaks',
          id: streak.id,
          data: {
            currentStreak: newStreak,
            longestStreak: newLongest,
            lastActivityDate: today,
            totalActiveDays: (streak.totalActiveDays ?? 0) + 1,
          },
        })
      } else {
        await req.payload.create({
          req: skipHooksReq(req),
          collection: 'streaks',
          data: {
            user: userId,
            currentStreak: 1,
            longestStreak: 1,
            lastActivityDate: today,
            totalActiveDays: 1,
          },
        })
      }
    } catch (err) {
      logger.error('Failed to update streak', err, { 'user.id': userId })
    }

    return doc
  })
}
