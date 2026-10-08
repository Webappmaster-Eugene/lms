import type { PayloadRequest } from 'payload'
import { collectAllPages } from '@/lib/paginate'

/** Publication defines the full programme; assignments never shrink its denominator. */
export async function isCourseCompleted(req: PayloadRequest, userId: number, courseId: string): Promise<boolean> {
  const [lessons, progress] = await Promise.all([
    collectAllPages(({ page, limit }) => req.payload.find({
      req, collection: 'lessons', depth: 0, select: {}, sort: 'id', page, limit,
      where: { course: { equals: courseId }, isPublished: { equals: true } },
    }), { label: `полная программа курса ${courseId}` }),
    collectAllPages(({ page, limit }) => req.payload.find({
      req, collection: 'user-progress', depth: 0, select: { lesson: true }, sort: 'id', page, limit,
      where: { user: { equals: userId }, isCompleted: { equals: true }, 'lesson.course': { equals: courseId } },
    }), { label: `пройденные уроки курса ${courseId}` }),
  ])
  const completed = new Set(progress.map(item => String(typeof item.lesson === 'object' ? item.lesson.id : item.lesson)))
  return lessons.length > 0 && lessons.every(lesson => completed.has(String(lesson.id)))
}

export async function isRoadmapCompleted(req: PayloadRequest, userId: number, roadmapId: string): Promise<boolean> {
  const courses = await collectAllPages(({ page, limit }) => req.payload.find({
    req, collection: 'courses', depth: 0, select: {}, sort: 'id', page, limit,
    where: { roadmap: { equals: roadmapId }, isPublished: { equals: true } },
  }), { label: `полная программа роадмапа ${roadmapId}` })
  if (courses.length === 0) return false
  const courseIds = courses.map(course => course.id)
  const [lessons, progress] = await Promise.all([
    collectAllPages(({ page, limit }) => req.payload.find({
      req, collection: 'lessons', depth: 0, select: { course: true }, sort: 'id', page, limit,
      where: { course: { in: courseIds }, isPublished: { equals: true } },
    }), { label: `полная программа роадмапа ${roadmapId}` }),
    collectAllPages(({ page, limit }) => req.payload.find({
      req, collection: 'user-progress', depth: 0, select: { lesson: true }, sort: 'id', page, limit,
      where: { user: { equals: userId }, isCompleted: { equals: true }, 'lesson.course': { in: courseIds } },
    }), { label: `прогресс роадмапа ${roadmapId}` }),
  ])
  const coveredCourses = new Set(lessons.map(lesson => String(typeof lesson.course === 'object' ? lesson.course.id : lesson.course)))
  const completed = new Set(progress.map(item => String(typeof item.lesson === 'object' ? item.lesson.id : item.lesson)))
  return courseIds.every(id => coveredCourses.has(String(id))) && lessons.every(lesson => completed.has(String(lesson.id)))
}
