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
import { configureTestBootcampGrader } from '../helpers/bootcamp'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, uid, type TestUser } from '../helpers/payload'

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
let frontendEnrollment: BootcampEnrollment
const telegram: string[] = []
const botId = 4813
const head = '5d144495245925e03934d5445e6f059c9b19c79d'
const restoreGraders: (() => Promise<unknown>)[] = []

const hook = (event: string, body: unknown) => gitlabEvents(new Request('http://lms.test/api/bootcamp/gitlab-events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gitlab-Event': event, 'X-Gitlab-Token': webhookToken() }, body: JSON.stringify(body) }))
const progress = async (query = '') => {
  const response = await progressGET(new Request(`http://lms.test/api/manage/bootcamp-progress?stream=${streamId}${query}`, { headers: { Authorization: `JWT ${adminToken}` } }))
  expect(response.status).toBe(200)
  return response.json() as Promise<BootcampProgressReport>
}
const rows = async () => (await payload.find({ collection: 'bootcamp-week-submissions', where: { enrollment: { equals: enrollment.id } }, sort: 'mrIid', depth: 0 })).docs
const verdictNote = (week: number, headline: string) => `<!-- grader:${String(week).padStart(2, '0')}:5d144495245925e03934d5445e6f059c9b19c79d -->\n**Доверенная проверка: неделя ${week} - ${headline}**\n\nКоммит \`5d1444952459\`, попытка 1. Прошло проверок: 26 из 26.`
function mrFor(item: BootcampEnrollment, iid: number, week: number) {
  return { iid, title: 'Этап ' + week, url: project(item).web_url + '/-/merge_requests/' + iid,
    source_branch: 'week-' + String(week).padStart(2, '0'), target_branch: 'main', state: 'opened',
    author_id: item.gitlabUserId, source_project_id: item.gitlabProjectId, target_project_id: item.gitlabProjectId, last_commit: { id: head } }
}

function nextMonday(): Date {
  const moscow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const daysAhead = ((8 - moscow.getUTCDay()) % 7) || 7
  return new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() + daysAhead, 9, 0, 0))
}

async function enroll(username: string, user: TestUser | null, isTest = false, program = 'nodejs'): Promise<BootcampEnrollment> {
  const lead = await payload.create({ collection: 'bootcamp-leads', overrideAccess: true, data: { email: `${uid('cand')}@mail.test`.toLowerCase(), name: 'Иван Петров', program, status: 'enrolled', paidAt: new Date().toISOString(), consentVersion: '2026-10-26', consentAt: new Date().toISOString(), submissionCount: 1, entryTaskToken: uid('entry-token'), isTest } })
  return payload.create({ collection: 'bootcamp-enrollments', overrideAccess: true, data: { lead: lead.id, email: lead.email, firstName: isTest ? 'Тестовый' : 'Иван', lastName: isTest ? 'Сдающий' : 'Петров', gitlabUsername: username, streamGroup: group, status: 'done', program, gitlabProjectUrl: 'https://git.test/' + group + '/' + username, gitlabUserId: 400_000 + lead.id, gitlabProjectId: 800_000 + Math.floor(Math.random() * 100_000), ...(user ? { lmsUser: user.id } : {}) } })
}
const project = (item: BootcampEnrollment) => ({ id: item.gitlabProjectId, path_with_namespace: `${group}/${item.gitlabUsername}`, web_url: `https://git.test/${group}/${item.gitlabUsername}` })

beforeAll(async () => {
  payload = await getTestPayload()
  for (const key of ['nodejs', 'react-next']) restoreGraders.push(await configureTestBootcampGrader(payload, key, botId))
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
  await payload.update({ collection: 'bootcamp-enrollments', id: testEnrollment.id, data: { program: null }, overrideAccess: true })
  frontendEnrollment = await enroll(uid('front').toLowerCase().replace(/[^a-z0-9-]/g, '-'), null, false, 'react-next')
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
  for (const item of [enrollment, testEnrollment, frontendEnrollment]) await payload.delete({ collection: 'bootcamp-leads', id: relationId(item.lead), overrideAccess: true })
  await payload.delete({ collection: 'bootcamp-streams', id: streamId, overrideAccess: true })
  for (const restore of restoreGraders) await restore()
  for (const user of [learner, admin]) if (user) await payload.delete({ collection: 'users', id: user.id })
})

describe('сдачи недель из вебхука GitLab', () => {
  it('ждет подтвержденный проект, правильную ветку, автора и вердикт по текущему коммиту', async () => {
    const mr = mrFor(testEnrollment, 44, 4)
    const projectData = project(testEnrollment)
    const when = '2027-02-17T10:00:00Z'
    const newer = 'b'.repeat(40)
    const event = (attrs: Record<string, unknown>, actor = testEnrollment.gitlabUserId) => hook('Merge Request Hook', {
      project: projectData, user: { id: actor }, object_attributes: { ...mr, action: 'open', updated_at: when, ...attrs },
    })
    const grade = (id: number, sha: string) => hook('Note Hook', { project: projectData, user: { id, name: 'grader-bot' },
      merge_request: { iid: mr.iid }, object_attributes: { noteable_type: 'MergeRequest',
        note: verdictNote(4, 'пройдена').replace(head, sha), updated_at: '2027-02-17T10:04:00Z' } })
    const row = async () => (await payload.find({ collection: 'bootcamp-week-submissions', where: {
      enrollment: { equals: testEnrollment.id }, mrIid: { equals: mr.iid },
    } })).docs[0]
    expect(await (await event({ target_branch: 'dev' })).json()).toEqual({ result: 'ignored' })
    expect(await (await event({ source_project_id: 41 })).json()).toEqual({ result: 'ignored' })
    expect(await (await event({ author_id: 42 })).json()).toEqual({ result: 'ignored' })
    expect(await row()).toBeUndefined()
    await event({})
    await grade(botId + 1, head)
    expect((await row()).verdict).toBeFalsy()
    await grade(botId, head)
    expect((await row()).verdictSha).toBe(head)
    await event({ action: 'update', oldrev: head, last_commit: { id: newer } })
    await grade(botId, head)
    expect(await row()).toMatchObject({ headSha: newer, verdict: null })
    await grade(botId, newer)
    expect((await row()).verdictSha).toBe(newer)
    await event({ action: 'merge', state: 'merged', target_branch: 'dev', last_commit: { id: newer } }, 2)
    expect(await row()).toMatchObject({ mergedHeadSha: null, verdict: null, closedAt: expect.any(String) })
  })

  it('MR недели 1 проходит путь до слияния, ветка материалов сдачей не считается', async () => {
    const now = Date.now()
    const mr = mrFor(enrollment, 1, 1)
    const firstSha = 'a'.repeat(40)
    const first = { ...mr, last_commit: { id: firstSha } }
    await hook('Merge Request Hook', { project: project(enrollment), user: { id: enrollment.gitlabUserId, username: enrollment.gitlabUsername }, object_attributes: { ...first, action: 'open', target_branch: 'main', created_at: gitlabDate(now - 12 * DAY), updated_at: gitlabDate(now - 12 * DAY) } })
    await hook('Pipeline Hook', { project: project(enrollment), object_attributes: { id: 5, status: 'failed', sha: firstSha, ref: 'week-01', finished_at: gitlabDate(now - 11.5 * DAY) }, merge_request: first })
    expect((await rows())[0]).toMatchObject({ week: 1, mrIid: 1, pipelineStatus: 'failed', branch: 'week-01' })
    await hook('Merge Request Hook', { project: project(enrollment), user: { id: enrollment.gitlabUserId, username: enrollment.gitlabUsername }, object_attributes: { ...mr, action: 'update', oldrev: firstSha, updated_at: gitlabDate(now - 11 * DAY) } })
    await hook('Note Hook', { project: project(enrollment), user: { id: botId, username: 'group_5_bot_abc', name: 'grader-bot' }, merge_request: mr, object_attributes: { noteable_type: 'MergeRequest', note: verdictNote(1, 'пройдена'), url: `${mr.url}#note_1`, created_at: gitlabDate(now - 10.5 * DAY), updated_at: gitlabDate(now - 10.5 * DAY) } })
    // Опоздавшее событие CI старее записанного и ничего не меняет.
    await hook('Pipeline Hook', { project: project(enrollment), object_attributes: { id: 4, status: 'success', sha: firstSha, ref: 'week-01', finished_at: gitlabDate(now - 12 * DAY) }, merge_request: mr })
    await hook('Merge Request Hook', { project: project(enrollment), user: { id: 2, username: 'root' }, object_attributes: { ...mr, action: 'merge', state: 'merged', updated_at: gitlabDate(now - 10.4 * DAY) } })
    await hook('Merge Request Hook', { project: project(enrollment), user: { id: enrollment.gitlabUserId, username: enrollment.gitlabUsername }, object_attributes: { iid: 2, title: 'Материалы недели 2', url: `${project(enrollment).web_url}/-/merge_requests/2`, source_branch: 'materials-week-02', action: 'open', target_branch: 'main' } })
    const [row, ...rest] = await rows()
    expect(rest).toHaveLength(0)
    expect(row).toMatchObject({ verdict: 'passed', checksPassed: 26, checksTotal: 26, attempt: 1, pipelineStatus: null, headSha: head, verdictSha: head, mergedHeadSha: head })
    expect(row.mergedAt).not.toBeNull()
  })

  it('сдача недели 2 ждёт ревью дольше 3 дней: одно напоминание наставнику', async () => {
    const now = Date.now()
    const mr = mrFor(enrollment, 3, 2)
    await hook('Merge Request Hook', { project: project(enrollment), user: { id: enrollment.gitlabUserId, username: enrollment.gitlabUsername }, object_attributes: { ...mr, action: 'open', target_branch: 'main', created_at: gitlabDate(now - 5 * DAY) } })
    const verdict = { project: project(enrollment), user: { id: botId, username: 'group_5_bot_abc', name: 'grader-bot' }, merge_request: mr, object_attributes: { noteable_type: 'MergeRequest', note: verdictNote(2, 'пройдена'), created_at: gitlabDate(now - 4 * DAY), updated_at: gitlabDate(now - 4 * DAY) } }
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
    const mr = mrFor(enrollment, 5, 5)
    const event = (action: string, days: number) => hook('Merge Request Hook', { project: project(enrollment), user: { id: enrollment.gitlabUserId, username: enrollment.gitlabUsername }, object_attributes: { ...mr, action, state: action === 'close' ? 'closed' : 'opened', target_branch: 'main', created_at: gitlabDate(now - 3 * DAY), updated_at: gitlabDate(now - days * DAY) } })
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
  it('показывает очередь оплаченных заявок своего потока, даже если зачисление еще не создано', async () => {
    const lead = await payload.create({ collection: 'bootcamp-leads', overrideAccess: true, data: {
      email: `${uid('waiting')}@mail.test`, name: 'Ожидает доступа', program: 'nodejs', status: 'paid',
      paidAt: new Date().toISOString(), consentVersion: '2026-10-26', consentAt: new Date().toISOString(),
      submissionCount: 1, entryTaskToken: uid('payment'), admission: { enrollment: { group } },
    } })
    try {
      expect((await progress()).failedEnrollments).toContainEqual({ leadId: lead.id, title: lead.name })
      await payload.update({ collection: 'bootcamp-leads', id: lead.id, overrideAccess: true,
        data: { admission: { enrollment: { group: uid('other-stream') } } } })
      expect((await progress()).failedEnrollments.some(row => row.leadId === lead.id)).toBe(false)
    } finally { await payload.delete({ collection: 'bootcamp-leads', id: lead.id }) }
  })

  it('показывает прогресс по курсу, который закреплен за покупкой ученика', async () => {
    const purchased = await createCourseTree(payload, { lessons: 2 })
    const newer = await createCourseTree(payload, { lessons: 1 })
    const [program] = (await payload.find({ collection: 'bootcamp-programs', where: { key: { equals: 'nodejs' } }, depth: 0 })).docs
    await payload.update({ collection: 'bootcamp-enrollments', id: enrollment.id, data: { manualsCourse: purchased.course.id } })
    try {
      await payload.update({ collection: 'bootcamp-programs', id: program.id, data: { manualsCourse: newer.course.id } })
      await payload.create({ collection: 'user-progress', context: { skipHooks: true },
        data: { user: learner.id, lesson: purchased.lessons[0].id, isCompleted: true } })
      const student = (await progress()).students.find(row => row.enrollmentId === enrollment.id)
      expect(student?.manuals).toEqual({ done: 1, total: 2 })
    } finally {
      await payload.update({ collection: 'bootcamp-programs', id: program.id, data: { manualsCourse: program.manualsCourse } })
      await payload.update({ collection: 'bootcamp-enrollments', id: enrollment.id, data: { manualsCourse: null } })
    }
  })
  it('создаёт 20 сроков React-сдач внутри 12 недель и сохраняет ручные сроки', async () => {
    const start = '2027-01-04T17:00:00.000Z'
    const stream = await payload.create({ collection: 'bootcamp-streams', overrideAccess: true, data: {
      title: 'React 12 недель', program: 'react-next', gitlabGroup: uid('react-calendar'), startsAt: start,
    } })
    try {
      const deadlines = stream.weeks ?? []
      expect(deadlines).toHaveLength(20)
      expect(new Set(deadlines.map(row => row.dueAt)).size).toBe(12)
      expect(deadlines.at(-1)?.dueAt).toBe('2027-03-28T21:00:00.000Z')
      const changed = await payload.update({ collection: 'bootcamp-streams', id: stream.id, overrideAccess: true,
        data: { weeks: [{ week: 20, dueAt: '2027-03-30T17:00:00.000Z' }] } })
      expect(changed.weeks?.map(row => row.dueAt)).toEqual(['2027-03-30T17:00:00.000Z'])
    } finally { await payload.delete({ collection: 'bootcamp-streams', id: stream.id, overrideAccess: true }) }
  })

  it('одна группа не смешивает программы, старые Node-зачисления без ключа остаются видимыми', async () => {
    const report = await progress('&test=1')
    expect(report.students.map(student => student.enrollmentId)).toContain(testEnrollment.id)
    expect(report.students.map(student => student.enrollmentId)).not.toContain(frontendEnrollment.id)
  })

  it('React-ревью не просрочено на четвёртый день и напоминает только после пятого', async () => {
    const now = Date.now()
    const mr = mrFor(frontendEnrollment, 1, 1)
    await hook('Merge Request Hook', { project: project(frontendEnrollment), user: { id: frontendEnrollment.gitlabUserId, username: frontendEnrollment.gitlabUsername }, object_attributes: { ...mr, action: 'open', target_branch: 'main', created_at: gitlabDate(now - 7 * DAY) } })
    await hook('Note Hook', { project: project(frontendEnrollment), user: { id: botId, username: 'group_5_bot_abc', name: 'grader-bot' }, merge_request: mr, object_attributes: { noteable_type: 'MergeRequest', note: verdictNote(1, 'пройдена'), created_at: gitlabDate(now - 4 * DAY), updated_at: gitlabDate(now - 4 * DAY) } })
    const saved = (await payload.find({ collection: 'bootcamp-week-submissions', where: { enrollment: { equals: frontendEnrollment.id } }, depth: 0 })).docs[0]
    if (!saved) throw new Error('Нет сдачи frontend')
    await submissionReviewAlerts(payload)
    expect((await payload.findByID({ collection: 'bootcamp-week-submissions', id: saved.id })).reviewAlertAt).toBeNull()
    await payload.update({ collection: 'bootcamp-week-submissions', id: saved.id, data: { verdictAt: new Date(now - 6 * DAY).toISOString(), lastCommitAt: new Date(now - 7 * DAY).toISOString() }, overrideAccess: true, context: { syncBootcampSubmissions: true } })
    expect(await submissionReviewAlerts(payload)).toBeGreaterThanOrEqual(1)
    await vi.waitFor(() => expect(telegram.some(text => text.startsWith('Сдача ждёт ревью больше 5 дней: Иван Петров'))).toBe(true))
    expect((await payload.findByID({ collection: 'bootcamp-week-submissions', id: saved.id })).reviewAlertAt).not.toBeNull()
  })

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
