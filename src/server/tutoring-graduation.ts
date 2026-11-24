import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { isTutoringMeeting } from '@/lib/tutoring'
import type { User } from '@/payload-types'
import { inTransaction, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { TutoringProblem } from '@/server/tutoring'
import { tutoringOpenThrough } from '@/server/tutoring-access'

type Change = { kind: 'graduate' | 'revoke' } | { kind: 'update'; active: boolean; currentMeeting: number }

export async function changeTutoringEnrollment(
  payload: Payload, actor: User, streamId: number, participantId: number, revision: string, change: Change,
) {
  return inTransaction(payload, actor, async req => {
    if (actor.isActive === false || (await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') {
      throw new TutoringProblem('Доступ к материалам меняет наставник')
    }
    const tx = await txDb(req)
    // Фиксируем границу, действовавшую в момент выпуска, даже при одновременной смене встречи потока.
    await tx.execute(sql`select id from tutoring_streams where id = ${streamId} for share`)
    await tx.execute(sql`select id from tutoring_participants where stream_id = ${streamId} and id = ${participantId} for update`)
    const member = await payload.findByID({ collection: 'tutoring-participants', id: participantId, depth: 1, req, disableErrors: true })
    const stream = member?.stream
    if (!member || !stream || typeof stream === 'number' || stream.id !== streamId) throw new TutoringProblem('Ученик не найден в потоке')
    if (member.updatedAt !== revision) throw new TutoringProblem('Доступ уже изменился. Обновите страницу')
    if (change.kind === 'update') {
      if (member.graduatedThrough != null) throw new TutoringProblem('Обучение уже завершено')
      if (stream.awaitingFirstLecture && change.currentMeeting !== 1) throw new TutoringProblem('Сначала откройте первую лекцию потоку')
      if (!isTutoringMeeting(change.currentMeeting, stream.program)) throw new TutoringProblem('Выберите встречу ученика')
      return payload.update({ collection: 'tutoring-participants', id: member.id, req, overrideAccess: false,
        data: { currentMeeting: change.currentMeeting, active: change.active } })
    }
    if (change.kind === 'graduate' && (!member.active || stream.status !== 'active')) {
      throw new TutoringProblem('Завершить обучение можно у участника открытого потока')
    }
    if (change.kind === 'revoke' && member.graduatedThrough == null) throw new TutoringProblem('Доступ выпускника уже закрыт')
    return payload.update({ collection: 'tutoring-participants', id: member.id, req, overrideAccess: true,
      data: { active: false, graduatedThrough: change.kind === 'graduate' ? tutoringOpenThrough(stream, member) : null } })
  })
}
