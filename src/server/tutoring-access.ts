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

export const tutoringPresentationAccess: Access = async ({ req }): Promise<false | Where> => {
  if (!req.user) return false
  const policy = await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)
  if (policy.role === 'admin') return { id: { exists: true } }
  const memberships = await tutoringMemberships(req.payload, req, req.user.id)
  if (!memberships.length) return false
  const allowed = new Map<TutoringStream['program'], number>()
  for (const { stream, member } of memberships) {
    allowed.set(stream.program, Math.max(allowed.get(stream.program) ?? 0, tutoringOpenThrough(stream, member)))
  }
  const or: Where[] = [...allowed].map(([program, number]) => ({
    program: { equals: program }, number: { less_than_equal: number },
  }))
  return { or }
}
