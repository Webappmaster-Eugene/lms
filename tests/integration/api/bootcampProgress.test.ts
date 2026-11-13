import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { POST as gitlabEvents } from '@/app/api/bootcamp/gitlab-events/route'
import { GET as progressGET } from '@/app/api/manage/bootcamp-progress/route'
import type { BootcampProgressReport } from '@/lib/bootcamp-progress'
import { relationId } from '@/lib/relation-id'
import { adminTelegramTransport } from '@/server/admin-telegram'
import { sendBootcampLaggingDigest, submissionReviewAlerts } from '@/server/bootcamp-progress'
import type { BootcampEnrollment } from '@/payload-types'
import { createAdmin, createStudent, getTestPayload, login, uid, type TestUser } from '../helpers/payload'

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const DAY = 86_400_000
const TELEGRAM = { TELEGRAM_BOT_TOKEN: `123456:${'a'.repeat(32)}`, TELEGRAM_ADMIN_CHAT_ID: '42', TELEGRAM_PROXY_URL: undefined }
const saved = Object.fromEntries(Object.keys(TELEGRAM).map((key) => [key, process.env[key]]))
const webhookToken = () => createHmac('sha256', process.env.PAYLOAD_SECRET ?? '').update('lms-gitlab-webhook-v1').digest('hex')
const gitlabDate = (ms: number) => new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')

let payload: Payload
let db: Db
let admin: TestUser
let adminToken: string
let learner: TestUser
let group: string
let streamId: number
let enrollment: BootcampEnrollment
let testEnrollment: BootcampEnrollment
const telegram: string[] = []

const hook = (event: string, body: unknown) => gitlabEvents(new Request('http://lms.test/api/bootcamp/gitlab-events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gitlab-Event': event, 'X-Gitlab-Token': webhookToken() }, body: JSON.stringify(body) }))
const progress = async (query = '') => {
  const response = await progressGET(new Request(`http://lms.test/api/manage/bootcamp-progress?stream=${streamId}${query}`, { headers: { Authorization: `JWT ${adminToken}` } }))
  expect(response.status).toBe(200)
  return response.json() as Promise<BootcampProgressReport>
}
const rows = async () => (await payload.find({ collection: 'bootcamp-week-submissions', where: { enrollment: { equals: enrollment.id } }, sort: 'mrIid', depth: 0 })).docs
const verdictNote = (week: number, headline: string) => `<!-- grader:${String(week).padStart(2, '0')}:5d144495245925e03934d5445e6f059c9b19c79d -->\n**Доверенная проверка: неделя ${week} - ${headline}**\n\nКоммит \`5d1444952459\`, попытка 1. Прошло проверок: 26 из 26.`
function nextMonday(): Date {
  const moscow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const daysAhead = ((8 - moscow.getUTCDay()) % 7) || 7
  return new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() + daysAhead, 9, 0, 0))
}

async function enroll(username: string, user: TestUser | null, isTest = false): Promise<BootcampEnrollment> {
  const lead = await payload.create({ collection: 'bootcamp-leads', overrideAccess: true, data: { email: `${uid('cand')}@mail.test`.toLowerCase(), name: 'Иван Петров', program: 'nodejs', status: 'enrolled', paidAt: new Date().toISOString(), consentVersion: '2026-10-26', consentAt: new Date().toISOString(), submissionCount: 1, entryTaskToken: uid('entry-token'), isTest } })
  return payload.create({ collection: 'bootcamp-enrollments', overrideAccess: true, data: { lead: lead.id, email: lead.email, firstName: isTest ? 'Тестовый' : 'Иван', lastName: isTest ? 'Сдающий' : 'Петров', gitlabUsername: username, streamGroup: group, status: 'done', program: 'nodejs', gitlabProjectId: 800_000 + Math.floor(Math.random() * 100_000), ...(user ? { lmsUser: user.id } : {}) } })
}
const project = (item: BootcampEnrollment) => ({ id: item.gitlabProjectId, path_with_namespace: `${group}/${item.gitlabUsername}`, web_url: `https://git.test/${group}/${item.gitlabUsername}` })

beforeAll(async () => {
  payload = await getTestPayload()
  db = (payload.db as unknown as { drizzle: Db }).drizzle
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  learner = await createStudent(payload)
  group = uid('stream').toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const now = Date.now()
  const stream = await payload.create({ collection: 'bootcamp-streams', data: { title: `Поток ${group}`, program: 'nodejs', gitlabGroup: group, startsAt: new Date(now - 20 * DAY).toISOString(), weeks: [{ week: 1, dueAt: new Date(now - 10 * DAY).toISOString() }, { week: 2, dueAt: new Date(now - 2 * DAY).toISOString() }, { week: 3, dueAt: new Date(now + 5 * DAY).toISOString() }] }, overrideAccess: true })
  streamId = stream.id
  enrollment = await enroll(uid('gl').toLowerCase().replace(/[^a-z0-9-]/g, '-'), learner)
  testEnrollment = await enroll(uid('gt').toLowerCase().replace(/[^a-z0-9-]/g, '-'), null, true)
  for (const [key, value] of Object.entries(TELEGRAM)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.spyOn(adminTelegramTransport, 'send').mockImplementation(async (_cfg, _chat, text) => { telegram.push(text) })
})

beforeEach(() => {
  telegram.length = 0
  // Предел сообщений в минуту общий на процесс: каждый вебхук тоже шлёт сообщение.
  ;(globalThis as unknown as Record<symbol, number[]>)[Symbol.for('lms.adminTelegram.sent')] = []
})

afterAll(async () => {
  vi.restoreAllMocks()
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await db.execute(sql`delete from admin_digests where kind = 'bootcamp-lagging' and period like ${`%:${streamId}`}`)
  await payload.delete({ collection: 'bootcamp-enrollments', where: { streamGroup: { equals: group } }, overrideAccess: true })
  for (const item of [enrollment, testEnrollment]) await payload.delete({ collection: 'bootcamp-leads', id: relationId(item.lead), overrideAccess: true })
  await payload.delete({ collection: 'bootcamp-streams', id: streamId, overrideAccess: true })
  for (const user of [learner, admin]) if (user) await payload.delete({ collection: 'users', id: user.id })
})

describe('сдачи недель из вебхука GitLab', () => {
  it('MR недели 1 проходит путь до слияния, ветка материалов сдачей не считается', async () => {
    const now = Date.now()
    const mr = { iid: 1, title: 'Неделя 1', url: `${project(enrollment).web_url}/-/merge_requests/1`, source_branch: 'week-01' }
    await hook('Merge Request Hook', { project: project(enrollment), user: { username: enrollment.gitlabUsername }, object_attributes: { ...mr, action: 'open', target_branch: 'main', created_at: gitlabDate(now - 12 * DAY), updated_at: gitlabDate(now - 12 * DAY) } })
    await hook('Pipeline Hook', { project: project(enrollment), object_attributes: { id: 5, status: 'failed', ref: 'week-01', finished_at: gitlabDate(now - 11.5 * DAY) }, merge_request: mr })
    expect((await rows())[0]).toMatchObject({ week: 1, mrIid: 1, pipelineStatus: 'failed', branch: 'week-01' })
    await hook('Merge Request Hook', { project: project(enrollment), user: { username: enrollment.gitlabUsername }, object_attributes: { ...mr, action: 'update', oldrev: 'abc', updated_at: gitlabDate(now - 11 * DAY) } })
    await hook('Note Hook', { project: project(enrollment), user: { username: 'group_5_bot_abc', name: 'grader-bot' }, merge_request: mr, object_attributes: { noteable_type: 'MergeRequest', note: verdictNote(1, 'пройдена'), url: `${mr.url}#note_1`, created_at: gitlabDate(now - 10.5 * DAY), updated_at: gitlabDate(now - 10.5 * DAY) } })
    // Опоздавшее событие CI старее записанного и ничего не меняет.
    await hook('Pipeline Hook', { project: project(enrollment), object_attributes: { id: 4, status: 'success', ref: 'week-01', finished_at: gitlabDate(now - 12 * DAY) }, merge_request: mr })
    await hook('Merge Request Hook', { project: project(enrollment), user: { username: 'root' }, object_attributes: { ...mr, action: 'merge', updated_at: gitlabDate(now - 10.4 * DAY) } })
    await hook('Merge Request Hook', { project: project(enrollment), user: { username: enrollment.gitlabUsername }, object_attributes: { iid: 2, title: 'Материалы недели 2', url: `${project(enrollment).web_url}/-/merge_requests/2`, source_branch: 'materials-week-02', action: 'open', target_branch: 'main' } })
    const [row, ...rest] = await rows()
    expect(rest).toHaveLength(0)
    expect(row).toMatchObject({ verdict: 'passed', checksPassed: 26, checksTotal: 26, attempt: 1, pipelineStatus: 'failed' })
    expect(row.mergedAt).not.toBeNull()
  })

  it('сдача недели 2 ждёт ревью дольше 3 дней: одно напоминание наставнику', async () => {
    const now = Date.now()
    const mr = { iid: 3, title: 'Неделя 2', url: `${project(enrollment).web_url}/-/merge_requests/3`, source_branch: 'week-02' }
    await hook('Merge Request Hook', { project: project(enrollment), user: { username: enrollment.gitlabUsername }, object_attributes: { ...mr, action: 'open', target_branch: 'main', created_at: gitlabDate(now - 5 * DAY) } })
    const verdict = { project: project(enrollment), user: { username: 'group_5_bot_abc', name: 'grader-bot' }, merge_request: mr, object_attributes: { noteable_type: 'MergeRequest', note: verdictNote(2, 'пройдена'), created_at: gitlabDate(now - 4 * DAY), updated_at: gitlabDate(now - 4 * DAY) } }
    await hook('Note Hook', verdict)
    expect(await submissionReviewAlerts(payload)).toBeGreaterThanOrEqual(1)
    expect(await submissionReviewAlerts(payload)).toBe(0)
    await vi.waitFor(() => expect(telegram.find((text) => text.startsWith('Сдача ждёт ревью больше 3 дней: Иван Петров'))).toContain('Неделя 2'))
    // GitLab повторил доставку того же вердикта: второго напоминания нет.
    await hook('Note Hook', verdict)
    expect(await submissionReviewAlerts(payload)).toBe(0)
  })

  it('старое закрытие после переоткрытия MR не закрывает, в каком бы порядке ни пришло', async () => {
    const now = Date.now()
    const mr = { iid: 5, title: 'Неделя 5', url: `${project(enrollment).web_url}/-/merge_requests/5`, source_branch: 'week-05' }
    const event = (action: string, days: number) => hook('Merge Request Hook', { project: project(enrollment), user: { username: enrollment.gitlabUsername }, object_attributes: { ...mr, action, target_branch: 'main', created_at: gitlabDate(now - 3 * DAY), updated_at: gitlabDate(now - days * DAY) } })
    const row = async () => (await rows()).find((item) => item.mrIid === 5)
    // Переоткрытие пришло раньше закрытия, которое было до него.
    await event('open', 3)
    await event('reopen', 1)
    await event('close', 2)
    expect((await row())?.closedAt).toBeNull()
    // Закрыт снова, переоткрыт, и GitLab повторил старое закрытие.
    await event('close', 0.5)
    expect((await row())?.closedAt).not.toBeNull()
    await event('reopen', 0.4)
    await event('close', 0.5)
    expect((await row())?.closedAt).toBeNull()
    await event('close', 0.1)
    expect((await row())?.closedAt).not.toBeNull()
    await event('reopen', 0.05)
  })
})

describe('экран «Учёба буткемпа»', () => {
  it('матрица недель, отставание от сроков потока и тестовые скрыты', async () => {
    const report = await progress()
    expect(report.stream).toMatchObject({ id: streamId, gitlabGroup: group })
    expect(report.students).toHaveLength(1)
    const [student] = report.students
    expect(student).toMatchObject({ enrollmentId: enrollment.id, userId: learner.id, planned: 2, accepted: 1, lag: 1 })
    expect(student.weeks[0]).toMatchObject({ week: 1, state: 'accepted', late: false })
    expect(student.weeks[1]).toMatchObject({ week: 2, state: 'review', overdue: true, late: true })
    expect(student.weeks[2]).toMatchObject({ week: 3, state: 'none', late: false })
    expect(student.weeks[3]).toMatchObject({ week: 4, state: 'none', dueAt: null })
    expect(student.weeks[4]).toMatchObject({ week: 5, state: 'open', dueAt: null })
    expect(report.summary).toMatchObject({ students: 1, onPlan: 0, lagOne: 1, lagMore: 0, waitingReview: 1, overdueReview: 1 })
    expect(report.summary.medianReviewHours).not.toBeNull()
    expect((await progress('&test=1')).students.map((item) => item.enrollmentId)).toEqual(expect.arrayContaining([enrollment.id, testEnrollment.id]))
  })

  it('понедельничная сводка об отстающих уходит один раз', async () => {
    const monday = nextMonday()
    expect(await sendBootcampLaggingDigest(payload, monday)).toBeGreaterThanOrEqual(1)
    expect(await sendBootcampLaggingDigest(payload, monday)).toBe(0)
    await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`Поток ${group}: отстают от плана 1 из 1`))).toContain('Иван Петров - не принято'))
  })

  it('ученику экран недоступен', async () => {
    const response = await progressGET(new Request('http://lms.test/api/manage/bootcamp-progress', { headers: { Authorization: `JWT ${await login(payload, learner)}` } }))
    expect(response.status).toBe(403)
  })

  it('удаление зачисления удаляет его сдачи', async () => {
    await payload.delete({ collection: 'bootcamp-enrollments', id: enrollment.id, overrideAccess: true })
    expect((await payload.count({ collection: 'bootcamp-week-submissions', where: { enrollment: { equals: enrollment.id } } })).totalDocs).toBe(0)
  })
})
