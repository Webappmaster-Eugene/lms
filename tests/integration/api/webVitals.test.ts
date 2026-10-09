import { createLocalReq, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'
import { POST } from '@/app/api/vitals/route'
import { cleanupWebVitals, getUserWebVitals, recordWebVitals, webVitalReportKey } from '@/server/web-vitals'
import { createAdmin, createStudent, getTestPayload, login, rest, type TestUser } from '../helpers/payload'

let payload: Payload
let student: TestUser
let other: TestUser
let admin: TestUser
let token: string
let secondToken: string
let otherToken: string

beforeAll(async () => {
  payload = await getTestPayload()
  student = await createStudent(payload)
  other = await createStudent(payload)
  admin = await createAdmin(payload)
  token = await login(payload, student)
  secondToken = await login(payload, student)
  otherToken = await login(payload, other)
})

function request(id: string, name: 'LCP' | 'INP' | 'CLS' = 'LCP', value = 2500, auth = token, overrides: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request('http://lms.test/api/vitals', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `JWT ${auth}` } : {}), ...headers },
    body: JSON.stringify({ expectedUserId: student.id, path: '/lessons/private-course-id', metric: { name, value, id, navigationType: 'navigate' }, ...overrides }),
  })
}

async function snapshot(userId = student.id) {
  return getUserWebVitals(await createLocalReq({ user: admin }, payload), userId)
}

describe('Web Vitals RUM: authenticated real SID and database storage', () => {
  it('requires actual login, rejects broken authorization instead of falling back to a valid cookie', async () => {
    expect((await POST(request('unauth', 'LCP', 1, ''))).status).toBe(401)
    expect((await POST(request('broken-auth', 'LCP', 1, token, {}, { Authorization: 'Broken', Cookie: `payload-token=${token}`, Origin: 'http://lms.test' }))).status).toBe(401)
  })

  it('deduplicates one metric/page instance and updates its final cumulative value', async () => {
    expect((await POST(request('v5-shared', 'CLS', 0.02))).status).toBe(200)
    expect((await POST(request('v5-shared', 'CLS', 0.31))).status).toBe(200)
    const rows = await payload.find({ collection: 'web-vitals-reports', where: { user: { equals: student.id } }, depth: 0, overrideAccess: true })
    expect(rows.docs).toHaveLength(1)
    expect(rows.docs[0]).toMatchObject({ user: student.id, name: 'CLS', value: 0.31, routeTemplate: '/lessons/[slug]' })
    expect(rows.docs[0]?.sessionHash).toMatch(/^[a-f0-9]{64}$/)
    expect(rows.docs[0]?.reportKey).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(rows.docs)).not.toContain('v5-shared')
    expect(JSON.stringify(rows.docs)).not.toContain('private-course-id')
  })

  it('separates the same metric id across sessions and rejects foreign expected user', async () => {
    expect((await POST(request('v5-shared', 'CLS', 0.12, secondToken))).status).toBe(200)
    expect((await POST(request('foreign', 'CLS', 0.15, otherToken))).status).toBe(403)
    expect((await payload.count({ collection: 'web-vitals-reports', where: { user: { equals: other.id } } })).totalDocs).toBe(0)
    const metric = (await snapshot()).metrics.find((row) => row.name === 'CLS')
    expect(metric?.sampleCount).toBe(2)
    expect(metric?.p75).toBeCloseTo(0.2625)
  })

  it('returns real p75 and sample count without a pass/fail verdict or private hashes', async () => {
    for (const [index, value] of [1000, 2000, 3000, 4000].entries()) expect((await POST(request(`v5-lcp-${index}`, 'LCP', value))).status).toBe(200)
    const result = await snapshot()
    expect(result).toMatchObject({ windowDays: 30, metrics: expect.arrayContaining([{ name: 'LCP', sampleCount: 4, p75: 3250 }, { name: 'INP', sampleCount: 0, p75: null }]) })
    expect(JSON.stringify(result)).not.toMatch(/sessionHash|reportKey|passed|rating|userId/)
    await expect(getUserWebVitals(await createLocalReq({ user: other }, payload), student.id)).rejects.toMatchObject({ status: 403 })
    expect((await getUserWebVitals(await createLocalReq({ user: student }, payload), student.id)).windowDays).toBe(30)
  })

  it('requires canonical Origin for browser cookies and blocks foreign Origin even with a valid JWT', async () => {
    // Payload rejects cookie authentication before the route when Origin is absent.
    expect((await POST(request('no-origin', 'LCP', 1, '', {}, { Cookie: `payload-token=${token}` }))).status).toBe(401)
    expect((await POST(request('cookie-ok', 'LCP', 1, '', {}, { Cookie: `payload-token=${token}`, Origin: 'http://lms.test' }))).status).toBe(200)
    const invalidHeaders: Record<string, string>[] = [{ Origin: 'http://foreign.test' }, { Origin: 'http://lms.test', 'Sec-Fetch-Site': 'same-site' }, { Origin: 'http://lms.test', 'Sec-Fetch-Site': 'cross-site' }]
    for (const headers of invalidHeaders) {
      expect((await POST(request('bad-origin', 'LCP', 1, token, {}, headers))).status).toBe(403)
    }
  })

  it('bounds request size, rejects extra payload/attribution fields and never stores raw URL queries', async () => {
    expect((await POST(request('oversize', 'LCP', 1, token, { extra: 'x'.repeat(5000) }))).status).toBe(413)
    for (const overrides of [
      { path: '/lessons/course?token=synthetic-private' }, { user: other.id },
      { metric: { name: 'LCP', value: 1, id: 'x', entries: ['private notes'] } },
    ]) expect((await POST(request('forged', 'LCP', 1, token, overrides))).status).toBe(400)
  })

  it('blocks raw REST access for students/admins and internal overrides without the capability', async () => {
    const adminToken = await login(payload, admin)
    for (const auth of [token, adminToken]) {
      expect((await rest('GET', '/web-vitals-reports', { token: auth })).status).toBe(403)
      expect((await rest('POST', '/web-vitals-reports', { token: auth, body: { user: student.id, name: 'CLS', value: 0, sessionHash: 's'.repeat(64), reportKey: 'r'.repeat(64), reportedAt: new Date().toISOString(), routeTemplate: '/' } })).status).toBe(403)
    }
    await expect(payload.create({ collection: 'web-vitals-reports', overrideAccess: true, data: { user: student.id, name: 'CLS', value: 0, sessionHash: 's'.repeat(64), reportKey: 'r'.repeat(64), reportedAt: new Date().toISOString(), routeTemplate: '/' } })).rejects.toMatchObject({ status: 403 })
  })

  it('does not change XP, completion, notification activity or analytics heartbeat', async () => {
    const before = await payload.findByID({ collection: 'users', id: student.id })
    const analytics = await payload.find({ collection: 'student-session-telemetry', where: { user: { equals: student.id } }, overrideAccess: true, depth: 0 })
    const eventCount = (await payload.count({ collection: 'student-learning-events', where: { user: { equals: student.id } } })).totalDocs
    expect((await POST(request('no-activity', 'INP', 300))).status).toBe(200)
    expect((await payload.findByID({ collection: 'users', id: student.id })).totalPoints).toBe(before.totalPoints)
    const afterAnalytics = await payload.find({ collection: 'student-session-telemetry', where: { user: { equals: student.id } }, overrideAccess: true, depth: 0 })
    expect(afterAnalytics.docs.map((row) => [row.id, row.lastSeenAt])).toEqual(analytics.docs.map((row) => [row.id, row.lastSeenAt]))
    expect((await payload.count({ collection: 'student-learning-events', where: { user: { equals: student.id } } })).totalDocs).toBe(eventCount)
    for (const collection of ['user-progress', 'points-transactions', 'notification-preferences'] as const) expect((await payload.count({ collection, where: { user: { equals: student.id } } })).totalDocs).toBe(0)
  })

  it('caps new samples at 60/minute per actual SID while permitting final updates to existing ids', async () => {
    const limited = await createStudent(payload)
    const limitedToken = await login(payload, limited)
    for (let index = 0; index < 60; index += 1) {
      expect((await POST(request(`new-${index}`, 'LCP', index, limitedToken, { expectedUserId: limited.id }))).status).toBe(200)
    }
    expect((await POST(request('new-limit', 'LCP', 1, limitedToken, { expectedUserId: limited.id }))).status).toBe(429)
    expect((await POST(request('new-1', 'LCP', 800, limitedToken, { expectedUserId: limited.id }))).status).toBe(200)
  })

  it('persists a shared 120-report quota including duplicate updates in database state', async () => {
    const limited = await createStudent(payload)
    const limitedToken = await login(payload, limited)
    for (let index = 0; index < 120; index += 1) expect((await POST(request('one-page', 'CLS', index / 100, limitedToken, { expectedUserId: limited.id }))).status).toBe(200)
    expect((await POST(request('one-page', 'CLS', 2, limitedToken, { expectedUserId: limited.id }))).status).toBe(429)
    const rows = await payload.find({ collection: 'web-vitals-reports', where: { user: { equals: limited.id } }, overrideAccess: true, depth: 0 })
    expect(rows.docs).toHaveLength(1)
    expect(rows.docs[0]?.quotaReportCount).toBe(120)
    expect(rows.docs[0]?.value).toBe(1.19)
  })

  it('excludes old samples from 30-day p75 and removes at most the requested retention batch', async () => {
    const at = new Date(Date.now() - 91 * 86400000).toISOString()
    await payload.create({ collection: 'web-vitals-reports', overrideAccess: true, context: { syncWebVitals: true }, data: { user: other.id, name: 'LCP', value: 1234, reportKey: webVitalReportKey(other.id, 'synthetic-retention', 'LCP', 'old-page'), sessionHash: 's'.repeat(64), routeTemplate: '/', reportedAt: at } })
    expect((await snapshot(other.id)).metrics.find((metric) => metric.name === 'LCP')).toEqual({ name: 'LCP', sampleCount: 0, p75: null })
    expect(await cleanupWebVitals(payload, 1)).toBe(1)
    expect((await payload.count({ collection: 'web-vitals-reports', where: { user: { equals: other.id } } })).totalDocs).toBe(0)
  })

  it('retains old quota anchors while their session is actively reporting, then removes them after the window', async () => {
    const old = new Date(Date.now() - 91 * 86400000).toISOString()
    const anchor = await payload.create({ collection: 'web-vitals-reports', overrideAccess: true, context: { syncWebVitals: true }, data: { user: other.id, name: 'CLS', value: 0, reportKey: webVitalReportKey(other.id, 'synthetic-active-anchor', 'CLS', 'old'), sessionHash: 'q'.repeat(64), routeTemplate: '/', reportedAt: old, quotaWindowStartedAt: new Date().toISOString(), quotaReportCount: 120 } })
    expect(await cleanupWebVitals(payload, 1000)).toBe(0)
    expect((await payload.findByID({ collection: 'web-vitals-reports', id: anchor.id, overrideAccess: true })).quotaReportCount).toBe(120)
    await payload.update({ collection: 'web-vitals-reports', id: anchor.id, overrideAccess: true, context: { syncWebVitals: true }, data: { quotaWindowStartedAt: new Date(Date.now() - 61000).toISOString() } })
    expect(await cleanupWebVitals(payload, 1000)).toBe(1)
  })

  it('rejects revoked sessions and removes private report rows during normal user deletion', async () => {
    const previouslyAuthenticated = (await payload.auth({ headers: new Headers({ Authorization: `JWT ${otherToken}` }) })).user
    if (!previouslyAuthenticated) throw new Error('Actual SID authentication failed')
    await rest('POST', '/users/logout', { token: otherToken })
    expect((await POST(request('revoked', 'LCP', 1, otherToken, { expectedUserId: other.id }))).status).toBe(401)
    await expect(recordWebVitals(payload, previouslyAuthenticated, { expectedUserId: other.id, metric: { name: 'LCP', value: 1000, id: 'auth-before-logout' } })).rejects.toMatchObject({ status: 401 })
    await payload.delete({ collection: 'users', id: student.id })
    expect((await payload.count({ collection: 'web-vitals-reports', where: { user: { equals: student.id } } })).totalDocs).toBe(0)
  })
})
