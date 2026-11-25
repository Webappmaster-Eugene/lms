import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import { isTutoringMeeting, scheduledTutoringMeeting, tutoringPrograms } from '@/lib/tutoring'
import type { User } from '@/payload-types'
import { rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { TutoringProblem } from '@/server/tutoring'
import { writeTutoringStream } from '@/server/tutoring-schedule'

export async function meetingCharges(payload: Payload, req: PayloadRequest, members: number[], meeting: number) {
  if (!members.length) return []
  return collectAllPages(({ page, limit }) => payload.find({
    collection: 'tutoring-charges', req, depth: 0, overrideAccess: false, page, limit, sort: 'id',
    where: { and: [{ participant: { in: members } }, { meeting: { equals: meeting } }] },
  }), { label: 'Оплаты учеников за встречу' })
}

type Attendance = { meeting: number; present: number[]; minutes: number; streamRevision: string }
type LockedMember = { id: number; active: boolean; current_meeting: number }

export async function finishTutoringMeeting(payload: Payload, actor: User, streamId: number, input: Attendance) {
  return writeTutoringStream(payload, actor, streamId, async (req, stream) => {
    const { meeting, minutes } = input
    if (stream.status !== 'active' || stream.awaitingFirstLecture) throw new TutoringProblem('Сначала откройте технические встречи потока')
    if (!isTutoringMeeting(meeting, stream.program)) throw new TutoringProblem('Выберите встречу из программы')
    if (stream.updatedAt !== input.streamRevision) throw new TutoringProblem('Настройки потока изменились. Обновите страницу')
    if (scheduledTutoringMeeting(stream, meeting).start.getTime() > Date.now()) throw new TutoringProblem('Встреча еще не началась')
    if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440) throw new TutoringProblem('Укажите время встречи в минутах от 1 до 1440')
    const rate = stream.hourlyKopecks
    if (!rate || !Number.isSafeInteger(rate) || rate < 0) throw new TutoringProblem('Укажите стоимость часа в настройках потока')
    const ids = [...new Set(input.present)]
    if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new TutoringProblem('Выберите присутствовавших учеников')

    const db = await txDb(req)
    const members = rowsOf<LockedMember>(await db.execute(sql`
      select id, active, current_meeting from tutoring_participants
      where stream_id = ${streamId} and id in (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
      order by id for update
    `))
    if (members.length !== ids.length || members.some(m => !m.active)) throw new TutoringProblem('Состав потока изменился. Проверьте список учеников')
    const charges = await meetingCharges(payload, req, ids, meeting)
    const byMember = new Map(charges.map(c => [c.participant, c]))
    const attendedAt = new Date().toISOString()
    const next = Math.min(meeting + 1, tutoringPrograms[stream.program].meetings)
    for (const member of members) {
      const charge = byMember.get(member.id)
      if (charge?.attendedAt) continue
      if (Math.max(stream.currentMeeting, member.current_meeting) !== meeting) {
        throw new TutoringProblem('У ученика другая текущая встреча. Проверьте его отметку')
      }
      if (charge && charge.status !== 'cancelled') {
        // Счет мог быть выставлен вручную до появления учета посещений.
        if (charge.minutes !== minutes || charge.hourlyKopecks !== rate) {
          throw new TutoringProblem('По этой встрече уже есть начисление с другими условиями. Сверьте оплату в карточке ученика')
        }
        await payload.update({ collection: 'tutoring-charges', id: charge.id, req, depth: 0,
          data: { attendedAt, updatedBy: actor.id } })
      } else {
        const data = { participant: member.id, meeting, minutes, hourlyKopecks: rate,
          amountKopecks: Math.round(minutes * rate / 60), status: 'due' as const, paidAt: null, attendedAt, updatedBy: actor.id }
        if (charge) await payload.update({ collection: 'tutoring-charges', id: charge.id, req, depth: 0, data })
        else await payload.create({ collection: 'tutoring-charges', req, depth: 0, data })
      }
      if (member.current_meeting < next) {
        await payload.update({ collection: 'tutoring-participants', id: member.id, req, depth: 0,
          data: { currentMeeting: next }, overrideAccess: false })
      }
    }
  })
}
