import 'server-only'

import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import type { Payload, PayloadRequest } from 'payload'

import { relationId } from '@/lib/content-management/pages'
import { routeSlug } from '@/lib/route-slug'
import { isTutoringProgram, tutoringPrograms } from '@/lib/tutoring'
import { getBootcamps } from '@/server/bootcamps'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { getLearningRequest } from '@/server/learning-request'
import { tutoringMemberships } from '@/server/tutoring-access'
import type { User } from '@/payload-types'

export const tutoringBootcamps = cache(async (payload: Payload, req: PayloadRequest) => {
  const { docs: programs } = await payload.find({
    collection: 'bootcamp-programs', req, depth: 0, limit: Object.keys(tutoringPrograms).length, overrideAccess: true,
    where: { key: { in: Object.keys(tutoringPrograms) } },
    select: { key: true, manualsCourse: true },
  })
  const ids = programs.flatMap(({ manualsCourse }) => relationId(manualsCourse) ?? [])
  if (!ids.length) return []
  const { docs } = await payload.find({
    collection: 'courses', req, depth: 0, limit: ids.length, overrideAccess: true,
    where: { id: { in: ids }, isBootcamp: { equals: true }, isPublished: { equals: true } },
    select: { title: true, slug: true },
  })
  return programs.flatMap(({ key, manualsCourse }) => {
    const course = docs.find(doc => doc.id === relationId(manualsCourse))
    return course && isTutoringProgram(key) ? [{ id: course.id, title: course.title, slug: course.slug, program: key }] : []
  })
})

export async function bootcampMenuAvailable(payload: Payload, req: PayloadRequest, user: User) {
  if ((await getBootcamps(payload, user, req)).length) return true
  const memberships = await tutoringMemberships(payload, req, user.id)
  if (!memberships.length) return false
  return (await tutoringBootcamps(payload, req)).some(course => memberships.some(({ stream }) => stream.program === course.program))
}

export const tutoringArea = cache(async () => {
  const { payload, user, req } = await getLearningRequest()
  if (!user) redirect('/login')
  const isAdmin = (await getAuthoritativeLearningPolicy(payload, user.id, req)).role === 'admin'
  const [memberships, manuals, courses] = await Promise.all([
    isAdmin ? [] : tutoringMemberships(payload, req, user.id),
    getBootcamps(payload, user, req),
    tutoringBootcamps(payload, req),
  ])
  const tutoring = courses.filter(course => isAdmin || memberships.some(({ stream }) => stream.program === course.program))
  return { payload, req, user, isAdmin, memberships, manuals, tutoring }
})

export async function requireTutoringBootcamp(slug: string) {
  const area = await tutoringArea()
  const course = area.tutoring.find(item => item.slug === routeSlug(slug))
  if (!course) notFound()
  return { ...area, course, base: tutoringPath(course.slug), hasManuals: area.manuals.some(item => item.id === course.id) }
}

export function tutoringPath(slug: string) {
  return `/bootcamp/${encodeURIComponent(slug)}/tutoring`
}

export async function legacyTutoringStream(id: string, query: Record<string, string | string[] | undefined>) {
  const area = await tutoringArea()
  if (!/^[1-9]\d*$/.test(id)) notFound()
  const program = area.isAdmin
    ? (await area.payload.find({
      collection: 'tutoring-streams', where: { id: { equals: Number(id) } }, limit: 1, depth: 0,
      overrideAccess: false, req: area.req, select: { program: true },
    })).docs[0]?.program
    : area.memberships.find(({ stream }) => String(stream.id) === id)?.stream.program
  const course = area.tutoring.find(item => item.program === program)
  if (!course) notFound()
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') params.set(key, value)
  }
  redirect(`${tutoringPath(course.slug)}/streams/${id}${params.size ? `?${params}` : ''}`)
}
