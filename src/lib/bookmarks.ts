import type { Payload } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import type { User } from '@/payload-types'

type Target = { lesson: number | string } | { task: number | string } | { guide: number | string }

/** id закладки ученика на урок, задачу или гайд; null — не сохранено. */
export async function findBookmarkId(payload: Payload, userId: number | string, target: Target) {
  const [field, value] = 'lesson' in target ? ['lesson', target.lesson] : 'task' in target ? ['task', target.task] : ['guide', target.guide]
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
  kind: 'lesson' | 'task' | 'guide'
  title: string
  href: string
  /** Курс урока или тема задачи; у гайда контекста нет. */
  context: string | null
  savedAt: string
}

/**
 * «Сохранённое» ученика — свежие сверху. Снятые с публикации уроки, задачи и
 * гайды не показываются: ссылка на них вела бы в 404.
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
  const ids = (field: 'lesson' | 'task' | 'guide') => [
    ...new Set(bookmarks.flatMap((b) => (b[field] === null || b[field] === undefined ? [] : [Number(b[field])]))),
  ]
  const lessonIds = ids('lesson')
  const taskIds = ids('task')
  const guideIds = ids('guide')

  const [lessons, tasks, guides] = await Promise.all([
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
    guideIds.length === 0
      ? []
      : collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'guides',
              ...(viewer ? { overrideAccess: false, user: viewer } : {}),
              where: { id: { in: guideIds }, isPublished: { equals: true } },
              select: { title: true, slug: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `гайды закладок ${userId}` },
        ),
  ])
  const lessonById = new Map(lessons.map((l) => [Number(l.id), l]))
  const taskById = new Map(tasks.map((t) => [Number(t.id), t]))
  const guideById = new Map(guides.map((g) => [Number(g.id), g]))

  return bookmarks.flatMap((b): SavedItem[] => {
    const savedAt = b.createdAt
    if (b.lesson !== null && b.lesson !== undefined) {
      const lesson = lessonById.get(Number(b.lesson))
      if (!lesson) return []
      const course = typeof lesson.course === 'object' ? lesson.course : null
      return [{ id: String(b.id), kind: 'lesson', title: lesson.title, href: `/lessons/${lesson.slug}`, context: course?.title ?? null, savedAt }]
    }
    if (b.guide !== null && b.guide !== undefined) {
      const guide = guideById.get(Number(b.guide))
      return guide ? [{ id: String(b.id), kind: 'guide', title: guide.title, href: `/guides/${guide.slug}`, context: null, savedAt }] : []
    }
    const task = taskById.get(Number(b.task))
    const topic = task && typeof task.topic === 'object' ? task.topic : null
    if (!task || !topic?.slug) return []
    return [{ id: String(b.id), kind: 'task', title: task.title, href: `/trainer/${topic.slug}/${task.slug}`, context: topic.title, savedAt }]
  })
}
