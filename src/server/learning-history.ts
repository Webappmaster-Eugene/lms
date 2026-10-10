import 'server-only'

import { APIError, createLocalReq, type Payload, type PayloadRequest, type Where } from 'payload'
import type { LessonLearningState, User } from '@/payload-types'
import type { LearningHistoryEntry, LearningHistoryPage } from '@/lib/learning-history'
import { learningRelationId, type LearningAccessSnapshot } from '@/lib/learning-access'
import { learningVideoHref, learningVideos, readVideoPositions } from '@/lib/learning-state'
import { collectAllPages } from '@/lib/paginate'
import { getLearningAccess } from '@/server/learning-access'
import { populateLearningVideoFiles } from '@/server/learning-videos'

type HistoryOptions = { page?: number; limit?: number; courseId?: number }
type HistoryState = Pick<LessonLearningState, 'id' | 'lesson' | 'lastViewedAt' | 'lastVideoId' | 'positions'>

async function historyRequest(payload: Payload, user: User, request?: PayloadRequest) {
  const req = request ?? await createLocalReq({ user }, payload)
  if (req.user?.id !== user.id) throw new APIError('Аккаунт изменился. Обновите страницу', 403)
  return req
}

function findHistoryStates(payload: Payload, user: User, page: number, limit: number, req: PayloadRequest, courseId?: number) {
  const where: Where = { user: { equals: user.id } }
  if (courseId !== undefined) where['lesson.course'] = { equals: courseId }
  // The collection applies the current owner/publication/grant policy before pagination.
  return payload.find({ collection: 'lesson-learning-states', where, sort: ['-lastViewedAt', '-id'], select: { lesson: true, lastViewedAt: true, lastVideoId: true, positions: true }, page, limit, depth: 0, overrideAccess: false, req })
}

export async function learningHistory(payload: Payload, user: User, options: HistoryOptions = {}, request?: PayloadRequest): Promise<LearningHistoryPage> {
  const req = await historyRequest(payload, user, request)
  const page = Number.isSafeInteger(options.page) && Number(options.page) > 0 ? Number(options.page) : 1
  const limit = Number.isSafeInteger(options.limit) && Number(options.limit) > 0 ? Math.min(Number(options.limit), 50) : 20
  const policy = await getLearningAccess(payload, user, req)
  const states = await findHistoryStates(payload, user, page, limit, req, options.courseId)
  const docs = await hydrateHistoryEntries(payload, user, states.docs, policy, req)
  return { docs, page, totalDocs: states.totalDocs, hasNextPage: states.hasNextPage }
}

async function hydrateHistoryEntries(payload: Payload, user: User, states: HistoryState[], policy: LearningAccessSnapshot, req: PayloadRequest): Promise<LearningHistoryEntry[]> {
  if (!states.length) return []
  const lessonIds = states.map((state) => learningRelationId(state.lesson)).filter((id): id is number => id !== null)
  const [lessonResult, progress] = await Promise.all([
    payload.find({ collection: 'lessons', where: { id: { in: lessonIds } }, select: { title: true, slug: true, course: true, section: true, isPublished: true, content: true, updatedAt: true, createdAt: true }, limit: lessonIds.length, depth: 0, overrideAccess: true, req }),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'user-progress', where: { user: { equals: user.id }, lesson: { in: lessonIds }, isCompleted: { equals: true } }, select: { lesson: true }, sort: 'id', page, limit, depth: 0, overrideAccess: true, req }), { label: 'завершения уроков истории' }),
  ])
  const permittedLessons = lessonResult.docs.filter((lesson) => policy.canAccessLessonMetadata(lesson))
  const lessons = new Map((await populateLearningVideoFiles(payload, permittedLessons, req)).map((lesson) => [lesson.id, lesson]))
  const courseIds = [...new Set([...lessons.values()].map((lesson) => learningRelationId(lesson.course)).filter((id): id is number => id !== null))]
  const courses = courseIds.length ? await payload.find({ collection: 'courses', where: { id: { in: courseIds } }, select: { title: true, slug: true }, limit: courseIds.length, depth: 0, overrideAccess: true, req }) : { docs: [] }
  const courseById = new Map(courses.docs.map((course) => [course.id, course]))
  const completedIds = new Set(progress.map((item) => learningRelationId(item.lesson)))
  const docs: LearningHistoryEntry[] = []
  for (const state of states) {
    const lessonId = learningRelationId(state.lesson)
    const lesson = lessonId === null ? undefined : lessons.get(lessonId)
    const courseId = lesson ? learningRelationId(lesson.course) : null
    const course = courseId === null ? undefined : courseById.get(courseId)
    if (!lesson || !course) continue
    const video = learningVideos(lesson).find((item) => item.id === state.lastVideoId)
    const position = video ? readVideoPositions(state.positions)[video.id] : undefined
    docs.push({ lessonId: lesson.id, title: lesson.title, courseId: course.id, course: course.title, courseSlug: course.slug, href: learningVideoHref(lesson.slug, video?.id), lastViewedAt: state.lastViewedAt, videoTitle: video?.title, seconds: position?.seconds, ended: position?.ended, isCompleted: completedIds.has(lesson.id) })
  }
  return docs
}

export async function recentLearningCourses(payload: Payload, user: User, limit = 6, request?: PayloadRequest): Promise<LearningHistoryEntry[]> {
  const req = await historyRequest(payload, user, request)
  const maximum = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 50) : 6
  const policy = await getLearningAccess(payload, user, req)
  const selected: HistoryState[] = []
  const seen = new Set<number>()
  let page = 1
  for (;;) {
    const states = await findHistoryStates(payload, user, page, 50, req)
    if (!states.docs.length) break
    const lessonIds = states.docs.map((state) => learningRelationId(state.lesson)).filter((id): id is number => id !== null)
    const metadata = await payload.find({ collection: 'lessons', where: { id: { in: lessonIds } }, select: { course: true, section: true, isPublished: true }, limit: lessonIds.length, depth: 0, overrideAccess: true, req })
    const lessons = new Map(metadata.docs.filter((lesson) => policy.canAccessLessonMetadata(lesson)).map((lesson) => [lesson.id, lesson]))
    for (const state of states.docs) {
      const lessonId = learningRelationId(state.lesson)
      const lesson = lessonId === null ? undefined : lessons.get(lessonId)
      const courseId = lesson ? learningRelationId(lesson.course) : null
      if (courseId === null || seen.has(courseId)) continue
      seen.add(courseId)
      selected.push(state)
      if (selected.length === maximum) return hydrateHistoryEntries(payload, user, selected, policy, req)
    }
    if (!states.hasNextPage) break
    page += 1
  }
  return hydrateHistoryEntries(payload, user, selected, policy, req)
}
