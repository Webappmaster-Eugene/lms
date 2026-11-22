import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

import { relationId } from '@/lib/content-management/pages'
import { collectAllPages } from '@/lib/paginate'
import { logger } from '@/lib/telemetry'
import { scheduledTutoringMeeting, tutoringPrograms } from '@/lib/tutoring'
import type { TutoringCalendar, TutoringStream } from '@/payload-types'
import { inTransaction, rowsOf, txDb } from '@/server/bootcamp-lead-events'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { googleTokenPurpose } from '@/server/tutoring-calendar-account'
import { GoogleCalendarError, openGoogleValue, refreshGoogleAccess, sha256, tutoringGoogleClient, tutoringGoogleConfig, type GoogleEvent } from '@/server/tutoring-google'

const minute = 60_000
const reconcileInterval = 30 * minute
const workBudget = 12_000
const maxChanges = 24
type Config = NonNullable<ReturnType<typeof tutoringGoogleConfig>>
type Google = ReturnType<typeof tutoringGoogleClient>
type EventWrite = Parameters<Google['createEvent']>[2]
type ConnectionUpdate = Partial<TutoringCalendar>

const hasStatus = (error: unknown, ...statuses: number[]) => error instanceof GoogleCalendarError && statuses.includes(error.status)
const inFuture = (event: GoogleEvent, now: number) => Date.parse(event.start?.dateTime ?? '') > now

function streamEvents(stream: TutoringStream, origin: string, marker: string) {
  return Array.from({ length: tutoringPrograms[stream.program].meetings }, (_, index) => {
    const number = index + 1
    const { start, end } = scheduledTutoringMeeting(stream, number)
    const key = `${stream.id}.${number}`
    return {
      key, startsAt: start.getTime(), event: {
        summary: `${stream.title} · Встреча ${number}`,
        description: `${origin}/tutoring/${stream.id}?preview=${number}#material`,
        visibility: 'private',
        start: { dateTime: start.toISOString(), timeZone: 'Europe/Moscow' },
        end: { dateTime: end.toISOString(), timeZone: 'Europe/Moscow' },
        extendedProperties: { private: { mentorcareer: marker, meeting: key } },
      },
    }
  })
}

function sameEvent(current: GoogleEvent, target: EventWrite) {
  return current.summary === target.summary && current.description === target.description && current.visibility === target.visibility &&
    Date.parse(current.start?.dateTime ?? '') === Date.parse(target.start?.dateTime ?? '') &&
    Date.parse(current.end?.dateTime ?? '') === Date.parse(target.end?.dateTime ?? '')
}

function eventKey(event: GoogleEvent, marker: string) {
  const props = event.extendedProperties?.private
  return event.status !== 'cancelled' && props?.mentorcareer === marker ? props.meeting : undefined
}

async function calendarFor(google: Google, calendarId: string | null | undefined, marker: string) {
  if (calendarId) {
    try {
      return await google.getCalendar(calendarId)
    } catch (error) {
      if (!hasStatus(error, 404, 410)) throw error
    }
  }
  const description = `MentorCareer LMS (${marker})`
  return (await google.findCalendar(description)) ?? google.createCalendar(description)
}

async function insertMeeting(google: Google, calendarId: string, marker: string, key: string, event: EventWrite) {
  // Google may reserve an ID after deletion. The next ID is used only for a confirmed tombstone.
  for (let generation = 0; generation < 32; generation += 1) {
    const id = sha256(`${marker}:${key}:${generation}`)
    try {
      await google.createEvent(calendarId, id, event)
      return
    } catch (error) {
      if (!hasStatus(error, 409)) throw error
    }
    let existing: GoogleEvent
    try {
      existing = await google.getEvent(calendarId, id)
    } catch (error) {
      if (hasStatus(error, 410)) continue
      throw error
    }
    if (existing.status === 'cancelled') continue
    if (eventKey(existing, marker) !== key) throw new GoogleCalendarError(409, 'eventIdentityConflict')
    if (!sameEvent(existing, event)) await google.updateEvent(calendarId, id, event)
    return
  }
  throw new GoogleCalendarError(409, 'eventIdentityExhausted')
}

async function updateGoogleEvents(google: Google, calendarId: string, marker: string, schedule: ReturnType<typeof streamEvents>, now: number) {
  const future = new Map(schedule.filter(slot => slot.startsAt > now).map(slot => [slot.key, slot.event]))
  const current = await google.listEvents(calendarId, marker)
  let changes = 0

  for (const event of current) {
    const key = eventKey(event, marker)
    if (!key) continue
    const desired = future.get(key)
    if (desired) {
      future.delete(key)
      if (sameEvent(event, desired)) continue
      if (changes >= maxChanges) return false
      await google.updateEvent(calendarId, event.id, desired)
      changes += 1
    } else if (inFuture(event, now)) {
      if (changes >= maxChanges) return false
      try {
        await google.deleteEvent(calendarId, event.id)
      } catch (error) {
        if (!hasStatus(error, 404, 410)) throw error
      }
      changes += 1
    }
  }
  for (const [key, event] of future) {
    if (changes >= maxChanges) return false
    await insertMeeting(google, calendarId, marker, key, event)
    changes += 1
  }
  return true
}

async function loadSchedule(req: PayloadRequest, connection: TutoringCalendar, origin: string, marker: string) {
  const ids = connection.streams?.map(row => row.streamId) ?? []
  if (!ids.length) return []
  const streams = await collectAllPages(({ page, limit }) => req.payload.find({
    collection: 'tutoring-streams', req, depth: 0, overrideAccess: true, page, limit, sort: 'id',
    where: { id: { in: ids }, status: { equals: 'active' } },
  }), { label: 'Расписание для Google Calendar' })
  return streams.flatMap(stream => streamEvents(stream, origin, marker))
}

function retryCalendar(connection: TutoringCalendar, error: unknown): ConnectionUpdate {
  const failures = connection.failures + 1
  const providerStatus = error instanceof GoogleCalendarError ? error.status : 0
  logger.warn('Tutoring calendar sync will retry', { 'calendar.connection_id': connection.id, 'google.status': providerStatus })
  return {
    nextSyncAt: new Date(Date.now() + minute * Math.min(30, 2 ** Math.min(5, failures - 1))).toISOString(),
    lastError: hasStatus(error, 403, 404, 410) ? 'calendar' : 'temporary', failures, scheduleDigest: null,
  }
}

const reconnect: ConnectionUpdate = { status: 'reconnect', encryptedRefreshToken: null, nextSyncAt: null, lastError: 'authorization' }

async function syncAccount(req: PayloadRequest, connection: TutoringCalendar, config: Config, signal: AbortSignal): Promise<ConnectionUpdate> {
  const owner = relationId(connection.owner)
  if (owner === null || !connection.encryptedRefreshToken) return reconnect
  const ownerUser = await req.payload.findByID({ collection: 'users', id: owner, req, depth: 0, overrideAccess: true, disableErrors: true, select: { isActive: true } })
  if (!ownerUser || ownerUser.isActive === false || (await getAuthoritativeLearningPolicy(req.payload, owner, req)).role !== 'admin') return reconnect

  const marker = sha256(`${config.origin}:${owner}:${connection.googleSubject}`).slice(0, 32)
  const schedule = await loadSchedule(req, connection, config.origin, marker)
  const digest = sha256(JSON.stringify(schedule))
  const now = Date.now()
  const nextCheck = new Date(now + minute).toISOString()
  if (connection.calendarId && connection.scheduleDigest === digest && now - Date.parse(connection.lastSyncedAt ?? '') < reconcileInterval) {
    return { nextSyncAt: nextCheck }
  }

  let calendarId = connection.calendarId
  try {
    let refreshToken: string
    try {
      refreshToken = openGoogleValue(config.key, googleTokenPurpose(owner, connection.googleSubject), connection.encryptedRefreshToken)
    } catch {
      logger.warn('Tutoring calendar credential needs renewal', { 'calendar.connection_id': connection.id })
      return reconnect
    }
    const accessToken = await refreshGoogleAccess(config, refreshToken, signal)
    const google = tutoringGoogleClient(accessToken, signal)
    calendarId = (await calendarFor(google, calendarId, marker)).id
    const complete = await updateGoogleEvents(google, calendarId, marker, schedule, Date.now())
    return {
      calendarId, nextSyncAt: nextCheck, failures: 0, lastError: null,
      scheduleDigest: complete ? digest : null,
      ...(complete ? { lastSyncedAt: new Date().toISOString() } : {}),
    }
  } catch (error) {
    if (hasStatus(error, 401) || (error instanceof GoogleCalendarError && ['invalid_grant', 'insufficientPermissions'].includes(error.reason))) {
      return { ...reconnect, calendarId }
    }
    return { ...retryCalendar(connection, error), calendarId }
  }
}

export async function runTutoringCalendarJobs(payload: Payload) {
  const config = tutoringGoogleConfig()
  if (!config) return 0
  const signal = AbortSignal.timeout(workBudget)
  let processed = 0
  while (!signal.aborted && processed < 12) {
    const found = await inTransaction(payload, null, async req => {
      const db = await txDb(req)
      const [row] = rowsOf<{ id: number }>(await db.execute(sql`
        select id from tutoring_calendars
        where status = 'connected' and next_sync_at <= now()
        order by next_sync_at, id limit 1 for update skip locked
      `))
      if (!row) return false
      const connection = await payload.findByID({ collection: 'tutoring-calendars', id: row.id, req, depth: 0, overrideAccess: true })
      const data = await syncAccount(req, connection, config, signal)
      await payload.update({ collection: 'tutoring-calendars', id: row.id, req, overrideAccess: true, depth: 0, data })
      return true
    })
    if (!found) break
    processed += 1
  }
  return processed
}
