import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { relationId } from '@/lib/relation-id'
import { withSpan } from '@/lib/telemetry'
import { skipHooksReq } from '@/lib/payload-req'
import { recordLearningActivity } from '@/server/notification-service'
import { utcDay } from '@/lib/streak'

/** Shared by lessons and server-verified trainer solutions. Calendar days stay UTC. */
export async function updateLearningStreak(req: PayloadRequest, userId: number, now = new Date()): Promise<void> {
  const today = utcDay(now)
  const existing = await req.payload.find({ req, collection: 'streaks', where: { user: { equals: userId } }, depth: 0, limit: 1 })
  const streak = existing.docs[0]
  const lastDate = streak?.lastActivityDate?.slice(0, 10)
  if (lastDate === today || (lastDate && lastDate > today)) return
  const yesterday = utcDay(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const currentStreak = lastDate === yesterday ? (streak?.currentStreak ?? 0) + 1 : 1
  const data = {
    currentStreak,
    longestStreak: Math.max(currentStreak, streak?.longestStreak ?? 0),
    lastActivityDate: today,
    totalActiveDays: (streak?.totalActiveDays ?? 0) + 1,
  }
  if (streak) {
    await req.payload.update({ req: skipHooksReq(req), collection: 'streaks', id: streak.id, data })
  } else {
    await req.payload.create({ req: skipHooksReq(req), collection: 'streaks', data: { user: userId, ...data } })
  }
}

export const updateStreak: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req, collection }) => {
  if (req.context?.skipHooks) return doc
  if (collection.slug === 'user-trainer-progress' && doc.verifiedBy !== 'server') return doc
  const justCompleted = doc.isCompleted === true && (operation === 'create' || previousDoc?.isCompleted !== true ||
      (collection.slug === 'user-trainer-progress' && previousDoc?.verifiedBy !== 'server'))
  if (!justCompleted) return doc
  const userId = relationId(doc.user)
  await withSpan('hook.updateStreak', { 'user.id': userId }, async () => {
    await updateLearningStreak(req, userId)
    await recordLearningActivity(req, userId)
  })
  return doc
}
