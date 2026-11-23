import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { isTutoringMeeting, scheduledTutoringMeeting } from '@/lib/tutoring'
import type { User } from '@/payload-types'
import { inTransaction, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { TutoringProblem } from '@/server/tutoring'

export async function tutoringCharge(payload: Payload, req: PayloadRequest, participant: number, meeting: number) {
  const { docs } = await payload.find({
    collection: 'tutoring-charges', req, limit: 1, depth: 0, overrideAccess: true,
    where: { and: [{ participant: { equals: participant } }, { meeting: { equals: meeting } }] },
  })
  return docs[0] ?? null
}

export function parseTutoringRate(raw: string): number | null {
  if (!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(raw)) return null
  const [rubles, kopecks = ''] = raw.split(/[.,]/)
  const rate = Number(rubles) * 100 + Number(kopecks.padEnd(2, '0'))
  return rate > 0 && rate <= 100_000_000 ? rate : null
}

export async function saveTutoringCharge(payload: Payload, actor: User, streamId: number, participant: number, meeting: number, input: {
  minutes: string; rate: string; action: string; revision: string
}) {
  return inTransaction(payload, actor, async req => {
    if ((await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') {
      throw new TutoringProblem('Оплату отмечает наставник')
    }
    const db = await txDb(req)
    await db.execute(sql`select id from tutoring_participants where id = ${participant} for update`)
    const member = await payload.findByID({ collection: 'tutoring-participants', id: participant, req, depth: 1, overrideAccess: true, disableErrors: true })
    const stream = member?.stream
    if (!stream || typeof stream === 'number' || stream.id !== streamId || !isTutoringMeeting(meeting, stream.program)) {
      throw new TutoringProblem('Ученик или встреча не найдены')
    }
    const current = await tutoringCharge(payload, req, participant, meeting)
    if ((current?.updatedAt ?? '') !== input.revision) throw new TutoringProblem('Запись оплаты уже изменена. Обновите страницу')
    if (input.action === 'paid' || input.action === 'reopen') {
      const expected = input.action === 'paid' ? 'due' : 'paid'
      if (!current || current.status !== expected) throw new TutoringProblem('Статус оплаты уже изменился')
      return payload.update({
        collection: 'tutoring-charges', id: current.id, req, overrideAccess: true,
        data: { status: input.action === 'paid' ? 'paid' : 'due', paidAt: input.action === 'paid' ? new Date().toISOString() : null, updatedBy: actor.id },
      })
    }
    if (current?.status === 'paid') throw new TutoringProblem('Сначала снимите отметку об оплате')
    if (input.action !== 'charge' && input.action !== 'cancel') throw new TutoringProblem('Выберите действие')
    const cancel = input.action === 'cancel'
    if (!cancel && scheduledTutoringMeeting(stream, meeting).start.getTime() > Date.now()) {
      throw new TutoringProblem('Оплата рассчитывается после занятия')
    }
    const minutes = /^\d+$/.test(input.minutes) ? Number(input.minutes) : NaN
    const rate = parseTutoringRate(input.rate)
    if (!cancel && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440 || rate === null)) {
      throw new TutoringProblem('Укажите фактические минуты и ставку в рублях за час')
    }
    const data = {
      participant, meeting, minutes: cancel ? 0 : minutes, hourlyKopecks: cancel ? 0 : rate ?? 0,
      amountKopecks: cancel ? 0 : Math.round(minutes * (rate ?? 0) / 60),
      status: cancel ? 'cancelled' as const : 'due' as const, paidAt: null, updatedBy: actor.id,
    }
    return current
      ? payload.update({ collection: 'tutoring-charges', id: current.id, req, overrideAccess: true, data })
      : payload.create({ collection: 'tutoring-charges', req, overrideAccess: true, data })
  })
}
