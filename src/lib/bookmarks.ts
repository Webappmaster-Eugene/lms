import type { Payload } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import type { User } from '@/payload-types'

type Target = { lesson: number | string } | { task: number | string }

/** id закладки ученика на урок или задачу; null — не сохранено. */
export async function findBookmarkId(payload: Payload, userId: number | string, target: Target) {
  const [field, value] = 'lesson' in target ? ['lesson', target.lesson] : ['task', target.task]
  const result = await payload.find({
    collection: 'bookmarks',
    where: { user: { equals: userId }, [field]: { equals: value } },
    select: {},
    depth: 0,
    limit: 1,
  })
  return result.docs[0]?.id ?? null
}

export type SavedItem = {
  id: string
  kind: 'lesson' | 'task'
  title: string
  href: string
  /** Курс урока или тема задачи. */
  context: string | null
  savedAt: string
}

/**
 * «Сохранённое» ученика — свежие сверху. Снятые с публикации уроки и задачи
 * не показываются: ссылка на них вела бы в 404.
 */
export async function loadSaved(payload: Payload, userId: number | string, viewer?: User): Promise<SavedItem[]> {
  const bookmarks = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'bookmarks',
        ...(viewer ? { overrideAccess: false, user: viewer } : {}),
        where: { user: { equals: userId } },
        depth: 0,
        sort: ['-createdAt', 'id'],
        page,
        limit,
      }),
    { label: `закладки пользователя ${userId}` },
  )
  const ids = (field: 'lesson' | 'task') => [
    ...new Set(bookmarks.flatMap((b) => (b[field] === null || b[field] === undefined ? [] : [Number(b[field])]))),
  ]
  const lessonIds = ids('lesson')
  const taskIds = ids('task')

  const [lessons, tasks] = await Promise.all([
    lessonIds.length === 0
      ? []
      : collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'lessons',
              ...(viewer ? { overrideAccess: false, user: viewer } : {}),
              where: { id: { in: lessonIds }, isPublished: { equals: true } },
              select: { title: true, slug: true, course: true },
              populate: { courses: { title: true } },
              depth: 1,
              sort: 'id',
              page,
              limit,
            }),
          { label: `уроки закладок ${userId}` },
        ),
    taskIds.length === 0
      ? []
      : collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'trainer-tasks',
              ...(viewer ? { overrideAccess: false, user: viewer } : {}),
              where: { id: { in: taskIds }, isPublished: { equals: true } },
              select: { title: true, slug: true, topic: true },
              populate: { 'trainer-topics': { title: true, slug: true } },
              depth: 1,
              sort: 'id',
              page,
              limit,
            }),
          { label: `задачи закладок ${userId}` },
        ),
  ])
  const lessonById = new Map(lessons.map((l) => [Number(l.id), l]))
  const taskById = new Map(tasks.map((t) => [Number(t.id), t]))

  return bookmarks.flatMap((b): SavedItem[] => {
    const savedAt = b.createdAt
    if (b.lesson !== null && b.lesson !== undefined) {
      const lesson = lessonById.get(Number(b.lesson))
      if (!lesson) return []
      const course = typeof lesson.course === 'object' ? lesson.course : null
      return [{ id: String(b.id), kind: 'lesson', title: lesson.title, href: `/lessons/${lesson.slug}`, context: course?.title ?? null, savedAt }]
    }
    const task = taskById.get(Number(b.task))
    const topic = task && typeof task.topic === 'object' ? task.topic : null
    if (!task || !topic?.slug) return []
    return [{ id: String(b.id), kind: 'task', title: task.title, href: `/trainer/${topic.slug}/${task.slug}`, context: topic.title, savedAt }]
  })
}
