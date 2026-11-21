import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { relationId } from '@/lib/content-management/pages'
import { collectAllPages } from '@/lib/paginate'
import { isTutoringMeeting, type TutoringProgram, type TutoringStatus } from '@/lib/tutoring'
import type { TutoringParticipant, TutoringReview, User } from '@/payload-types'
import { inTransaction, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { tutoringOpenThrough } from '@/server/tutoring-access'

export class TutoringProblem extends Error {}

export async function tutoringMeetings(payload: Payload, req: PayloadRequest, program: TutoringProgram) {
  return collectAllPages(({ page, limit }) => payload.find({
    collection: 'tutoring-meetings', req, overrideAccess: true, depth: 0, page, limit, sort: 'number',
    where: { program: { equals: program } }, select: { number: true, title: true, filename: true },
  }), { label: 'Программа репетиторства' })
}

export async function tutoringMeeting(payload: Payload, req: PayloadRequest, program: TutoringProgram, number: number, mentor: boolean) {
  const { docs } = await payload.find({
    collection: 'tutoring-meetings', req, overrideAccess: true, depth: 0, limit: 1,
    where: { and: [{ program: { equals: program } }, { number: { equals: number } }] },
    select: { title: true, number: true, homework: true, filename: true, ...(mentor ? { instructorNotes: true as const } : {}) },
  })
  return docs[0] ?? null
}

export async function tutoringReviews(payload: Payload, req: PayloadRequest, participants: number[]) {
  if (!participants.length) return []
  return collectAllPages(({ page, limit }) => payload.find({
    collection: 'tutoring-reviews', req, overrideAccess: true, depth: 0, page, limit, sort: 'meeting',
    where: { participant: { in: participants } },
  }), { label: 'Журнал репетиторства' })
}

export async function tutoringParticipants(payload: Payload, req: PayloadRequest, streamId: number) {
  return collectAllPages(({ page, limit }) => payload.find({
    collection: 'tutoring-participants', req, overrideAccess: true, depth: 1, page, limit, sort: 'createdAt',
    where: { stream: { equals: streamId } },
    populate: { users: { email: true, firstName: true, lastName: true } },
  }), { label: 'Ученики в потоке репетиторства' })
}

type ReviewAction =
  | { kind: 'submit'; actor: User; url: string }
  | { kind: 'grade'; actor: User; status: TutoringStatus; feedback: string; expectedUpdatedAt: string }

export async function writeTutoringReview(payload: Payload, streamId: number, memberId: number, meeting: number, action: ReviewAction) {
  return inTransaction(payload, action.actor, async (req) => {
    if (action.kind === 'grade' && (await getAuthoritativeLearningPolicy(payload, action.actor.id, req)).role !== 'admin') {
      throw new TutoringProblem('Оценку сохраняет наставник')
    }
    const tx = await txDb(req)
    await tx.execute(sql`select id from tutoring_participants where id = ${memberId} for update`)
    const member = await payload.findByID({ collection: 'tutoring-participants', id: memberId, depth: 1, req, overrideAccess: true })
    const stream = member.stream
    if (!stream || typeof stream === 'number' || stream.id !== streamId || !isTutoringMeeting(meeting, stream.program)) {
      throw new TutoringProblem('Участник или встреча не найдены')
    }
    if (action.kind === 'submit' && (relationId(member.student) !== action.actor.id ||
      !member.active || stream.status !== 'active' || meeting > tutoringOpenThrough(stream, member))) {
      throw new TutoringProblem('Задание пока недоступно')
    }
    const material = await tutoringMeeting(payload, req, stream.program, meeting, false)
    if (!material) throw new TutoringProblem('Задание для этой встречи ещё не загружено')
    const { docs: [existing] } = await payload.find({
      collection: 'tutoring-reviews', req, overrideAccess: true, depth: 0, limit: 1,
      where: { and: [{ participant: { equals: memberId } }, { meeting: { equals: meeting } }] },
    })
    if (action.kind === 'submit' && (existing?.status === 'accepted' || existing?.status === 'submitted')) {
      throw new TutoringProblem(existing.status === 'accepted' ? 'Эта работа уже принята' : 'Работа уже на проверке')
    }
    if (action.kind === 'grade' && (existing?.updatedAt ?? '') !== action.expectedUpdatedAt) {
      throw new TutoringProblem('Работа уже изменилась. Проверьте новую версию перед сохранением')
    }
    const data = action.kind === 'submit'
      ? { status: 'submitted' as const, submissionUrl: action.url }
      : { status: action.status, feedback: action.feedback }
    return existing
      ? payload.update({ collection: 'tutoring-reviews', id: existing.id, req, data, overrideAccess: true })
      : payload.create({ collection: 'tutoring-reviews', req, data: { participant: memberId, meeting, ...data }, overrideAccess: true })
  })
}

export function tutoringStudentName(member: TutoringParticipant) {
  const student = member.student
  return typeof student === 'number' ? `Ученик №${student}`
    : [student.firstName, student.lastName].filter(Boolean).join(' ') || student.email
}

export function tutoringReviewMap(reviews: TutoringReview[]) {
  return new Map(reviews.map(review => [review.meeting, review]))
}
