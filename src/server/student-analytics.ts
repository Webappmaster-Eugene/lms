import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type CollectionAfterChangeHook, type CollectionAfterLoginHook, type CollectionAfterLogoutHook, type CollectionBeforeChangeHook, type Payload, type PayloadRequest, type Where } from 'payload'
import type { StudentSessionTelemetry, User } from '@/payload-types'
import { activityInput, deviceLabels, sessionStatus, StudentAnalyticsError, type AnalyticsTarget, type StudentAnalyticsSnapshot, type StudentEventDTO, type StudentEventType, type StudentSessionDTO } from '@/lib/student-analytics'
import { childReq } from '@/lib/payload-req'
import { readVideoPositions } from '@/lib/learning-state'
import { relationId } from '@/lib/relation-id'
import { collectAllPages } from '@/lib/paginate'
import { authSessionHash } from '@/payload/hooks/authSessionRevocations'
import { requireLessonAccess } from '@/server/learning-access'
import { lookupGeoIp } from '@/server/geoip'
import { getUserWebVitals } from '@/server/web-vitals'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

const DAY = 86_400_000
const PAGE_SIZE = 25
type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
type Adapter = { sessions?: Record<string | number, { db: Executor } | undefined> }
type EventInput = { type: StudentEventType; source: 'server' | 'observed'; key: string; session?: number; course?: number; lesson?: number; taskId?: number; achievementId?: number; certificateId?: number; path?: string }
const analyticsReq = (req: PayloadRequest) => childReq(req, { syncStudentAnalytics: true })
const id = (value: unknown): number | null => { try { return value == null ? null : relationId(value) } catch { return null } }

async function lockUser(req: PayloadRequest, userId: number) {
  const transactionID = await req.transactionID
  const db = transactionID === undefined ? undefined : (req.payload.db as unknown as Adapter).sessions?.[transactionID]?.db
  if (!db) throw new Error('Student analytics requires a database transaction')
  // Auth, rewards and notification activity use this same row first. Never acquire 7203/7204 here.
  await db.execute(sql`select id from users where id = ${userId} for update`)
}

async function event(req: PayloadRequest, userId: number, input: EventInput) {
  const eventKey = createHash('sha256').update(`${userId}:${input.type}:${input.key}`).digest('hex')
  const existing = await req.payload.find({ collection: 'student-learning-events', where: { eventKey: { equals: eventKey } }, limit: 1, depth: 0, overrideAccess: true, req })
  if (existing.docs[0]) return
  const data = { ...input }
  delete (data as Partial<EventInput>).key
  await req.payload.create({ collection: 'student-learning-events', data: { ...data, eventKey, user: userId, at: new Date().toISOString() }, req: analyticsReq(req), overrideAccess: true, depth: 0 })
}

/** Traefik appends its actual peer to XFF. Never trust an arbitrary client-supplied first entry. */
export function trustedClientIp(headers: Headers): string | null {
  if (process.env.LMS_TRUST_PROXY !== 'true') return null
  const forwarded = headers.get('x-forwarded-for')
  if (!forwarded || forwarded.length > 1024) return null
  const ip = forwarded.split(',').at(-1)?.trim() ?? ''
  return isIP(ip) ? ip : null
}

async function location(headers: Headers) {
  const ip = trustedClientIp(headers)
  const geo = ip ? await lookupGeoIp(ip) : null
  return { ip, ipExpiresAt: ip ? new Date(Date.now() + 30 * DAY).toISOString() : null, countryCode: geo?.countryCode ?? null, country: geo?.country ?? null, region: geo?.region ?? null, city: geo?.city ?? null, geoSource: geo?.source === 'local-mmdb' ? 'local-mmdb' as const : 'unknown' as const }
}

function loginSid(token: string, user: User): string | null {
  // This function is called only with the JWT freshly signed inside Payload's login operation.
  try {
    const claims: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    if (!claims || typeof claims !== 'object' || !('sid' in claims) || typeof claims.sid !== 'string' || !('id' in claims) || claims.id !== user.id) return null
    return user.sessions?.some(session => session.id === claims.sid) ? claims.sid : null
  } catch { return null }
}

export const recordStudentLogin: CollectionAfterLoginHook<User> = async ({ user, token, req }) => {
  const sid = loginSid(token, user)
  const session = sid ? user.sessions?.find(item => item.id === sid) : null
  if (!sid || !session) throw new StudentAnalyticsError('Не удалось сохранить сессию', 500)
  await lockUser(req, user.id)
  const sessionHash = authSessionHash(sid)
  const found = await req.payload.find({ collection: 'student-session-telemetry', where: { sessionHash: { equals: sessionHash } }, req, overrideAccess: true, depth: 0, limit: 1 })
  const now = new Date().toISOString()
  const data = { user: user.id, sessionHash, firstSeenAt: session.createdAt ?? now, lastSeenAt: now, expiresAt: session.expiresAt, ...deviceLabels(req.headers.get('user-agent')), ...await location(req.headers) }
  const telemetry = found.docs[0] ?? await req.payload.create({ collection: 'student-session-telemetry', data, req: analyticsReq(req), overrideAccess: true, depth: 0 })
  await event(req, user.id, { type: 'login', source: 'server', key: sessionHash, session: telemetry.id })
  return user
}

export const recordStudentLogout: CollectionAfterLogoutHook = async ({ req }) => {
  if (!req.user) return
  const sid = '_sid' in req.user && typeof req.user._sid === 'string' ? req.user._sid : null
  if (!sid) return
  await lockUser(req, req.user.id)
  const all = req.searchParams?.get('allSessions') === 'true' || req.context.revokeAllAuthSessions === true
  const records = await collectAllPages(({ page, limit }) => req.payload.find({ collection: 'student-session-telemetry', req, overrideAccess: true, depth: 0, page, limit, sort: 'id', where: { and: [{ user: { equals: req.user?.id } }, ...(all ? [{ endedAt: { exists: false } }] : [{ sessionHash: { equals: authSessionHash(sid) } }])] } }))
  for (const record of records) {
    await req.payload.update({ collection: 'student-session-telemetry', id: record.id, data: { endedAt: new Date().toISOString() }, req: analyticsReq(req), overrideAccess: true })
    await event(req, req.user.id, { type: 'logout', source: 'server', key: record.sessionHash, session: record.id })
  }
}

/** Acquire before FK insertion, including an administrator issuing rewards directly. */
export const lockStudentDomainOwner: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const owner = id(data.user ?? originalDoc?.user)
  if (owner !== null) await lockUser(req, owner)
  return data
}

/** Registered on four domain collections, including certificate creation with skipHooks. */
export const recordStudentDomainEvent: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req, collection }) => {
  if (req.context.skipStudentAnalytics === true) return doc
  const userId = id(doc.user)
  if (userId === null) return doc
  let input: EventInput | null = null
  if (collection.slug === 'user-progress' && doc.isCompleted === true && (operation === 'create' || previousDoc?.isCompleted !== true)) {
    const lessonId = id(doc.lesson)
    if (lessonId !== null) input = { type: 'lesson_completed', source: 'server', key: String(lessonId), lesson: lessonId }
  } else if (collection.slug === 'user-trainer-progress' && doc.isCompleted === true && doc.verifiedBy === 'server' && (operation === 'create' || previousDoc?.isCompleted !== true || previousDoc?.verifiedBy !== 'server')) {
    const taskId = id(doc.task)
    if (taskId !== null) input = { type: 'trainer_completed', source: 'server', key: String(taskId), taskId }
  } else if (collection.slug === 'user-achievements' && operation === 'create') {
    const achievementId = id(doc.achievement)
    if (achievementId !== null) input = { type: 'achievement_unlocked', source: 'server', key: String(achievementId), achievementId }
  } else if (collection.slug === 'certificates' && operation === 'create') {
    input = { type: 'certificate_issued', source: 'server', key: String(doc.id), certificateId: Number(doc.id), ...(doc.type === 'course' && id(doc.relatedEntity) !== null ? { course: Number(doc.relatedEntity) } : {}) }
  }
  if (!input) return doc
  await lockUser(req, userId)
  if (input.lesson) {
    const lesson = await req.payload.findByID({ collection: 'lessons', id: input.lesson, select: { course: true }, depth: 0, overrideAccess: true, req })
    const course = id(lesson.course)
    if (course !== null) input.course = course
  }
  await event(req, userId, input)
  return doc
}

async function observedTarget(req: PayloadRequest, user: User, path: string): Promise<{ course: number | null; lesson: number | null }> {
  const match = /^\/(lessons|courses|roadmaps)\/([a-zA-Z0-9_-]+)$/.exec(path)
  if (!match) {
    if (!new Set(['/', '/admin', '/courses', '/roadmaps', '/trainer', '/trainer/interview', '/profile', '/profile/edit', '/achievements', '/certificates', '/notifications', '/settings/notifications', '/notes', '/saved', '/leaderboard', '/help', '/contacts', '/questions']).has(path) && !/^\/trainer\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?$/.test(path) && !/^\/certificates\/\d+$/.test(path)) throw new StudentAnalyticsError('Страница не отслеживается')
    return { course: null, lesson: null }
  }
  const collection = match[1] === 'lessons' ? 'lessons' : match[1] === 'courses' ? 'courses' : 'roadmaps'
  const found = await req.payload.find({ collection, where: { and: [{ slug: { equals: match[2] } }, { isPublished: { equals: true } }] }, select: collection === 'lessons' ? { course: true, section: true, isPublished: true } : { title: true, isPublished: true }, limit: 1, depth: 0, overrideAccess: false, req })
  const target = found.docs[0]
  if (!target) throw new StudentAnalyticsError('Материал недоступен', 404)
  if (collection === 'lessons' && 'course' in target && 'section' in target) await requireLessonAccess(req.payload, user, target, req)
  return { course: collection === 'courses' ? target.id : 'course' in target ? id(target.course) : null, lesson: collection === 'lessons' ? target.id : null }
}

export async function recordStudentActivity(payload: Payload, user: User, headers: Headers, raw: unknown) {
  const input = activityInput(raw)
  const sid = '_sid' in user && typeof user._sid === 'string' ? user._sid : null
  if (!sid) throw new StudentAnalyticsError('Войдите в аккаунт', 401)
  const req = await createLocalReq({ user, req: { headers } }, payload)
  await initTransaction(req)
  try {
    await lockUser(req, user.id)
    // Auth may have raced logout; reread the SID after locking and applying revocation filtering.
    const current = await payload.findByID({ collection: 'users', id: user.id, select: { sessions: true, isActive: true }, req, overrideAccess: true, depth: 0 })
    const session = current.sessions?.find(item => item.id === sid && Date.parse(item.expiresAt) > Date.now())
    if (!session || current.isActive === false) throw new StudentAnalyticsError('Сессия завершена', 401)
    const sessionHash = authSessionHash(sid)
    const existing = (await payload.find({ collection: 'student-session-telemetry', where: { sessionHash: { equals: sessionHash } }, req, overrideAccess: true, depth: 0, limit: 1 })).docs[0]
    const now = Date.now()
    // Tabs and route changes cannot fill the event log faster than once per minute per session.
    if (existing?.path && now - Date.parse(existing.lastSeenAt) < 60_000) { await commitTransaction(req); return { recorded: false } }
    const target = await observedTarget(req, user, input.path)
    const at = new Date(now).toISOString()
    const currentLocation = await location(headers)
    const incomingDevice = headers.get('user-agent') ? deviceLabels(headers.get('user-agent')) : existing ? { device: existing.device, browser: existing.browser, os: existing.os } : deviceLabels(null)
    const currentGeo = currentLocation.ip || !existing ? currentLocation : { ip: existing.ip, ipExpiresAt: existing.ipExpiresAt, countryCode: existing.countryCode, country: existing.country, region: existing.region, city: existing.city, geoSource: existing.geoSource }
    const data = { user: user.id, sessionHash, firstSeenAt: session.createdAt ?? at, lastSeenAt: at, expiresAt: session.expiresAt, ...incomingDevice, ...currentGeo, ...input, ...target, endedAt: null, lastEventAt: at }
    const telemetry = existing ? await payload.update({ collection: 'student-session-telemetry', id: existing.id, data, req: analyticsReq(req), overrideAccess: true, depth: 0 }) : await payload.create({ collection: 'student-session-telemetry', data, req: analyticsReq(req), overrideAccess: true, depth: 0 })
    await event(req, user.id, { type: target.lesson ? 'lesson_view' : 'page_view', source: 'observed', key: `${sessionHash}:${Math.floor(now / 60_000)}`, session: telemetry.id, path: input.path, ...(target.course ? { course: target.course } : {}), ...(target.lesson ? { lesson: target.lesson } : {}) })
    await commitTransaction(req)
    return { recorded: true }
  } catch (error) { await killTransaction(req); throw error }
}

async function targetMaps(req: PayloadRequest, lessonIds: number[], courseIds: number[]) {
  const lessons = lessonIds.length ? (await req.payload.find({ collection: 'lessons', where: { id: { in: [...new Set(lessonIds)] } }, select: { title: true, slug: true, course: true }, limit: lessonIds.length, depth: 0, overrideAccess: true, req })).docs : []
  const allCourseIds = [...new Set([...courseIds, ...lessons.flatMap(lesson => id(lesson.course) ?? [])])]
  const courses = allCourseIds.length ? (await req.payload.find({ collection: 'courses', where: { id: { in: allCourseIds } }, select: { title: true, slug: true }, limit: allCourseIds.length, depth: 0, overrideAccess: true, req })).docs : []
  return { lessons: new Map(lessons.map(lesson => [lesson.id, { id: lesson.id, title: lesson.title, href: `/lessons/${lesson.slug}` } satisfies AnalyticsTarget])), courses: new Map(courses.map(course => [course.id, { id: course.id, title: course.title, href: `/courses/${course.slug}` } satisfies AnalyticsTarget])), lessonCourses: new Map(lessons.map(lesson => [lesson.id, id(lesson.course)])) }
}

export async function studentAnalyticsSnapshot(payload: Payload, admin: User, userId: number, sessionsPage = 1, eventsPage = 1): Promise<StudentAnalyticsSnapshot> {
  const req = await createLocalReq({ user: admin }, payload)
  if ((await getAuthoritativeLearningPolicy(payload, admin.id, req)).role !== 'admin') throw new StudentAnalyticsError('Просмотр доступен только администратору', 403)
  // SDK field access exposes sessions only to their owner, even to an authenticated admin.
  // Read the narrow server-side projection after the authoritative admin guard, then return only the safe DTO.
  const student = await payload.findByID({ collection: 'users', id: userId, select: { firstName: true, lastName: true, email: true, isActive: true, role: true, totalPoints: true, sessions: true }, req, overrideAccess: true, depth: 0 })
  const activeSessions = student.isActive === false ? [] : (student.sessions ?? []).filter(session => Date.parse(session.expiresAt) > Date.now())
  const currentExpirations = new Map(activeSessions.map(session => [authSessionHash(session.id), session.expiresAt]))
  const activeHashes = new Set(activeSessions.map(session => authSessionHash(session.id)))
  const knownHashes = new Set<string>()
  const activeTelemetry: StudentSessionTelemetry[] = []
  const hashes = [...activeHashes]
  for (let start = 0; start < hashes.length; start += 100) {
    const records = await payload.find({ collection: 'student-session-telemetry', where: { and: [{ user: { equals: userId } }, { sessionHash: { in: hashes.slice(start, start + 100) } }] }, req, overrideAccess: true, depth: 0, limit: 100 })
    for (const record of records.docs) { knownHashes.add(record.sessionHash); activeTelemetry.push(record) }
  }
  const unknown = activeSessions.filter(session => !knownHashes.has(authSessionHash(session.id)))
  const offset = Math.max(0, (sessionsPage - 1) * PAGE_SIZE - unknown.length)
  const needed = Math.max(0, sessionsPage * PAGE_SIZE - Math.max(unknown.length, (sessionsPage - 1) * PAGE_SIZE))
  const firstPage = Math.floor(offset / PAGE_SIZE) + 1
  const baseQuery = { collection: 'student-session-telemetry' as const, where: { user: { equals: userId } }, sort: ['-lastSeenAt', '-id'], limit: PAGE_SIZE, depth: 0, overrideAccess: true, req }
  const [sessionsResult, latestSession, eventsResult, stateResult, preferences, completed, trainer, achievements, certificates, performance] = await Promise.all([
    payload.find({ ...baseQuery, page: firstPage }),
    payload.find({ ...baseQuery, select: { lastSeenAt: true }, limit: 1 }),
    payload.find({ collection: 'student-learning-events', where: { user: { equals: userId } }, sort: ['-at', '-id'], page: eventsPage, limit: PAGE_SIZE, depth: 0, overrideAccess: true, req }),
    payload.find({ collection: 'lesson-learning-states', where: { user: { equals: userId } }, sort: ['-lastViewedAt', '-id'], select: { lesson: true, lastViewedAt: true, lastVideoId: true, positions: true }, limit: 1, depth: 0, overrideAccess: true, req }),
    payload.find({ collection: 'notification-preferences', where: { user: { equals: userId } }, select: { lastLearningAt: true }, limit: 1, depth: 0, overrideAccess: true, req }),
    payload.count({ collection: 'user-progress', where: { user: { equals: userId }, isCompleted: { equals: true } }, overrideAccess: true, req }),
    payload.count({ collection: 'user-trainer-progress', where: { user: { equals: userId }, isCompleted: { equals: true }, verifiedBy: { equals: 'server' } }, overrideAccess: true, req }),
    payload.count({ collection: 'user-achievements', where: { user: { equals: userId } }, overrideAccess: true, req }),
    payload.count({ collection: 'certificates', where: { user: { equals: userId } }, overrideAccess: true, req }),
    getUserWebVitals(req, userId),
  ])
  let sessionRecords = sessionsResult.docs
  if (needed > 0 && offset % PAGE_SIZE + needed > PAGE_SIZE && sessionsResult.hasNextPage) sessionRecords = [...sessionRecords, ...(await payload.find({ ...baseQuery, page: firstPage + 1 })).docs]
  sessionRecords = sessionRecords.slice(offset % PAGE_SIZE, offset % PAGE_SIZE + needed)
  const state = stateResult.docs[0]
  const events = eventsResult.docs
  const maps = await targetMaps(req, [...sessionRecords.flatMap(record => id(record.lesson) ?? []), ...events.flatMap(record => id(record.lesson) ?? []), ...(state && id(state.lesson) ? [Number(id(state.lesson))] : [])], [...sessionRecords.flatMap(record => id(record.course) ?? []), ...events.flatMap(record => id(record.course) ?? [])])
  const taskIds = events.flatMap(record => record.taskId ?? [])
  const achievementIds = events.flatMap(record => record.achievementId ?? [])
  const certificateIds = events.flatMap(record => record.certificateId ?? [])
  const [tasks, awards, issued] = await Promise.all([
    taskIds.length ? payload.find({ collection: 'trainer-tasks', where: { id: { in: taskIds } }, select: { title: true }, limit: PAGE_SIZE, depth: 0, overrideAccess: true, req }).then(result => result.docs) : [],
    achievementIds.length ? payload.find({ collection: 'achievements', where: { id: { in: achievementIds } }, select: { title: true }, limit: PAGE_SIZE, depth: 0, overrideAccess: true, req }).then(result => result.docs) : [],
    certificateIds.length ? payload.find({ collection: 'certificates', where: { id: { in: certificateIds } }, select: { title: true }, limit: PAGE_SIZE, depth: 0, overrideAccess: true, req }).then(result => result.docs) : [],
  ])
  const taskTitles = new Map(tasks.map(task => [task.id, task.title]))
  const awardTitles = new Map(awards.map(award => [award.id, award.title]))
  const certificateTitles = new Map(issued.map(certificate => [certificate.id, certificate.title]))
  const courseTarget = (value: unknown) => maps.courses.get(id(value) ?? -1) ?? null
  const lessonTarget = (value: unknown) => maps.lessons.get(id(value) ?? -1) ?? null
  const sessionDocs: StudentSessionDTO[] = unknown.slice((sessionsPage - 1) * PAGE_SIZE, sessionsPage * PAGE_SIZE).map(session => ({ id: null, device: 'Не определено', browser: 'Не определено', os: 'Не определено', firstSeenAt: session.createdAt ?? '', lastSeenAt: null, expiresAt: session.expiresAt, status: 'active', ip: null, geo: { countryCode: null, country: null, region: null, city: null, source: 'unknown', approximate: true }, timezone: null, standalone: null, path: null, course: null, lesson: null }))
  sessionDocs.push(...sessionRecords.map(record => ({ id: record.id, device: record.device, browser: record.browser, os: record.os, firstSeenAt: record.firstSeenAt, lastSeenAt: record.lastSeenAt, expiresAt: currentExpirations.get(record.sessionHash) ?? record.expiresAt, status: sessionStatus(activeHashes.has(record.sessionHash) && !record.endedAt, currentExpirations.get(record.sessionHash) ?? record.expiresAt, record.lastSeenAt), ip: record.ipExpiresAt && Date.parse(record.ipExpiresAt) > Date.now() ? record.ip ?? null : null, geo: { countryCode: record.countryCode ?? null, country: record.country ?? null, region: record.region ?? null, city: record.city ?? null, source: record.geoSource, approximate: true as const }, timezone: record.timezone ?? null, standalone: record.path ? record.standalone ?? null : null, path: record.path ?? null, course: courseTarget(record.course), lesson: lessonTarget(record.lesson) })))
  const eventDocs: StudentEventDTO[] = events.map(record => ({ id: record.id, type: record.type, source: record.source, at: record.at, course: courseTarget(record.course), lesson: lessonTarget(record.lesson), taskId: record.taskId ?? null, achievementId: record.achievementId ?? null, certificateId: record.certificateId ?? null, path: record.path ?? null, title: record.taskId ? taskTitles.get(record.taskId) ?? null : record.achievementId ? awardTitles.get(record.achievementId) ?? null : record.certificateId ? certificateTitles.get(record.certificateId) ?? null : lessonTarget(record.lesson)?.title ?? courseTarget(record.course)?.title ?? null }))
  const resumeLesson = state ? lessonTarget(state.lesson) : null
  const video = state?.lastVideoId ? readVideoPositions(state.positions)[state.lastVideoId] : undefined
  const totalSessions = sessionsResult.totalDocs + unknown.length
  return { student: { id: student.id, title: `${student.firstName} ${student.lastName}`, email: student.email, isActive: student.isActive !== false, role: student.role }, activeSessionCount: activeSessions.length, onlineSessionCount: activeTelemetry.filter(record => !record.endedAt && sessionStatus(true, currentExpirations.get(record.sessionHash) ?? record.expiresAt, record.lastSeenAt) === 'online').length, lastActiveAt: latestSession.docs[0]?.lastSeenAt ?? null, lastLearningAt: preferences.docs[0]?.lastLearningAt ?? null, resume: state && resumeLesson ? { lesson: resumeLesson, course: courseTarget(maps.lessonCourses.get(resumeLesson.id)), videoId: state.lastVideoId ?? null, seconds: video?.seconds ?? null, lastViewedAt: state.lastViewedAt } : null, totals: { completedLessons: completed.totalDocs, verifiedTrainerTasks: trainer.totalDocs, points: student.totalPoints ?? 0, achievements: achievements.totalDocs, certificates: certificates.totalDocs }, performance, sessions: { docs: sessionDocs, page: sessionsPage, hasNextPage: sessionsPage * PAGE_SIZE <totalSessions, totalDocs: totalSessions }, events: { docs: eventDocs, page: eventsPage, hasNextPage: eventsResult.hasNextPage, totalDocs: eventsResult.totalDocs } }
}

/** Bounded batches keep scheduler latency predictable; stored IP is separately redacted after 30 days. */
export async function cleanupStudentAnalytics(payload: Payload): Promise<{ events: number; sessions: number; ips: number }> {
  const counts = { events: 0, sessions: 0, ips: 0 }
  const cutoff = new Date(Date.now() - 90 * DAY).toISOString()
  const now = new Date().toISOString()
  const sessionExpiry: Where = { and: [{ lastSeenAt: { less_than: cutoff } }, { expiresAt: { less_than: now } }] }
  const ipExpiry: Where = { and: [{ ip: { exists: true } }, { ipExpiresAt: { less_than_equal: now } }] }
  const eventReq = await createLocalReq({}, payload)
  await initTransaction(eventReq)
  try {
    const events = await payload.find({ collection: 'student-learning-events', where: { at: { less_than: cutoff } }, select: {}, sort: 'id', limit: 500, depth: 0, overrideAccess: true, req: eventReq })
    if (events.docs.length) await payload.delete({ collection: 'student-learning-events', where: { id: { in: events.docs.map(doc => doc.id) } }, req: analyticsReq(eventReq), overrideAccess: true })
    counts.events = events.docs.length
    await commitTransaction(eventReq)
  } catch (error) { await killTransaction(eventReq); throw error }

  const candidates = await payload.find({ collection: 'student-session-telemetry', where: { or: [sessionExpiry, ipExpiry] }, select: { user: true }, sort: 'id', limit: 500, depth: 0, overrideAccess: true })
  const owners = new Map<number, number[]>()
  for (const record of candidates.docs) {
    const owner = id(record.user)
    if (owner !== null) owners.set(owner, [...(owners.get(owner) ?? []), record.id])
  }
  // Hold one user row per transaction: a multi-owner lock can invert an audit actor's FK lock order.
  for (const [owner, ids] of [...owners].sort(([left], [right]) => left - right).slice(0, 20)) {
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    try {
      await lockUser(req, owner)
      const selected: Where = { and: [{ user: { equals: owner } }, { id: { in: ids } }] }
      const current = (await payload.find({ collection: 'users', where: { id: { equals: owner } }, select: { sessions: true, isActive: true }, limit: 1, depth: 0, overrideAccess: true, req })).docs[0]
      const liveExpirations = new Map(current?.isActive === false ? [] : (current?.sessions ?? []).filter(session => Date.parse(session.expiresAt) > Date.now()).map(session => [authSessionHash(session.id), session.expiresAt]))
      // A heartbeat may have refreshed the candidate while this sweep waited for its user row.
      const sessions = await payload.find({ collection: 'student-session-telemetry', where: { and: [selected, sessionExpiry] }, select: { sessionHash: true }, limit: 500, depth: 0, overrideAccess: true, req })
      // SDK refresh can extend an authorized session before its next observation updates telemetry expiry.
      const expired = sessions.docs.filter(session => !liveExpirations.has(session.sessionHash))
      for (const session of sessions.docs) {
        const expiry = liveExpirations.get(session.sessionHash)
        if (expiry) await payload.update({ collection: 'student-session-telemetry', id: session.id, data: { expiresAt: expiry }, req: analyticsReq(req), overrideAccess: true })
      }
      if (expired.length) await payload.delete({ collection: 'student-session-telemetry', where: { and: [selected, sessionExpiry, { id: { in: expired.map(session => session.id) } }] }, req: analyticsReq(req), overrideAccess: true })
      const ips = await payload.find({ collection: 'student-session-telemetry', where: { and: [selected, ipExpiry] }, select: {}, limit: 500, depth: 0, overrideAccess: true, req })
      if (ips.docs.length) await payload.update({ collection: 'student-session-telemetry', where: { and: [selected, ipExpiry] }, data: { ip: null, ipExpiresAt: null }, req: analyticsReq(req), overrideAccess: true })
      await commitTransaction(req)
      counts.sessions += expired.length
      counts.ips += ips.docs.length
    } catch (error) { await killTransaction(req); throw error }
  }
  return counts
}
