import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import type { User } from '@/payload-types'
import { inTransaction, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { sealGoogleValue, type exchangeGoogleCode, type tutoringGoogleConfig } from '@/server/tutoring-google'
import { TutoringProblem } from '@/server/tutoring'

export async function getTutoringCalendarSettings(payload: Payload, req: PayloadRequest, owner: number) {
  const { docs } = await payload.find({
    collection: 'tutoring-calendars', req, overrideAccess: true, depth: 0, limit: 1,
    where: { owner: { equals: owner } },
    select: { streams: true, status: true, googleEmail: true, lastSyncedAt: true, lastError: true },
  })
  return docs[0] ?? null
}

async function updateOwnCalendar<T>(payload: Payload, actor: User, change: (req: PayloadRequest) => Promise<T>) {
  return inTransaction(payload, actor, async req => {
    if (actor.isActive === false || (await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') {
      throw new TutoringProblem('Календарь доступен преподавателю')
    }
    const db = await txDb(req)
    await db.execute(sql`select pg_advisory_xact_lock(7221, ${actor.id})`)
    await db.execute(sql`select id from tutoring_calendars where owner_id = ${actor.id} for update`)
    return change(req)
  })
}

export const googleTokenPurpose = (owner: number, subject: string) => `google-refresh:${owner}:${subject}`

export async function connectTutoringCalendar(payload: Payload, actor: User, config: NonNullable<ReturnType<typeof tutoringGoogleConfig>>, google: Awaited<ReturnType<typeof exchangeGoogleCode>>) {
  return updateOwnCalendar(payload, actor, async req => {
    const { docs: [current] } = await payload.find({
      collection: 'tutoring-calendars', req, overrideAccess: true, depth: 0, limit: 1,
      where: { owner: { equals: actor.id } }, select: { status: true, googleSubject: true },
    })
    const sameAccount = current?.googleSubject === google.subject
    if (current && current.status !== 'disconnected' && !sameAccount) return false
    const data = {
      googleSubject: google.subject, googleEmail: google.email,
      encryptedRefreshToken: sealGoogleValue(config.key, googleTokenPurpose(actor.id, google.subject), google.refreshToken),
      status: 'connected' as const, nextSyncAt: new Date().toISOString(), lastError: null, failures: 0, scheduleDigest: null,
      ...(!sameAccount ? { calendarId: null, streams: [], lastSyncedAt: null } : {}),
    }
    if (current) await payload.update({ collection: 'tutoring-calendars', id: current.id, req, overrideAccess: true, depth: 0, data })
    else await payload.create({ collection: 'tutoring-calendars', req, overrideAccess: true, depth: 0, data: { ...data, owner: actor.id } })
    return true
  })
}

export async function disconnectTutoringCalendar(payload: Payload, actor: User) {
  await updateOwnCalendar(payload, actor, async req => {
    const current = await getTutoringCalendarSettings(payload, req, actor.id)
    if (!current || current.status === 'disconnected') return
    await payload.update({ collection: 'tutoring-calendars', id: current.id, req, overrideAccess: true, depth: 0, data: {
      status: 'disconnected', encryptedRefreshToken: null, nextSyncAt: null, lastError: null, failures: 0,
    } })
  })
}

export async function setTutoringStreamCalendar(payload: Payload, actor: User, streamId: number, enabled: boolean) {
  await updateOwnCalendar(payload, actor, async req => {
    const current = await getTutoringCalendarSettings(payload, req, actor.id)
    if (!current || current.status === 'disconnected') throw new TutoringProblem('Подключите Google Calendar в админке')
    const stream = await payload.findByID({ collection: 'tutoring-streams', id: streamId, req, depth: 0, overrideAccess: false, disableErrors: true, select: { status: true } })
    if (!stream || (enabled && stream.status === 'archived')) throw new TutoringProblem('Этот поток недоступен для синхронизации')
    const previous = current.streams ?? []
    if (previous.some(row => row.streamId === streamId) === enabled) return
    const streams = enabled ? [...previous, { streamId }] : previous.filter(row => row.streamId !== streamId)
    await payload.update({ collection: 'tutoring-calendars', id: current.id, req, overrideAccess: true, depth: 0, data: {
      streams,
      ...(current.status === 'connected' ? { nextSyncAt: new Date().toISOString() } : {}),
    } })
  })
}
