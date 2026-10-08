import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type PayloadRequest } from 'payload'
import type { Lesson, User } from '@/payload-types'
import { learningVideoHref, learningVideos, readVideoPositions, type LearningState, type VideoPosition } from '@/lib/learning-state'
import { LearningAccessError, requireLessonAccess } from '@/server/learning-access'

export class LearningStateError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

export async function accessibleLearningLesson(payload: Payload, user: User, id: number, request?: PayloadRequest): Promise<Lesson> {
  const req = request ?? await createLocalReq({ user }, payload)
  let lesson
  try {
    lesson = await payload.findByID({ collection: 'lessons', id, depth: 1, overrideAccess: true, req })
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 404) throw new LearningStateError('Урок недоступен', 404)
    throw error
  }
  try {
    await requireLessonAccess(payload, user, lesson, req)
  } catch (error) {
    if (error instanceof LearningAccessError) throw new LearningStateError('Урок недоступен', error.status)
    throw error
  }
  return lesson
}

export async function getLearningState(payload: Payload, user: User, lesson: Lesson): Promise<LearningState> {
  const result = await payload.find({ collection: 'lesson-learning-states', where: { user: { equals: user.id }, lesson: { equals: lesson.id } }, limit: 1, depth: 0, overrideAccess: false, user })
  const state = result.docs[0]
  const validIds = new Set(learningVideos(lesson).map((video) => video.id))
  return {
    userId: user.id,
    positions: Object.fromEntries(Object.entries(readVideoPositions(state?.positions)).filter(([id]) => validIds.has(id))),
    lastVideoId: state?.lastVideoId && validIds.has(state.lastVideoId) ? state.lastVideoId : null,
    lastViewedAt: state?.lastViewedAt ?? null,
  }
}

export type LearningMutation = { at: number; videoId?: string; seconds?: number; ended?: boolean }

export function learningMutation(value: unknown, now = Date.now()): { lessonId: number; mutation: LearningMutation } {
  if (!value || typeof value !== 'object') throw new LearningStateError('Укажите урок')
  const data = value as Record<string, unknown>
  if (!Number.isSafeInteger(data.lessonId) || typeof data.lessonId !== 'number' || data.lessonId < 1) throw new LearningStateError('Укажите урок')
  if (typeof data.at !== 'number' || !Number.isFinite(data.at) || data.at < 0 || data.at > now + 60_000) throw new LearningStateError('Некорректное время просмотра')
  const mutation: LearningMutation = { at: Math.min(data.at, now) }
  if (data.videoId !== undefined) {
    if (typeof data.videoId !== 'string' || data.videoId.length > 160 || typeof data.seconds !== 'number' || !Number.isFinite(data.seconds) || data.seconds < 0 || data.seconds > 604800 || typeof data.ended !== 'boolean') {
      throw new LearningStateError('Некорректная позиция видео')
    }
    mutation.videoId = data.videoId
    mutation.seconds = Math.floor(data.seconds)
    mutation.ended = data.ended
  }
  return { lessonId: data.lessonId, mutation }
}

interface TransactionAdapter {
  sessions: Record<string | number, { db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } } | undefined>
}

async function lockViewer(req: PayloadRequest, userId: number) {
  const transactionId = await req.transactionID
  const adapter = req.payload.db as unknown as TransactionAdapter
  const db = transactionId === undefined ? undefined : adapter.sessions[transactionId]?.db
  if (!db) throw new Error('Viewing history requires a PostgreSQL transaction')
  await db.execute(sql`select pg_advisory_xact_lock(7203, ${userId})`)
}

export async function saveLearningState(payload: Payload, user: User, lesson: Lesson, mutation: LearningMutation) {
  const videos = learningVideos(lesson)
  if (mutation.videoId && !videos.some((video) => video.id === mutation.videoId)) throw new LearningStateError('Видео обновлено. Обновите страницу', 409)
  const req = await createLocalReq({ user }, payload)
  await initTransaction(req)
  try {
    await lockViewer(req, user.id)
    const found = await payload.find({ collection: 'lesson-learning-states', where: { user: { equals: user.id }, lesson: { equals: lesson.id } }, limit: 1, depth: 0, overrideAccess: false, user, req })
    const existing = found.docs[0]
    // Even server-owned Local API writes verify document ownership before overrideAccess.
    if (existing && existing.user !== user.id) throw new LearningStateError('Доступ запрещён', 403)
    const positions = readVideoPositions(existing?.positions)
    const validIds = new Set(videos.map((video) => video.id))
    for (const id of Object.keys(positions)) if (!validIds.has(id)) delete positions[id]
    const previousAt = existing ? new Date(existing.lastViewedAt).getTime() : 0
    let lastVideoId = existing?.lastVideoId ?? null
    if (mutation.videoId && (!positions[mutation.videoId] || positions[mutation.videoId].at < mutation.at)) {
      positions[mutation.videoId] = { at: mutation.at, seconds: mutation.seconds ?? 0, ended: mutation.ended ?? false }
      if (mutation.at >= previousAt) lastVideoId = mutation.videoId
    }
    const data = { user: user.id, lesson: lesson.id, positions, lastVideoId, lastViewedAt: new Date(Math.max(previousAt, mutation.at)).toISOString() }
    if (existing) await payload.update({ collection: 'lesson-learning-states', id: existing.id, data, req, depth: 0, overrideAccess: true })
    else await payload.create({ collection: 'lesson-learning-states', data, req, depth: 0, overrideAccess: true })
    await commitTransaction(req)
    return { userId: user.id, positions, lastVideoId, lastViewedAt: data.lastViewedAt } satisfies LearningState
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}

export async function latestLearningResume(payload: Payload, user: User) {
  const req = await createLocalReq({ user }, payload)
  // Pagination avoids a hidden limit when recent lessons have since been unpublished.
  let page = 1
  for (;;) {
    const states = await payload.find({ collection: 'lesson-learning-states', where: { user: { equals: user.id } }, sort: ['-lastViewedAt', '-id'], depth: 0, overrideAccess: false, user, page, limit: 20 })
    for (const state of states.docs) {
      try {
        const id = typeof state.lesson === 'object' ? state.lesson.id : state.lesson
        const lesson = await accessibleLearningLesson(payload, user, id, req)
        const video = learningVideos(lesson).find((item) => item.id === state.lastVideoId)
        const position: VideoPosition | undefined = video ? readVideoPositions(state.positions)[video.id] : undefined
        return { title: lesson.title, course: typeof lesson.course === 'object' ? lesson.course.title : '', href: learningVideoHref(lesson.slug, video?.id), videoTitle: video?.title, seconds: position?.seconds, ended: position?.ended, lastViewedAt: state.lastViewedAt }
      } catch (error) {
        if (error instanceof LearningStateError && (error.status === 404 || error.status === 403)) continue
        throw error
      }
    }
    if (!states.hasNextPage) return null
    page += 1
  }
}
