import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { isTutoringMeeting, scheduledTutoringMeeting } from '@/lib/tutoring'
import type { User } from '@/payload-types'
import { inTransaction, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { TutoringProblem } from '@/server/tutoring'

export async function moveTutoringMeeting(payload: Payload, actor: User, streamId: number, meeting: number, input: {
  expectedStart: string
  newStart: string | null
}) {
  return inTransaction(payload, actor, async req => {
    if ((await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') {
      throw new TutoringProblem('Перенести встречу может только преподаватель')
    }

    const db = await txDb(req)
    await db.execute(sql`select id from tutoring_streams where id = ${streamId} for update`)
    const stream = await payload.findByID({ collection: 'tutoring-streams', id: streamId, req, depth: 0, overrideAccess: false, disableErrors: true })
    if (!stream || stream.status === 'archived' || !isTutoringMeeting(meeting, stream.program)) {
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
