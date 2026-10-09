import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { commitTransaction, createLocalReq, handleEndpoints, initTransaction, killTransaction, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '@payload-config'
import { POST as activityPOST } from '@/app/api/activity/route'
import { GET as analyticsGET } from '@/app/api/manage/student-analytics/route'
import { POST as learningPOST } from '@/app/api/learning-state/route'
import { authSessionHash } from '@/payload/hooks/authSessionRevocations'
import { childReq } from '@/lib/payload-req'
import { learningVideos } from '@/lib/learning-state'
import type { StudentAnalyticsSnapshot } from '@/lib/student-analytics'
import { cleanupStudentAnalytics } from '@/server/student-analytics'
import { lockUserPoints } from '@/lib/user-lock'
import { createAdmin, createCourseTree, createStudent, createSumTask, getTestPayload, login, rest, uid, type CourseTree, type TestUser } from '../helpers/payload'

let payload: Payload
let admin: TestUser
let student: TestUser
let restricted: TestUser
let tree: CourseTree
let adminToken: string
let token: string
let secondToken: string
let restrictedToken: string
let videoId: string
let achievementId: number | null = null
const apiRequest = (path: string, auth = token, body?: unknown, origin?: string) => new Request(`http://lms.test/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(auth ? { Authorization: `JWT ${auth}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(origin ? { Origin: origin } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const snapshot = async () => {
  const response = await analyticsGET(apiRequest(`manage/student-analytics?user=${student.id}`, adminToken))
  expect(response.status).toBe(200)
  return response.json() as Promise<StudentAnalyticsSnapshot>
}
const sessionRow = async (auth = token) => {
  const claims = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString()) as { sid: string }
  return (await payload.find({ collection: 'student-session-telemetry', where: { sessionHash: { equals: authSessionHash(claims.sid) } }, limit: 1, depth: 0 })).docs[0]
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  student = await createStudent(payload)
  restricted = await createStudent(payload, { learningAccessMode: 'assigned' })
  adminToken = await login(payload, admin)
  restrictedToken = await login(payload, restricted)
  tree = await createCourseTree(payload, { lessons: 1 })
  tree.lessons[0] = await payload.update({ collection: 'lessons', id: tree.lessons[0].id, data: { content: [{ blockType: 'video', id: 'analytics-video', title: 'Аналитика ролика', videoUrl: 'https://disk.yandex.ru/d/analytics-fixture/video.mp4' }] } })
  videoId = learningVideos(tree.lessons[0])[0].id
  vi.stubEnv('LMS_TRUST_PROXY', 'true')
  const response = await handleEndpoints({ config, request: new Request('http://lms.test/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17 Safari/605', 'X-Forwarded-For': '198.51.100.5, 8.8.8.8' }, body: JSON.stringify({ email: student.email, password: student.password }) }) })
  expect(response.status).toBe(200)
  token = (await response.json() as { token: string }).token
  secondToken = await login(payload, student)
})
afterAll(async () => {
  vi.unstubAllEnvs()
  if (achievementId !== null) await payload.delete({ collection: 'achievements', id: achievementId })
  for (const user of [student, restricted, admin]) if (user) await payload.delete({ collection: 'users', id: user.id })
})

describe('protected admin analytics with real Payload sessions and PostgreSQL', () => {
  it('records two independent signed login sessions without copying raw SID/JWT into the admin DTO', async () => {
    const view = await snapshot()
    expect(view.activeSessionCount).toBe(2)
    expect(view.sessions.docs).toHaveLength(2)
    expect(view.sessions.docs.find(row => row.device === 'Телефон')).toMatchObject({ browser: 'Safari', os: 'iOS', ip: '8.8.8.8', status: 'online' })
    const text = JSON.stringify(view)
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sid: string }
    for (const secret of [token, claims.sid, authSessionHash(claims.sid), 'sessionHash', 'salt', 'hash', 'password']) expect(text).not.toContain(secret)
    expect(view.events.docs.filter(row => row.type === 'login')).toHaveLength(2)
    expect(view.events.docs.every(row => row.source === 'server')).toBe(true)
  })
  it('rejects guest/student analytics and direct infrastructure mutation, including authenticated origin attacks', async () => {
    expect((await analyticsGET(apiRequest(`manage/student-analytics?user=${student.id}`, ''))).status).toBe(401)
    expect((await analyticsGET(apiRequest(`manage/student-analytics?user=${student.id}`))).status).toBe(403)
    for (const collection of ['student-learning-events', 'student-session-telemetry']) {
      expect((await rest('GET', `/${collection}`, { token: adminToken })).status).toBe(403)
      expect((await rest('POST', `/${collection}`, { token: adminToken, body: { user: student.id } })).status).toBe(403)
    }
    expect((await activityPOST(apiRequest('activity', '', { path: '/' }))).status).toBe(401)
    expect((await activityPOST(apiRequest('activity', token, { path: '/' }, 'https://foreign.example'))).status).toBe(403)
    expect((await activityPOST(apiRequest('activity', token, { path: '/?token=secret' }))).status).toBe(400)
    expect((await activityPOST(apiRequest('activity', token, { path: '/', expectedUserId: restricted.id }))).status).toBe(403)
  })
  it('observes an allowed lesson once per minute without completion, points or resetting learning reminders', async () => {
    const before = await snapshot()
    const request = () => apiRequest('activity', token, { path: `/lessons/${tree.lessons[0].slug}`, timezone: 'Europe/Moscow', standalone: true, userId: restricted.id, eventType: 'certificate_issued' })
    expect(await (await activityPOST(request())).json()).toEqual({ recorded: true })
    const parallel = await Promise.all([activityPOST(request()), activityPOST(request()), activityPOST(request())])
    for (const response of parallel) expect(await response.json()).toEqual({ recorded: false })
    const after = await snapshot()
    expect(after.totals).toEqual(before.totals)
    expect(after.lastLearningAt).toEqual(before.lastLearningAt)
    expect(after.events.docs.filter(row => row.type === 'lesson_view')).toHaveLength(1)
    expect(after.events.docs.find(row => row.type === 'lesson_view')).toMatchObject({ source: 'observed', lesson: { id: tree.lessons[0].id }, course: { id: tree.course.id }, path: `/lessons/${tree.lessons[0].slug}` })
    expect(after.sessions.docs.find(row => row.id === (before.sessions.docs.find(item => item.device === 'Телефон')?.id))).toMatchObject({ lesson: { id: tree.lessons[0].id }, standalone: true, timezone: 'Europe/Moscow' })
    expect((await activityPOST(apiRequest('activity', restrictedToken, { path: `/lessons/${tree.lessons[0].slug}` }))).status).toBe(404)
  })
  it('reads exact resume from existing server learning state, independently of page-heartbeat claims', async () => {
    const response = await learningPOST(apiRequest('learning-state', token, { lessonId: tree.lessons[0].id, at: Date.now(), videoId, seconds: 373, ended: false }))
    expect(response.status).toBe(200)
    expect((await snapshot()).resume).toMatchObject({ lesson: { id: tree.lessons[0].id }, course: { id: tree.course.id }, videoId, seconds: 373 })
  })
  it('domain events share the progress transaction and disappear on rollback', async () => {
    const req = await createLocalReq({ user: admin }, payload)
    await initTransaction(req)
    try {
      await payload.create({ collection: 'user-progress', data: { user: restricted.id, lesson: tree.lessons[0].id, isCompleted: true }, req: childReq(req, { skipHooks: true }) })
      expect((await payload.count({ collection: 'student-learning-events', where: { user: { equals: restricted.id }, type: { equals: 'lesson_completed' } }, req })).totalDocs).toBe(1)
    } finally { await killTransaction(req) }
    expect((await payload.count({ collection: 'student-learning-events', where: { user: { equals: restricted.id }, type: { equals: 'lesson_completed' } } })).totalDocs).toBe(0)
  })
  it('records actual lesson completion, achievement and automatically issued course certificate exactly once', async () => {
    const achievement = await payload.create({ collection: 'achievements', data: { title: uid('analytics-award'), description: 'За урок', criteriaType: 'lesson_count', criteriaValue: 1, pointsReward: 3, isActive: true } })
    achievementId = achievement.id
    const progress = await payload.create({ collection: 'user-progress', data: { user: student.id, lesson: tree.lessons[0].id, isCompleted: true } })
    await payload.update({ collection: 'user-progress', id: progress.id, data: { isCompleted: true } })
    const view = await snapshot()
    expect(view.events.docs.filter(row => row.type === 'lesson_completed')).toHaveLength(1)
    expect(view.events.docs.find(row => row.type === 'achievement_unlocked' && row.achievementId === achievement.id)).toMatchObject({ source: 'server', title: achievement.title })
    expect(view.events.docs.find(row => row.type === 'certificate_issued' && row.course?.id === tree.course.id)).toMatchObject({ source: 'server', title: tree.course.title })
    expect(view.totals.completedLessons).toBe(1)
    expect(view.totals.certificates).toBeGreaterThanOrEqual(1)
  })
  it('ignores client-marked trainer success and records only server-verified transition without code disclosure', async () => {
    const task = await createSumTask(payload)
    const row = await payload.create({ collection: 'user-trainer-progress', data: { user: student.id, task: task.id, isCompleted: true, verifiedBy: 'client', userCode: 'private solution' }, context: { skipHooks: true } })
    expect((await snapshot()).events.docs.filter(event => event.type === 'trainer_completed')).toHaveLength(0)
    await payload.update({ collection: 'user-trainer-progress', id: row.id, data: { verifiedBy: 'server' }, context: { skipHooks: true } })
    const view = await snapshot()
    expect(view.events.docs.find(event => event.type === 'trainer_completed')).toMatchObject({ taskId: task.id, source: 'server', title: task.title })
    expect(JSON.stringify(view)).not.toContain('private solution')
  })
  it('shows old untracked active sessions honestly and paginates without silently omitting them', async () => {
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    const legacyId = uid('legacy-session')
    const current = await payload.findByID({ collection: 'users', id: student.id, depth: 0, req })
    await payload.update({ collection: 'users', id: student.id, data: { sessions: [...(current.sessions ?? []), { id: legacyId, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86_400_000).toISOString() }] }, req })
    await commitTransaction(req)
    const view = await snapshot()
    expect(view.sessions.docs[0]).toMatchObject({ id: null, device: 'Не определено', lastSeenAt: null, status: 'active', ip: null })
    expect(view.activeSessionCount).toBe(3)
    expect(view.sessions.totalDocs).toBe(3)
    expect(JSON.stringify(view)).not.toContain(legacyId)
  })
  it('logout cannot be undone by a late heartbeat and preserves the other device', async () => {
    expect((await rest('POST', '/users/logout', { token })).status).toBe(200)
    expect((await activityPOST(apiRequest('activity', token, { path: '/' }))).status).toBe(401)
    expect((await activityPOST(apiRequest('activity', secondToken, { path: '/profile' }))).status).toBe(200)
    const view = await snapshot()
    expect(view.activeSessionCount).toBe(2)
    expect(view.sessions.docs.find(row => row.id === undefined)).toBeUndefined()
    expect(view.events.docs.some(row => row.type === 'logout' && row.source === 'server')).toBe(true)
    expect(view.sessions.docs.some(row => row.status === 'revoked')).toBe(true)
  })
  it('redacts expired raw IP separately from bounded event/session retention', async () => {
    const record = await sessionRow(secondToken)
    await payload.update({ collection: 'student-session-telemetry', id: record.id, data: { ip: '8.8.8.8', ipExpiresAt: new Date(Date.now() - 1000).toISOString() }, context: { syncStudentAnalytics: true } })
    expect((await snapshot()).sessions.docs.find(row => row.id === record.id)?.ip).toBeNull()
    await cleanupStudentAnalytics(payload)
    expect((await payload.findByID({ collection: 'student-session-telemetry', id: record.id, depth: 0 })).ip).toBeNull()
  })
  it('deletes old telemetry in bounded retention batches while retaining a recent immutable event', async () => {
    const oldAt = new Date(Date.now() - 91 * 86_400_000).toISOString()
    const oldSession = await payload.create({ collection: 'student-session-telemetry', data: { user: student.id, sessionHash: authSessionHash(uid('expired')), firstSeenAt: oldAt, lastSeenAt: oldAt, expiresAt: oldAt, device: 'Не определено', browser: 'Не определено', os: 'Не определено', geoSource: 'unknown' }, context: { syncStudentAnalytics: true } })
    const oldEvent = await payload.create({ collection: 'student-learning-events', data: { user: student.id, eventKey: uid('old-event'), type: 'login', source: 'server', at: oldAt }, context: { syncStudentAnalytics: true } })
    const recentEvent = await payload.create({ collection: 'student-learning-events', data: { user: student.id, eventKey: uid('recent-event'), type: 'page_view', source: 'observed', at: new Date().toISOString(), session: oldSession.id }, context: { syncStudentAnalytics: true } })
    await expect(payload.update({ collection: 'student-learning-events', id: recentEvent.id, data: { type: 'certificate_issued' }, context: { syncStudentAnalytics: true } })).rejects.toThrow()
    const result = await cleanupStudentAnalytics(payload)
    expect(result.events).toBeGreaterThanOrEqual(1)
    expect(result.sessions).toBeGreaterThanOrEqual(1)
    await expect(payload.findByID({ collection: 'student-learning-events', id: oldEvent.id })).rejects.toThrow()
    await expect(payload.findByID({ collection: 'student-session-telemetry', id: oldSession.id })).rejects.toThrow()
    expect(await payload.findByID({ collection: 'student-learning-events', id: recentEvent.id, depth: 0 })).toMatchObject({ type: 'page_view', source: 'observed', session: null })
  })
  it('rechecks expiry after the owner lock instead of erasing a concurrently refreshed session or IP', async () => {
    const record = await sessionRow(secondToken)
    const stale = new Date(Date.now() - 91 * 86_400_000).toISOString()
    await payload.update({ collection: 'student-session-telemetry', id: record.id, data: { lastSeenAt: stale, expiresAt: stale, ip: '8.8.8.8', ipExpiresAt: stale }, context: { syncStudentAnalytics: true } })
    const held = await createLocalReq({}, payload)
    await initTransaction(held)
    await lockUserPoints(held, student.id)
    let resolveCandidate: (() => void) | undefined
    const candidateSeen = new Promise<void>((resolve) => { resolveCandidate = resolve })
    const originalFind = payload.db.find.bind(payload.db)
    const spy = vi.spyOn(payload.db, 'find').mockImplementation(async (options) => {
      const result = await originalFind(options)
      if (options.collection === 'student-session-telemetry' && options.limit === 500) resolveCandidate?.()
      return result
    })
    let sweep: ReturnType<typeof cleanupStudentAnalytics> | undefined
    try {
      sweep = cleanupStudentAnalytics(payload)
      await candidateSeen
      const future = new Date(Date.now() + 30 * 86_400_000).toISOString()
      await payload.update({ collection: 'student-session-telemetry', id: record.id, data: { lastSeenAt: new Date().toISOString(), expiresAt: future, ip: '1.1.1.1', ipExpiresAt: future }, req: childReq(held, { syncStudentAnalytics: true }) })
      await commitTransaction(held)
      await sweep
      expect(await payload.findByID({ collection: 'student-session-telemetry', id: record.id, depth: 0 })).toMatchObject({ ip: '1.1.1.1', expiresAt: future, ipExpiresAt: future })
    } finally {
      spy.mockRestore()
      await killTransaction(held)
      await sweep?.catch(() => undefined)
    }
  })
  it('serializes account deletion before child cleanup while retention overlaps its open transaction', async () => {
    const user = await createStudent(payload)
    const stale = new Date(Date.now() - 91 * 86_400_000).toISOString()
    const metadata = await payload.create({ collection: 'student-session-telemetry', data: { user: user.id, sessionHash: authSessionHash(uid('deleted-owner')), firstSeenAt: stale, lastSeenAt: stale, expiresAt: stale, device: 'Не определено', browser: 'Не определено', os: 'Не определено', geoSource: 'unknown' }, context: { syncStudentAnalytics: true } })
    await payload.create({ collection: 'student-learning-events', data: { user: user.id, eventKey: uid('deleted-owner-event'), type: 'page_view', source: 'observed', at: new Date().toISOString(), session: metadata.id }, context: { syncStudentAnalytics: true } })
    let signalDeleted: (() => void) | undefined
    let releaseDelete: (() => void) | undefined
    const childDeleted = new Promise<void>((resolve) => { signalDeleted = resolve })
    const allowCommit = new Promise<void>((resolve) => { releaseDelete = resolve })
    const originalDelete = payload.db.deleteOne.bind(payload.db)
    const spy = vi.spyOn(payload.db, 'deleteOne').mockImplementation(async (options) => {
      const result = await originalDelete(options)
      const target = options.where?.id
      if (options.collection === 'student-session-telemetry' && target && !Array.isArray(target) && target.equals === metadata.id) {
        // The child row is deleted but its transaction still holds the row lock until parent deletion commits.
        signalDeleted?.()
        await allowCommit
      }
      return result
    })
    const adapter = payload.db as unknown as { drizzle: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } }
    let deletion: Promise<unknown> | undefined
    let sweep: ReturnType<typeof cleanupStudentAnalytics> | undefined
    try {
      deletion = payload.delete({ collection: 'users', id: user.id })
      await childDeleted
      sweep = cleanupStudentAnalytics(payload)
      // Observe actual overlapping PostgreSQL lock contention, rather than depending on timer scheduling.
      await vi.waitFor(async () => {
        const result = await adapter.drizzle.execute(sql`select count(*)::integer as waiting from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state = 'active' and wait_event_type = 'Lock'`)
        const row: unknown = result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows) ? result.rows[0] : null
        const waiting = row && typeof row === 'object' && 'waiting' in row ? Number(row.waiting) : 0
        expect(waiting).toBeGreaterThan(0)
      }, { timeout: 5000, interval: 20 })
      releaseDelete?.()
      await Promise.all([deletion, sweep])
      await expect(payload.findByID({ collection: 'users', id: user.id })).rejects.toThrow()
      expect((await payload.count({ collection: 'student-session-telemetry', where: { user: { equals: user.id } } })).totalDocs).toBe(0)
      expect((await payload.count({ collection: 'student-learning-events', where: { user: { equals: user.id } } })).totalDocs).toBe(0)
    } finally {
      releaseDelete?.()
      await Promise.allSettled([deletion, sweep].filter((operation): operation is NonNullable<typeof operation> => operation !== undefined))
      spy.mockRestore()
      const remaining = await payload.find({ collection: 'users', where: { id: { equals: user.id } }, limit: 1, depth: 0 })
      if (remaining.docs.length) await payload.delete({ collection: 'users', id: user.id })
    }
  })
})
