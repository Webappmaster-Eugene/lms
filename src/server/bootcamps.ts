import 'server-only'

import { cache } from 'react'
import type { Payload, PayloadRequest } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import { browsableCourseIds } from '@/server/learning-access'
import type { User } from '@/payload-types'

export type Bootcamp = { id: number; title: string; slug: string }

/**
 * Буткемпы, которые видит пользователь: опубликованный курс с флагом и назначенный ему
 * (администратору — все). Один раз на рендер: его зовут и layout, и страница.
 */
export const getBootcamps = cache(async (payload: Payload, user: User, req: PayloadRequest): Promise<Bootcamp[]> => {
  const courses = await collectAllPages(
    ({ page, limit }) => payload.find({ collection: 'courses', where: { isBootcamp: { equals: true }, isPublished: { equals: true } }, select: { title: true, slug: true, roadmap: true, roadmapNode: true, isPublished: true, assignedOnly: true }, sort: ['order', 'id'], depth: 0, overrideAccess: true, req, page, limit }),
    { label: 'буткемпы' },
  )
  if (courses.length === 0) return []
  const visible = await browsableCourseIds(payload, user, courses, req)
  return courses.filter((course) => visible.has(course.id)).map(({ id, title, slug }) => ({ id, title, slug }))
})
