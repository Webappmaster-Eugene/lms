import 'server-only'

import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import type { Payload, PayloadRequest } from 'payload'

import { routeSlug } from '@/lib/route-slug'
import { tutoringPrograms, type TutoringProgram } from '@/lib/tutoring'
import { getLearningAccess } from '@/server/learning-access'
import { getBootcamps } from '@/server/bootcamps'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { getLearningRequest } from '@/server/learning-request'
import { tutoringLibraryMemberships } from '@/server/tutoring-access'
import type { User } from '@/payload-types'
import { tutoringBootcamps } from '@/server/tutoring-curriculum'

export async function bootcampMenuAvailable(payload: Payload, req: PayloadRequest, user: User) {
  return (await getBootcamps(payload, user, req)).length > 0
}

export async function tutoringMenuAvailable(payload: Payload, req: PayloadRequest, user: User) {
  return user.isActive !== false && (user.role === 'admin' || (await tutoringLibraryMemberships(payload, req, user.id)).length > 0)
}

const area = cache(async () => {
  const { payload, user, req } = await getLearningRequest()
  if (!user || user.isActive === false) redirect('/login')
  const isAdmin = (await getAuthoritativeLearningPolicy(payload, user.id, req)).role === 'admin'
  return { payload, user, req, isAdmin }
})

export const bootcampArea = cache(async () => {
  const info = await area()
  return { ...info, manuals: await getBootcamps(info.payload, info.user, info.req) }
})

export const bootcampLectureArea = cache(async (slug: string) => {
  const info = await bootcampArea()
  const manual = info.manuals.find(item => item.slug === slug)
  if (!manual || (!info.isAdmin && !(await getLearningAccess(info.payload, info.user, info.req)).canReadCourseDescription(manual.id))) return null
  const course = (await tutoringBootcamps(info.payload, info.req)).find(item => item.id === manual.id)
  return course ? { ...info, course, base: `/bootcamp/${encodeURIComponent(slug)}/lectures` } : null
})

export const tutoringArea = cache(async () => {
  const info = await area()
  const { payload, req, user, isAdmin } = info
  const [libraryMemberships, courses] = await Promise.all([
    isAdmin ? [] : tutoringLibraryMemberships(payload, req, user.id),
    tutoringBootcamps(payload, req),
  ])
  const tutoring = courses.filter(course => isAdmin || libraryMemberships.some(({ stream }) => stream.program === course.program))
  const memberships = libraryMemberships.filter(({ member, stream }) => member.active && stream.status === 'active')
  return { ...info, memberships, libraryMemberships, tutoring }
})

export async function requireTutoringProgram(program: string) {
  const info = await tutoringArea()
  const course = info.tutoring.find(item => item.program === program)
  if (!course) notFound()
  const openThrough = info.isAdmin ? tutoringPrograms[course.program].meetings : info.libraryMemberships.reduce(
    (open, entry) => entry.stream.program === course.program ? Math.max(open, entry.openThrough) : open, 0)
  return { ...info, course, base: tutoringPath(course.program), openThrough }
}

export function tutoringPath(program: TutoringProgram) {
  return `/tutoring/${program}`
}

export async function legacyTutoringPath(slug: string) {
  const info = await tutoringArea()
  const course = info.tutoring.find(item => item.slug === routeSlug(slug))
  if (!course) notFound()
  return tutoringPath(course.program)
}

export async function legacyTutoringStream(id: string, query: Record<string, string | string[] | undefined>) {
  const area = await tutoringArea()
  if (!/^[1-9]\d*$/.test(id)) notFound()
  const program = area.isAdmin
    ? (await area.payload.find({
      collection: 'tutoring-streams', where: { id: { equals: Number(id) } }, limit: 1, depth: 0,
      overrideAccess: false, req: area.req, select: { program: true },
    })).docs[0]?.program
    : area.libraryMemberships.find(({ stream }) => String(stream.id) === id)?.stream.program
  const course = area.tutoring.find(item => item.program === program)
  if (!course) notFound()
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') params.set(key, value)
  }
  return redirect(`${tutoringPath(course.program)}/streams/${id}${params.size ? `?${params}` : ''}`)
}
