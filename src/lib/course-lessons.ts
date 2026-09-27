import type { Payload } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import { orderCourseLessons, type LessonRef } from '@/lib/roadmap-next-step'

export type CourseLessons = {
  /** Все опубликованные уроки курса — по ним считается процент, как и в сертификатах. */
  allIds: Map<string, string[]>
  /** Уроки в порядке страницы курса — для «Продолжить» и навигации между уроками. */
  ordered: Map<string, LessonRef[]>
}

export function relationKey(ref: unknown): string | null {
  if (ref && typeof ref === 'object' && 'id' in ref) return String((ref as { id: number | string }).id)
  if (typeof ref === 'number' || typeof ref === 'string') return String(ref)
  return null
}

/**
 * Уроки нескольких курсов за два запроса. Порядок тот же, что на странице
 * курса: иначе «Продолжить» с дашборда вело бы не в тот урок, который ученик
 * видит первым в программе.
 */
export async function loadCourseLessons(
  payload: Payload,
  courseIds: (string | number)[],
  label: string,
): Promise<CourseLessons> {
  if (courseIds.length === 0) return { allIds: new Map(), ordered: new Map() }
  const ids = courseIds.map(String)

  const [lessonDocs, sectionDocs] = await Promise.all([
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'lessons',
          where: { course: { in: ids }, isPublished: { equals: true } },
          select: { course: true, section: true, order: true, slug: true, title: true },
          depth: 0,
          sort: 'id',
          page,
          limit,
        }),
      { label: `уроки: ${label}` },
    ),
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'sections',
          where: { course: { in: ids }, isPublished: { equals: true } },
          select: { order: true },
          depth: 0,
          sort: ['order', 'id'],
          page,
          limit,
        }),
      { label: `секции: ${label}` },
    ),
  ])

  const refs: LessonRef[] = lessonDocs.map((lesson) => ({
    id: String(lesson.id),
    slug: lesson.slug,
    title: lesson.title,
    courseId: relationKey(lesson.course) ?? '',
    sectionId: relationKey(lesson.section),
    order: lesson.order ?? 0,
  }))

  const allIds = new Map<string, string[]>()
  for (const ref of refs) {
    const bucket = allIds.get(ref.courseId) ?? []
    bucket.push(ref.id)
    allIds.set(ref.courseId, bucket)
  }

  const sectionRank = new Map(sectionDocs.map((section, index) => [String(section.id), index]))
  return { allIds, ordered: orderCourseLessons(refs, sectionRank) }
}
