import 'server-only'

import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { isTutoringMeeting, scheduledTutoringMeeting } from '@/lib/tutoring'
import { planTutoringScheduleChange, tutoringScheduleSlots, type TutoringScheduleChange, type TutoringScheduleSlot } from '@/lib/tutoring-schedule'
import type { TutoringStream, User } from '@/payload-types'
import { inTransaction, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { TutoringProblem } from '@/server/tutoring'

async function writeSchedule<T>(payload: Payload, actor: User, streamId: number, write: (req: PayloadRequest, stream: TutoringStream) => Promise<T>) {
  return inTransaction(payload, actor, async req => {
    if (actor.isActive === false || (await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') {
      throw new TutoringProblem('Расписание может изменить только преподаватель')
    }

    const db = await txDb(req)
    await db.execute(sql`select id from tutoring_streams where id = ${streamId} for update`)
    const stream = await payload.findByID({ collection: 'tutoring-streams', id: streamId, req, depth: 0, overrideAccess: false, disableErrors: true })
    if (!stream || stream.status === 'archived') throw new TutoringProblem('Этот поток недоступен для изменения расписания')
    return write(req, stream)
  })
}

export async function moveTutoringMeeting(payload: Payload, actor: User, streamId: number, meeting: number, input: {
  expectedStart: string
  newStart: string | null
}) {
  return writeSchedule(payload, actor, streamId, async (req, stream) => {
    if (!isTutoringMeeting(meeting, stream.program)) {
      throw new TutoringProblem('Встреча для переноса не найдена')
    }

    const { original, start } = scheduledTutoringMeeting(stream, meeting)
    if (start.toISOString() !== input.expectedStart) {
      throw new TutoringProblem('Время встречи уже изменилось. Проверьте расписание и повторите перенос')
    }
    const newTime = input.newStart === null ? original.getTime() : Date.parse(input.newStart)
    const now = Date.now()
    if (start.getTime() <= now || !Number.isFinite(newTime) || newTime <= now) {
      throw new TutoringProblem('Выберите будущее время для предстоящей встречи')
    }

    const overrides = stream.scheduleOverrides ?? []
    const remaining = overrides.filter(row => row.meeting !== meeting)
    if (newTime !== original.getTime()) remaining.push({ meeting, startsAt: new Date(newTime).toISOString() })
    return payload.update({ collection: 'tutoring-streams', id: streamId, req, depth: 0, overrideAccess: true,
      data: { scheduleOverrides: remaining },
    })
  })
}

export function tutoringScheduleRevision(slots: TutoringScheduleSlot[]) {
  return createHash('sha256').update(JSON.stringify(slots)).digest('hex')
}

export async function changeTutoringSchedule(payload: Payload, actor: User, streamId: number, expectedRevision: string, input: TutoringScheduleChange) {
  return writeSchedule(payload, actor, streamId, async (req, stream) => {
    const slots = tutoringScheduleSlots(stream)
    if (tutoringScheduleRevision(slots) !== expectedRevision) {
      throw new TutoringProblem('Расписание уже изменилось. Проверьте новые даты перед сохранением')
    }
    const plan = planTutoringScheduleChange(slots, input, Date.now())
    if ('error' in plan) throw new TutoringProblem(plan.error)
    if (!plan.changed) return stream

    const updated = new Map(plan.rows.map(row => [row.meeting, row]))
    const scheduleDates = [
      ...(stream.scheduleDates ?? []).filter(row => !updated.has(row.meeting)),
      ...plan.rows.map(({ meeting, scheduledAt }) => ({ meeting, startsAt: scheduledAt })),
    ]
    const scheduleOverrides = (stream.scheduleOverrides ?? []).filter(row => {
      const replacement = updated.get(row.meeting)
      return !replacement || replacement.startsAt !== replacement.scheduledAt
    })
    return payload.update({ collection: 'tutoring-streams', id: streamId, req, depth: 0, overrideAccess: true,
      data: { scheduleDates, scheduleOverrides },
    })
  })
}
