import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import { relationId } from '@/lib/relation-id'
import type { TutoringParticipant, TutoringStream } from '@/payload-types'

type Membership = { member: TutoringParticipant; stream: TutoringStream; openThrough: number }

export async function studentMeetingCharges(payload: Payload, req: PayloadRequest, memberships: Membership[]) {
  if (!req.user || req.user.isActive === false) return []
  const studentId = req.user.id
  const own = new Map(memberships.filter(({ member }) => relationId(member.student) === studentId)
    .map(entry => [entry.member.id, entry]))
  if (!own.size) return []
  const participantIds = [...own.keys()]
  const charges = await collectAllPages(({ page, limit }) => payload.find({
    collection: 'tutoring-charges', req, depth: 0, overrideAccess: true, page, limit, sort: '-meeting',
    where: { and: [{ participant: { in: participantIds } }, { 'participant.student': { equals: studentId } }] },
    select: { participant: true, meeting: true, status: true, amountKopecks: true, minutes: true,
      hourlyKopecks: true, createdAt: true, attendedAt: true },
  }), { label: 'Оплата занятий ученика' })
  return charges.flatMap(charge => {
    const entry = own.get(relationId(charge.participant))
    if (!entry) return []
    return [{ ...charge, streamId: entry.stream.id, streamTitle: entry.stream.title, canOpenMeeting: charge.meeting <= entry.openThrough }]
  })
}

export type StudentMeetingCharge = Awaited<ReturnType<typeof studentMeetingCharges>>[number]
