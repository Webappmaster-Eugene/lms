import type { PayloadRequest } from 'payload'
import { collectAllPages } from '@/lib/paginate'
import { relationKey } from '@/lib/course-lessons'
import { notBootcamp } from '@/lib/course-path'

/** Full published hierarchy, independent of the student's individual assignments. */
export async function loadPublishedProgrammeLessons(req: PayloadRequest, courseIds: (string | number)[]) {
  if (courseIds.length === 0) return []
  const [lessons, sections] = await Promise.all([
    collectAllPages(({ page, limit }) => req.payload.find({
      req, overrideAccess: true, collection: 'lessons', depth: 0, select: { course: true, section: true }, sort: 'id', page, limit,
      where: { course: { in: courseIds }, isPublished: { equals: true } },
    }), { label: 'уроки полной опубликованной программы' }),
    collectAllPages(({ page, limit }) => req.payload.find({
      req, overrideAccess: true, collection: 'sections', depth: 0, select: { course: true }, sort: 'id', page, limit,
      where: { course: { in: courseIds }, isPublished: { equals: true } },
    }), { label: 'секции полной опубликованной программы' }),
  ])
  const sectionCourses = new Map(sections.map(section => [String(section.id), relationKey(section.course)]))
  return lessons.filter(lesson => {
    const sectionId = relationKey(lesson.section)
    return sectionId === null || sectionCourses.get(sectionId) === relationKey(lesson.course)
  })
}

/** Publication defines the full programme; assignments never shrink its denominator. */
export async function isCourseCompleted(req: PayloadRequest, userId: number, courseId: string): Promise<boolean> {
  const [lessons, progress] = await Promise.all([
    loadPublishedProgrammeLessons(req, [courseId]),
    collectAllPages(({ page, limit }) => req.payload.find({
      req, overrideAccess: true, collection: 'user-progress', depth: 0, select: { lesson: true }, sort: 'id', page, limit,
      where: { user: { equals: userId }, isCompleted: { equals: true }, 'lesson.course': { equals: courseId } },
    }), { label: `пройденные уроки курса ${courseId}` }),
  ])
  const completed = new Set(progress.map(item => String(typeof item.lesson === 'object' ? item.lesson.id : item.lesson)))
  return lessons.length > 0 && lessons.every(lesson => completed.has(String(lesson.id)))
}

/** Роадмапы, чьи темы показывают курс как свой. */
export async function roadmapsSharingCourse(req: PayloadRequest, courseId: string): Promise<string[]> {
  const nodes = await collectAllPages(({ page, limit }) => req.payload.find({
    req, overrideAccess: true, collection: 'roadmap-nodes', depth: 0, select: { roadmap: true }, sort: 'id', page, limit,
    where: { and: [{ sharedCourses: { equals: courseId } }, { nodeType: { not_equals: 'category' } }, { 'roadmap.isPublished': { equals: true } }] },
  }), { label: `роадмапы, показывающие курс ${courseId}` })
  return [...new Set(nodes.flatMap(node => relationKey(node.roadmap) ?? []))]
}

/**
 * Курс «только по назначению» в общую программу роадмапа не входит: без него её не закончить.
 * Курсы других роадмапов входят, но только если их собственная карта опубликована: иначе закрытый
 * ученику курс сделал бы завершение недостижимым.
 */
export async function isRoadmapCompleted(req: PayloadRequest, userId: number, roadmapId: string): Promise<boolean> {
  const nodes = await collectAllPages(({ page, limit }) => req.payload.find({
    req, overrideAccess: true, collection: 'roadmap-nodes', depth: 0, select: { sharedCourses: true }, sort: 'id', page, limit,
    where: { and: [{ roadmap: { equals: roadmapId } }, { nodeType: { not_equals: 'category' } }] },
  }), { label: `темы программы роадмапа ${roadmapId}` })
  const sharedIds = [...new Set(nodes.flatMap(node => (node.sharedCourses ?? []).flatMap(course => relationKey(course) ?? [])))]
  const courses = await collectAllPages(({ page, limit }) => req.payload.find({
    req, overrideAccess: true, collection: 'courses', depth: 0, select: { roadmap: true }, sort: 'id', page, limit,
    // not_equals: true в SQL отбросил бы и курсы с пустым флажком: условие пишется явно.
    where: { and: [
      { or: [{ roadmap: { equals: roadmapId } }, ...(sharedIds.length ? [{ and: [{ id: { in: sharedIds } }, { 'roadmap.isPublished': { equals: true } }] }] : [])] },
      { isPublished: { equals: true } },
      { or: [{ assignedOnly: { equals: false } }, { assignedOnly: { exists: false } }] },
    ] },
  }), { label: `полная программа роадмапа ${roadmapId}` })
  if (courses.length === 0) return false
  // Чужие курсы дополняют программу, а не заменяют её: карта из одних курсов «только по назначению»
  // не завершается общим курсом. Карта совсем без своих курсов завершается: вся её программа общая.
  if (!courses.some(course => relationKey(course.roadmap) === roadmapId)) {
    const own = await req.payload.count({ req, overrideAccess: true, collection: 'courses', where: { and: [{ roadmap: { equals: roadmapId } }, { isPublished: { equals: true } }, notBootcamp] } })
    if (own.totalDocs > 0) return false
  }
  const courseIds = courses.map(course => course.id)
  const [lessons, progress] = await Promise.all([
    loadPublishedProgrammeLessons(req, courseIds),
    collectAllPages(({ page, limit }) => req.payload.find({
      req, overrideAccess: true, collection: 'user-progress', depth: 0, select: { lesson: true }, sort: 'id', page, limit,
      where: { user: { equals: userId }, isCompleted: { equals: true }, 'lesson.course': { in: courseIds } },
    }), { label: `прогресс роадмапа ${roadmapId}` }),
  ])
  const coveredCourses = new Set(lessons.map(lesson => String(typeof lesson.course === 'object' ? lesson.course.id : lesson.course)))
  const completed = new Set(progress.map(item => String(typeof item.lesson === 'object' ? item.lesson.id : item.lesson)))
  return courseIds.every(id => coveredCourses.has(String(id))) && lessons.every(lesson => completed.has(String(lesson.id)))
}
