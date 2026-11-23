import { cache } from 'react'
import type { Payload, PayloadRequest } from 'payload'

import { learningRelationId } from '@/lib/learning-access'
import { isTutoringProgram, tutoringPrograms } from '@/lib/tutoring'

export const tutoringBootcamps = cache(async (payload: Payload, req: PayloadRequest) => {
  const { docs: programs } = await payload.find({
    collection: 'bootcamp-programs', req, depth: 0, limit: Object.keys(tutoringPrograms).length, overrideAccess: true,
    where: { key: { in: Object.keys(tutoringPrograms) } },
    select: { key: true, manualsCourse: true },
  })
  const ids = programs.flatMap(({ manualsCourse }) => learningRelationId(manualsCourse) ?? [])
  if (!ids.length) return []
  const { docs } = await payload.find({
    collection: 'courses', req, depth: 0, limit: ids.length, overrideAccess: true,
    where: { id: { in: ids }, isBootcamp: { equals: true }, isPublished: { equals: true } },
    select: { title: true, slug: true },
  })
  return programs.flatMap(({ key, manualsCourse }) => {
    const course = docs.find(doc => doc.id === learningRelationId(manualsCourse))
    return course && isTutoringProgram(key) ? [{ id: course.id, title: course.title, slug: course.slug, program: key }] : []
  })
})
