import type { Access, Payload, PayloadRequest, Where } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import { tutoringPrograms, type TutoringProgram } from '@/lib/tutoring'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import type { TutoringParticipant, TutoringStream } from '@/payload-types'

export function tutoringOpenThrough(stream: TutoringStream, member: TutoringParticipant) {
  return stream.awaitingFirstLecture ? 0 : Math.max(member.currentMeeting, stream.currentMeeting)
}

const activeStream: Where = { and: [{ active: { equals: true } }, { 'stream.status': { equals: 'active' } }] }

export async function tutoringLibraryMemberships(payload: Payload, req: PayloadRequest, student: number) {
  const members = await collectAllPages(({ page, limit }) => payload.find({
    collection: 'tutoring-participants', overrideAccess: true, req, depth: 1, page, limit,
    where: { and: [{ student: { equals: student } }, { or: [activeStream, { graduatedThrough: { exists: true } }] }] },
    populate: { users: { firstName: true } },
  }), { label: 'Учебные материалы менторства' })
  return members.flatMap(member => {
    const stream = member.stream
    if (!stream || typeof stream === 'number') return []
    if (member.active && stream.status === 'active') return [{ member, stream, openThrough: tutoringOpenThrough(stream, member) }]
    return !member.active && member.graduatedThrough != null ? [{ member, stream, openThrough: member.graduatedThrough }] : []
  })
}

export async function tutoringMemberships(payload: Payload, req: PayloadRequest, student: number) {
  return (await tutoringLibraryMemberships(payload, req, student)).filter(({ member, stream }) => member.active && stream.status === 'active')
}

async function materialLimits(req: PayloadRequest) {
  if (!req.user || req.user.isActive === false) return false
  const policy = await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)
  if (policy.role === 'admin') return true
  const memberships = await tutoringLibraryMemberships(req.payload, req, req.user.id)
  const allowed = new Map<TutoringProgram, number>()
  for (const { stream, openThrough } of memberships) {
    allowed.set(stream.program, Math.max(allowed.get(stream.program) ?? 0, openThrough))
  }
  return allowed
}

async function technicalMaterials(req: PayloadRequest, mentoring: Map<TutoringProgram, number>): Promise<Where | false> {
  const allowed = new Map(mentoring)
  const { getBootcamps } = await import('@/server/bootcamps')
  if (!req.user) return false
  const manuals = await getBootcamps(req.payload, req.user, req)
  if (manuals.length) {
    const [{ getLearningAccess }, { tutoringBootcamps }] = await Promise.all([import('@/server/learning-access'), import('@/server/tutoring-curriculum')])
    const policy = await getLearningAccess(req.payload, req.user, req)
    const paidCourses = new Set(manuals.filter(course => policy.canReadCourseDescription(course.id)).map(course => course.id))
    for (const course of await tutoringBootcamps(req.payload, req)) {
      if (paidCourses.has(course.id)) allowed.set(course.program, tutoringPrograms[course.program].meetings)
    }
  }
  if (!allowed.size) return false
  return { or: [...allowed].map(([program, number]) => ({
    program: { equals: program }, number: { less_than_equal: number },
  })) }
}

export const tutoringPresentationAccess: Access = async ({ req }) => {
  const limits = await materialLimits(req)
  if (typeof limits === 'boolean') return limits
  const where = await technicalMaterials(req, limits)
  // Старый файл доступен ученику, пока в карточке нет PDF новой версии.
  return where && { and: [where, { deckPdf: { exists: false } }] }
}

export const tutoringIntroductionAccess: Access = async ({ req }) => {
  const limits = await materialLimits(req)
  if (typeof limits === 'boolean') return limits
  return limits.size > 0 && { program: { in: [...limits.keys()] } }
}

export const tutoringDeckAccess: Access = async ({ req }) => {
  const limits = await materialLimits(req)
  if (typeof limits === 'boolean') return limits
  const where = await technicalMaterials(req, limits)
  const [meetings, introductions] = await Promise.all([
    where ? collectAllPages(({ page, limit }) => req.payload.find({
      collection: 'tutoring-meetings', req, page, limit, depth: 0, overrideAccess: true,
      where: { and: [where, { deckPdf: { exists: true } }] }, select: { deckPdf: true },
    }), { label: 'PDF открытых занятий' }) : [],
    limits.size ? collectAllPages(({ page, limit }) => req.payload.find({
      collection: 'tutoring-introductions', req, page, limit, depth: 0, overrideAccess: true,
      where: { program: { in: [...limits.keys()] } }, select: { deckPdf: true },
    }), { label: 'PDF вводных встреч' }) : [],
  ])
  const ids = [...meetings, ...introductions].flatMap(({ deckPdf }) => deckPdf ? [typeof deckPdf === 'number' ? deckPdf : deckPdf.id] : [])
  return ids.length ? { id: { in: ids }, mimeType: { equals: 'application/pdf' } } : false
}
