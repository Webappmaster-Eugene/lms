import { NextRequest } from 'next/server'
import type { Payload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq } from 'payload'

import { GET as googleCallback } from '@/app/api/manage/tutoring/google-calendar/callback/route'
import { POST as googleAccount } from '@/app/api/manage/tutoring/google-calendar/route'
import { moscowMeetingInput, scheduledTutoringMeeting } from '@/lib/tutoring'
import { tutoringScheduleSlots } from '@/lib/tutoring-schedule'
import { tutoringMemberships } from '@/server/tutoring-access'
import { saveTutoringCharge } from '@/server/tutoring-payments'
import { writeTutoringReview } from '@/server/tutoring'
import { setTutoringStreamCalendar } from '@/server/tutoring-calendar-account'
import { runTutoringCalendarJobs } from '@/server/tutoring-calendar-sync'
import { googleCalendarApiPath, googleStateCookie, type GoogleEvent } from '@/server/tutoring-google'
import { changeTutoringSchedule, moveTutoringMeeting, openFirstTutoringLecture, scheduleTutoringIntroduction, tutoringScheduleRevision } from '@/server/tutoring-schedule'
import { createAdmin, createStudent, getTestPayload, login, rest, uid, type TestUser } from '../helpers/payload'

const origin = 'http://lms.test'
const day = 86_400_000
const nextTuesday = new Date(Date.now() + day)
while (nextTuesday.getUTCDay() !== 2) nextTuesday.setUTCDate(nextTuesday.getUTCDate() + 1)
nextTuesday.setUTCHours(17, 0, 0, 0)
const startsAt = nextTuesday.toISOString()
const later = (offset: number) => new Date(nextTuesday.getTime() + offset * day).toISOString()
const local = (offset: number) => moscowMeetingInput(new Date(later(offset)))

let payload: Payload
let teacher: TestUser
let otherTeacher: TestUser
let student: TestUser
let outsider: TestUser
let teacherSession: string
let otherSession: string
let studentSession: string

beforeAll(async () => {
  payload = await getTestPayload()
  ;[teacher, otherTeacher, student, outsider] = await Promise.all([
    createAdmin(payload), createAdmin(payload), createStudent(payload), createStudent(payload),
  ])
  ;[teacherSession, otherSession, studentSession] = await Promise.all([
    login(payload, teacher), login(payload, otherTeacher), login(payload, student),
  ])
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const createStream = (status: 'draft' | 'active' = 'active') => payload.create({
  collection: 'tutoring-streams', data: { title: uid('schedule'), startsAt, status, program: 'react-next', currentMeeting: 1 },
})

function googleFixture() {
  vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'client-test')
  vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'test-only')
  vi.stubEnv('GOOGLE_CALENDAR_ENCRYPTION_KEY', Buffer.alloc(32, 37).toString('base64'))

  const scopes = ['calendar.app.created', 'calendar.calendarlist.readonly'].map(scope => `https://www.googleapis.com/auth/${scope}`)
  const calendars: { id: string; description: string }[] = []
  const events = new Map<string, GoogleEvent>()
  const changes = { calendar: 0, insert: 0, patch: 0 }
  const simulate = { lostCalendarResponse: true, lostEventResponse: true, revoked: false, subject: 'teacher-google' }

  const fetchGoogle = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input)
    const method = init?.method ?? 'GET'
    if (url.hostname === 'oauth2.googleapis.com') {
      const form = new URLSearchParams(String(init?.body))
      if (form.get('grant_type') === 'authorization_code') {
        expect(form.get('code_verifier')).toMatch(/^[\w-]{64}$/)
        return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', scope: scopes.join(' ') })
      }
      expect(form.get('refresh_token')).toBe('test-refresh')
      return simulate.revoked ? Response.json({ error: 'invalid_grant' }, { status: 400 }) : Response.json({ access_token: 'test-access' })
    }
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-access')
    if (url.hostname === 'openidconnect.googleapis.com') return Response.json({ sub: simulate.subject, email: 'teacher@example.test', email_verified: true })
    expect(url.hostname).toBe('www.googleapis.com')
    const path = url.pathname.split('/').slice(3)
    const [, calendarId, collection, eventId] = path
    const body = () => JSON.parse(String(init?.body))
    if (path[0] === 'users') return Response.json({ items: calendars })
    if (path.length === 1 && method === 'POST') {
      const calendar = { id: `calendar-${++changes.calendar}`, description: body().description }
      calendars.push(calendar)
      if (simulate.lostCalendarResponse) {
        simulate.lostCalendarResponse = false
        return Response.json({}, { status: 500 })
      }
      return Response.json(calendar)
    }
    if (!collection) return Response.json(calendars.find(row => row.id === calendarId) ?? {}, { status: calendars.some(row => row.id === calendarId) ? 200 : 404 })
    expect(collection).toBe('events')
    if (method === 'POST') {
      const event = body()
      if (events.has(event.id)) return Response.json({}, { status: 409 })
      expect(event).not.toHaveProperty('attendees')
      events.set(event.id, event)
      changes.insert += 1
      if (simulate.lostEventResponse) {
        simulate.lostEventResponse = false
        return Response.json({}, { status: 500 })
      }
      return Response.json(event)
    }
    if (eventId && method === 'PATCH') {
      const event = { ...events.get(eventId), ...body(), id: eventId }
      events.set(eventId, event)
      changes.patch += 1
      return Response.json(event)
    }
    if (eventId && method === 'DELETE') {
      events.set(eventId, { id: eventId, status: 'cancelled' })
      return new Response(null, { status: 204 })
    }
    if (eventId) return Response.json(events.get(eventId) ?? {}, { status: events.has(eventId) ? 200 : 404 })
    const marker = url.searchParams.get('privateExtendedProperty')?.split('=')[1]
    return Response.json({ items: [...events.values()].filter(event => event.extendedProperties?.private?.mentorcareer === marker) })
  })
  vi.stubGlobal('fetch', fetchGoogle)
  return { calendars, events, changes, simulate, fetchGoogle }
}

function accountRequest(token: string, refererOrigin = origin, operation = '') {
  return new NextRequest(`${origin}${googleCalendarApiPath}${operation}`, {
    method: 'POST', headers: { origin: refererOrigin, cookie: `payload-token=${token}` },
  })
}

async function beginAuthorization() {
  const response = await googleAccount(accountRequest(teacherSession))
  expect(response.status).toBe(303)
  const url = new URL(response.headers.get('location') ?? '')
  expect(url.hostname).toBe('accounts.google.com')
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  expect(url.searchParams.get('access_type')).toBe('offline')
  const state = url.searchParams.get('state') ?? ''
  const sealed = response.headers.get('set-cookie')?.split(';')[0]?.split('=')[1] ?? ''
  expect(sealed).toBeTruthy()
  return (token: string, code = 'test-code') => new NextRequest(`${origin}${googleCalendarApiPath}/callback?state=${state}&code=${code}`, {
    headers: { cookie: `payload-token=${token}; ${googleStateCookie}=${sealed}` },
  })
}

async function loadConnection() {
  const { docs: [connection] } = await payload.find({ collection: 'tutoring-calendars', where: { owner: { equals: teacher.id } }, limit: 1, depth: 0 })
  if (!connection) throw new Error('Calendar connection was not stored')
  return connection
}

async function syncNow() {
  await payload.update({ collection: 'tutoring-calendars', id: (await loadConnection()).id, data: { nextSyncAt: '2000-01-01T00:00:00.000Z' } })
  await runTutoringCalendarJobs(payload)
}

describe('расписание и Google Calendar репетиторства', () => {
  it('переносит только выбранную встречу, сохраняет результат при конкуренции и защищает чужое расписание', async () => {
    const stream = await createStream()
    await payload.create({ collection: 'tutoring-participants', data: { stream: stream.id, student: student.id, paidAt: startsAt, active: true, currentMeeting: 1 } })
    await expect(moveTutoringMeeting(payload, student, stream.id, 1, { expectedStart: startsAt, newStart: later(1) })).rejects.toThrow('преподаватель')
    await expect(moveTutoringMeeting(payload, teacher, stream.id, 1, { expectedStart: startsAt, newStart: '2000-01-01T00:00:00.000Z' })).rejects.toThrow('будущее время')
    const results = await Promise.allSettled([later(1), later(3)].map(newStart => moveTutoringMeeting(payload, teacher, stream.id, 1, { expectedStart: startsAt, newStart })))
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(row => row.status === 'rejected')).toMatchObject({ reason: { message: expect.stringContaining('уже изменилось') } })

    const req = await createLocalReq({ user: student }, payload)
    const [memberStream] = await tutoringMemberships(payload, req, student.id)
    expect(await tutoringMemberships(payload, req, outsider.id)).toEqual([])
    expect(memberStream?.stream.id).toBe(stream.id)
    if (!memberStream) throw new Error('Student cannot see enrolled stream')
    const effective = scheduledTutoringMeeting(memberStream.stream, 1).start.toISOString()
    expect([later(1), later(3)]).toContain(effective)
    expect(scheduledTutoringMeeting(memberStream.stream, 2).start.toISOString()).toBe(later(2))

    await rest('PATCH', `/tutoring-streams/${stream.id}`, { token: teacherSession, body: { currentMeeting: 2, scheduleOverrides: [] } })
    const current = await payload.findByID({ collection: 'tutoring-streams', id: stream.id })
    expect(current.currentMeeting).toBe(2)
    expect(scheduledTutoringMeeting(current, 1).start.toISOString()).toBe(effective)
    const reset = await moveTutoringMeeting(payload, teacher, stream.id, 1, { expectedStart: effective, newStart: null })
    expect(scheduledTutoringMeeting(reset, 1)).toMatchObject({ start: new Date(startsAt), moved: false })
    expect(reset.currentMeeting).toBe(2)
    const ordinary = await moveTutoringMeeting(payload, teacher, stream.id, 2, { expectedStart: later(2), newStart: later(5) })
    expect(scheduledTutoringMeeting(ordinary, 2)).toMatchObject({ start: new Date(later(5)), moved: true })
    expect(scheduledTutoringMeeting(ordinary, 3).start.toISOString()).toBe(later(7))
  })

  it('массово меняет только будущие даты, учитывает отдельные переносы и отвергает устаревшее расписание', async () => {
    const initial = await createStream()
    const historical = '2000-01-01T17:00:00.000Z'
    const base = await payload.update({ collection: 'tutoring-streams', id: initial.id, data: {
      currentMeeting: 3, scheduleOverrides: [{ meeting: 3, startsAt: historical }],
    } })
    const revision = tutoringScheduleRevision(tutoringScheduleSlots(base))
    const input = { fromMeeting: 2, firstStart: local(6), secondStart: local(9).replace('20:00', '21:30'), keepOverrides: true }
    await expect(changeTutoringSchedule(payload, student, base.id, revision, input)).rejects.toThrow('преподаватель')
    const overlap = { ...input, secondStart: local(6).replace('20:00', '20:30') }
    await expect(changeTutoringSchedule(payload, teacher, base.id, revision, overlap)).rejects.toThrow('два часа')

    const moved = await moveTutoringMeeting(payload, teacher, base.id, 4, { expectedStart: later(9), newStart: later(12) })
    await expect(changeTutoringSchedule(payload, teacher, base.id, revision, input)).rejects.toThrow('уже изменилось')
    const updated = await changeTutoringSchedule(payload, teacher, base.id, tutoringScheduleRevision(tutoringScheduleSlots(moved)), input)
    expect(updated.currentMeeting).toBe(3)
    expect(updated.startsAt).toBe(startsAt)
    expect(scheduledTutoringMeeting(updated, 1).start.toISOString()).toBe(startsAt)
    expect(scheduledTutoringMeeting(updated, 2).start.toISOString()).toBe(later(6))
    expect(scheduledTutoringMeeting(updated, 3).start.toISOString()).toBe(historical)
    expect(scheduledTutoringMeeting(updated, 4)).toMatchObject({ start: new Date(later(12)), original: new Date(later(13)), moved: true })
    expect(scheduledTutoringMeeting(updated, 5).start.toISOString()).toBe(new Date(Date.parse(later(16)) + 90 * 60_000).toISOString())

    const reset = await moveTutoringMeeting(payload, teacher, base.id, 4, { expectedStart: later(12), newStart: null })
    expect(scheduledTutoringMeeting(reset, 4)).toMatchObject({ start: new Date(later(13)), moved: false })
    await rest('PATCH', `/tutoring-streams/${base.id}`, { token: teacherSession, body: { scheduleDates: [] } })
    const reread = await payload.findByID({ collection: 'tutoring-streams', id: base.id })
    expect(scheduledTutoringMeeting(reread, 4).start.toISOString()).toBe(later(13))
  })

  it('первый урок открывает наставник, повтор открытия сохраняет более позднюю встречу', async () => {
    const stream = await payload.create({ collection: 'tutoring-streams',
      data: { title: uid('first-lecture'), program: 'react-next', startsAt, status: 'draft', awaitingFirstLecture: true, currentMeeting: 1 } })
    await expect(openFirstTutoringLecture(payload, teacher, stream.id, stream.updatedAt)).rejects.toThrow('Сначала откройте поток')
    const opened = await payload.update({ collection: 'tutoring-streams', id: stream.id, data: { status: 'active' } })
    await expect(openFirstTutoringLecture(payload, teacher, stream.id, 'старая версия')).rejects.toThrow('Настройки уже изменились')
    const member = await payload.create({ collection: 'tutoring-participants', data: { stream: stream.id, student: student.id, currentMeeting: 1, active: true } })
    await expect(saveTutoringCharge(payload, teacher, stream.id, member.id, 1, {
      minutes: '60', rate: '1000', action: 'cancel', revision: '',
    })).rejects.toThrow('Вводная встреча бесплатна')
    await expect(openFirstTutoringLecture(payload, student, stream.id, opened.updatedAt)).rejects.toThrow('преподаватель')
    await expect(payload.update({ collection: 'tutoring-streams', id: stream.id, data: { currentMeeting: 2 } }))
      .rejects.toThrow('currentMeeting')
    const results = await Promise.all([openFirstTutoringLecture(payload, teacher, stream.id, opened.updatedAt), openFirstTutoringLecture(payload, teacher, stream.id, opened.updatedAt)])
    for (const result of results) expect(result).toMatchObject({ awaitingFirstLecture: false, currentMeeting: 1 })
    await payload.update({ collection: 'tutoring-streams', id: stream.id, data: { currentMeeting: 3 } })
    expect(await openFirstTutoringLecture(payload, teacher, stream.id, opened.updatedAt)).toMatchObject({ awaitingFirstLecture: false, currentMeeting: 3 })
    await expect(payload.update({ collection: 'tutoring-streams', id: stream.id, data: { awaitingFirstLecture: true, currentMeeting: 1 } }))
      .rejects.toThrow('awaitingFirstLecture')
  })

  it('позволяет назначить вводную старому потоку между занятиями, сохраняя выданный доступ', async () => {
    const historicalStart = later(-14)
    const stream = await payload.create({ collection: 'tutoring-streams',
      data: { title: uid('previous-course'), program: 'react-next', startsAt: historicalStart, status: 'active', currentMeeting: 3 } })
    const intro = new Date(Date.parse(startsAt) + 3_600_000).toISOString()
    await expect(scheduleTutoringIntroduction(payload, teacher, stream.id, '', intro)).rejects.toThrow('пересекается')
    const valid = later(1)
    const updated = await scheduleTutoringIntroduction(payload, teacher, stream.id, '', valid)
    expect(updated.currentMeeting).toBe(3)
    expect(updated.awaitingFirstLecture).toBeFalsy()
    expect(updated.introductionStartsAt).toBe(valid)
    expect(tutoringScheduleSlots(updated)).toEqual(tutoringScheduleSlots(stream))
  })

  it('назначает вводную отдельно и отклоняет пересечения при любом переносе', async () => {
    const stream = await createStream('draft')
    const slot = tutoringScheduleSlots(stream)[0]
    if (!slot) throw new Error('В программе должна быть первая техническая встреча')
    const hour = 3_600_000
    const first = Date.parse(slot.startsAt)
    const intro = new Date(first - hour).toISOString()
    const earlier = new Date(first - 2 * hour).toISOString()
    const overlap = new Date(first - hour / 2).toISOString()
    expect(stream.introductionStartsAt).toBeNull()
    await expect(scheduleTutoringIntroduction(payload, student, stream.id, '', intro)).rejects.toThrow('преподаватель')
    await expect(scheduleTutoringIntroduction(payload, teacher, stream.id, '', overlap)).rejects.toThrow('должна закончиться')
    const updated = await scheduleTutoringIntroduction(payload, teacher, stream.id, '', intro)
    expect(updated.introductionStartsAt).toBe(intro)
    expect(tutoringScheduleSlots(updated)).toEqual(tutoringScheduleSlots(stream))
    const member = await payload.create({ collection: 'tutoring-participants', data: { stream: stream.id, student: student.id, active: true, currentMeeting: 1 } })
    await expect(saveTutoringCharge(payload, teacher, stream.id, member.id, 0, {
      minutes: '60', rate: '1000', action: 'charge', revision: '',
    })).rejects.toThrow('встреча не найдены')
    await expect(writeTutoringReview(payload, stream.id, member.id, 0, {
      kind: 'submit', actor: student, url: 'https://git.example.test/group/student/-/merge_requests/1',
    })).rejects.toThrow('встреча не найдены')
    for (const collection of ['tutoring-charges', 'tutoring-reviews'] as const) {
      expect((await payload.count({ collection, where: { participant: { equals: member.id } } })).totalDocs).toBe(0)
    }
    await expect(scheduleTutoringIntroduction(payload, teacher, stream.id, '', earlier)).rejects.toThrow('уже изменилось')
    await expect(moveTutoringMeeting(payload, teacher, stream.id, 1, {
      expectedStart: slot.startsAt, newStart: overlap,
    })).rejects.toThrow('должна закончиться')
    await expect(changeTutoringSchedule(payload, teacher, stream.id, tutoringScheduleRevision(tutoringScheduleSlots(updated)), {
      fromMeeting: 1, firstStart: moscowMeetingInput(new Date(overlap)), secondStart: local(2), keepOverrides: false,
    })).rejects.toThrow('должна закончиться')
    expect((await scheduleTutoringIntroduction(payload, teacher, stream.id, intro, earlier)).introductionStartsAt).toBe(earlier)
    await payload.update({ collection: 'tutoring-streams', id: stream.id, data: { status: 'archived' } })
    await expect(scheduleTutoringIntroduction(payload, teacher, stream.id, earlier, intro)).rejects.toThrow('недоступен')
  })

  it('синхронизирует отдельный перенос и массовую правку в существующие события Google', async () => {
    const { calendars, events, changes, simulate, fetchGoogle } = googleFixture()
    expect((await googleAccount(accountRequest(studentSession))).status).toBe(403)
    expect((await googleAccount(accountRequest(teacherSession, 'https://foreign.test'))).status).toBe(403)
    const callback = await beginAuthorization()
    expect((await googleCallback(callback(otherSession))).headers.get('location')).toContain('result=expired')
    expect(fetchGoogle).not.toHaveBeenCalled()
    expect((await googleCallback(callback(teacherSession))).headers.get('location')).toContain('result=connected')
    expect((await loadConnection()).encryptedRefreshToken).not.toContain('test-refresh')
    expect((await rest('GET', '/tutoring-calendars', { token: teacherSession })).status).toBe(403)

    const selected = await createStream()
    const draft = await createStream('draft')
    await createStream()
    await setTutoringStreamCalendar(payload, teacher, selected.id, true)
    await setTutoringStreamCalendar(payload, teacher, draft.id, true)
    await expect(setTutoringStreamCalendar(payload, otherTeacher, selected.id, true)).rejects.toThrow('Подключите')

    await syncNow()
    expect(calendars).toHaveLength(1)
    expect((await loadConnection()).lastError).toBe('temporary')
    await syncNow()
    expect(events.size).toBe(1)
    expect((await loadConnection()).lastError).toBe('temporary')
    await payload.update({ collection: 'tutoring-calendars', id: (await loadConnection()).id, data: { nextSyncAt: '2000-01-01T00:00:00.000Z' } })
    expect((await Promise.all([runTutoringCalendarJobs(payload), runTutoringCalendarJobs(payload)])).sort()).toEqual([0, 1])
    expect(changes.calendar).toBe(1)
    expect(changes.insert).toBe(24)
    expect((await loadConnection()).lastError).toBeNull()
    const first = [...events.values()].find(event => event.extendedProperties?.private?.meeting === `${selected.id}.1`)
    if (!first) throw new Error('First meeting not found in Google')
    expect(first).toMatchObject({
      start: { dateTime: startsAt }, end: { dateTime: new Date(nextTuesday.getTime() + 120 * 60_000).toISOString() }, visibility: 'private',
    })
    const second = [...events.values()].find(event => event.extendedProperties?.private?.meeting === `${selected.id}.2`)
    expect(second).toMatchObject({
      start: { dateTime: later(2) }, end: { dateTime: new Date(Date.parse(later(2)) + 120 * 60_000).toISOString() },
    })

    await moveTutoringMeeting(payload, teacher, selected.id, 1, { expectedStart: startsAt, newStart: later(1) })
    await moveTutoringMeeting(payload, teacher, selected.id, 1, { expectedStart: later(1), newStart: later(3) })
    await syncNow()
    expect(events.get(first.id)?.start?.dateTime).toBe(later(3))
    expect(changes.patch).toBe(1)
    expect(changes.insert).toBe(24)

    const beforeSeries = await payload.findByID({ collection: 'tutoring-streams', id: selected.id })
    const originalIds = [...events.keys()].sort()
    await changeTutoringSchedule(payload, teacher, selected.id, tutoringScheduleRevision(tutoringScheduleSlots(beforeSeries)), {
      fromMeeting: 2, firstStart: local(6), secondStart: local(9), keepOverrides: false,
    })
    await syncNow()
    expect([...events.keys()].sort()).toEqual(originalIds)
    expect(events.get(first.id)?.start?.dateTime).toBe(later(3))
    const byMeeting = new Map([...events.values()].map(event => [event.extendedProperties?.private?.meeting, event]))
    expect(byMeeting.get(`${selected.id}.2`)).toMatchObject({ id: second?.id, start: { dateTime: later(6) } })
    expect(byMeeting.get(`${selected.id}.3`)?.start?.dateTime).toBe(later(9))
    expect(byMeeting.get(`${selected.id}.24`)?.start?.dateTime).toBe(later(6 + 11 * 7))
    expect(changes.patch).toBe(24)
    expect(changes.insert).toBe(24)
    await syncNow()
    expect(changes.patch).toBe(24)

    const firstIntro = new Date(Date.parse(startsAt) - 3_600_000).toISOString()
    const movedIntro = new Date(Date.parse(firstIntro) - 3_600_000).toISOString()
    await scheduleTutoringIntroduction(payload, teacher, selected.id, '', firstIntro)
    await syncNow()
    const introduction = [...events.values()].find(event => event.extendedProperties?.private?.meeting === `${selected.id}.introduction`)
    if (!introduction) throw new Error('Вводная встреча отсутствует в Google')
    expect(introduction).toMatchObject({
      start: { dateTime: firstIntro }, end: { dateTime: startsAt }, visibility: 'private',
      description: `${origin}/tutoring/react-next/introduction`, summary: `${selected.title} · Вводная встреча`,
    })
    await scheduleTutoringIntroduction(payload, teacher, selected.id, firstIntro, movedIntro)
    await syncNow()
    expect(events.get(introduction.id)).toMatchObject({ start: { dateTime: movedIntro }, end: { dateTime: firstIntro } })
    expect(events.get(first.id)?.start?.dateTime).toBe(later(3))
    expect(changes.insert).toBe(25)

    simulate.revoked = true
    await payload.update({ collection: 'tutoring-streams', id: selected.id, data: { status: 'archived' } })
    await syncNow()
    expect(await loadConnection()).toMatchObject({ status: 'reconnect', encryptedRefreshToken: null })
    expect(events.get(first.id)?.status).not.toBe('cancelled')
    simulate.revoked = false
    const sameAccount = await beginAuthorization()
    expect((await googleCallback(sameAccount(teacherSession))).headers.get('location')).toContain('result=connected')
    const past = { ...first, id: 'past-meeting', start: { dateTime: '2000-01-01T01:00:00Z' } }
    const personal = { id: 'unmanaged-event', start: { dateTime: startsAt } }
    events.set(past.id, past)
    events.set(personal.id, personal)
    await syncNow()
    await syncNow()
    expect(events.get(first.id)?.status).toBe('cancelled')
    expect(events.get(introduction.id)?.status).toBe('cancelled')
    expect(events.get(past.id)).toEqual(past)
    expect(events.get(personal.id)).toEqual(personal)
    events.delete(past.id)
    events.delete(personal.id)

    await payload.update({ collection: 'tutoring-streams', id: selected.id, data: { status: 'active' } })
    await syncNow()
    await syncNow()
    expect([...events.values()].filter(event => event.status !== 'cancelled')).toHaveLength(25)
    expect(changes.calendar).toBe(1)
    expect((await googleAccount(accountRequest(teacherSession, origin, '?operation=disconnect'))).headers.get('location')).toContain('result=disconnected')
    await syncNow()
    expect(await loadConnection()).toMatchObject({ status: 'disconnected', encryptedRefreshToken: null })
    expect([...events.values()].filter(event => event.status !== 'cancelled')).toHaveLength(25)
  })
})
