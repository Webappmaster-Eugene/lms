import type { Access, Payload, PayloadRequest, Where } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import type { TutoringParticipant, TutoringStream } from '@/payload-types'

export function tutoringOpenThrough(stream: TutoringStream, member: TutoringParticipant) {
  return Math.max(member.currentMeeting, stream.currentMeeting)
}

export async function tutoringMemberships(payload: Payload, req: PayloadRequest, student: number) {
  const members = await collectAllPages(({ page, limit }) => payload.find({
    collection: 'tutoring-participants', overrideAccess: true, req, depth: 1, page, limit,
    where: { and: [{ student: { equals: student } }, { active: { equals: true } }, { 'stream.status': { equals: 'active' } }] },
  }), { label: 'Потоки репетиторства ученика' })
  return members.flatMap(member => {
    const stream = member.stream
    return stream && typeof stream !== 'number' && stream.status === 'active' ? [{ member, stream }] : []
  })
}

async function materialsAccess(req: PayloadRequest): Promise<false | true | Where> {
  if (!req.user) return false
  const policy = await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)
  if (policy.role === 'admin') return true
  const memberships = await tutoringMemberships(req.payload, req, req.user.id)
  if (!memberships.length) return false
  const allowed = new Map<TutoringStream['program'], number>()
  for (const { stream, member } of memberships) {
    allowed.set(stream.program, Math.max(allowed.get(stream.program) ?? 0, tutoringOpenThrough(stream, member)))
  }
  return { or: [...allowed].map(([program, number]) => ({
    program: { equals: program }, number: { less_than_equal: number },
  })) }
}

export const tutoringPresentationAccess: Access = async ({ req }) => {
  const access = await materialsAccess(req)
  // Старый файл доступен ученику, пока в карточке нет PDF новой версии.
  return typeof access === 'boolean' ? access : { and: [access, { deckPdf: { exists: false } }] }
}

export const tutoringDeckAccess: Access = async ({ req }) => {
  const access = await materialsAccess(req)
  if (typeof access === 'boolean') return access
  const meetings = await collectAllPages(({ page, limit }) => req.payload.find({
    collection: 'tutoring-meetings', req, page, limit, depth: 0, overrideAccess: true,
    where: { and: [access, { deckPdf: { exists: true } }] },
    select: { deckPdf: true },
  }), { label: 'PDF открытых занятий' })
  const ids = meetings.flatMap(({ deckPdf }) => deckPdf ? [typeof deckPdf === 'number' ? deckPdf : deckPdf.id] : [])
  return ids.length ? { id: { in: ids }, mimeType: { equals: 'application/pdf' } } : false
}
