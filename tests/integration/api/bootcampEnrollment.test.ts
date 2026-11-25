import { createHmac } from 'node:crypto'
import { createLocalReq, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { POST as gitlabEvents } from '@/app/api/bootcamp/gitlab-events/route'
import { POST as leadForm } from '@/app/api/bootcamp/leads/route'
import { LEAD_ANSWERS, leadFormData } from '../../fixtures/bootcampLead'
import { POST as supportMessage } from '@/app/api/support-message/route'
import { POST as retryRoute } from '@/app/api/bootcamp/enrollments/[id]/retry/route'
import { POST as defenseRoute } from '@/app/api/bootcamp/enrollments/[id]/defense/route'
import { POST as confirmCourseRoute } from '@/app/api/bootcamp/enrollments/[id]/course/route'
import { claimEnrollment } from '@/server/bootcamp-enrollment'
import { confirmEnrollmentIdentity } from '@/server/enrollment-identity'
import { getBuyerEnrollment } from '@/server/bootcamp-buyer'
import { GET as enrollmentState, POST as enrollRoute } from '@/app/api/bootcamp/leads/[id]/enrollment/route'
import { POST as claimRoute } from '@/app/api/internal/bootcamp-enrollments/claim/route'
import { POST as reportRoute } from '@/app/api/internal/bootcamp-enrollments/[id]/report/route'
import { POST as signedInRoute } from '@/app/api/internal/bootcamp-enrollments/[id]/signed-in/route'
import { adminTelegramTransport } from '@/server/admin-telegram'
import type { BootcampLead } from '@/payload-types'
import { captureEmails, createAdmin, createCourseTree, createStudent, getTestPayload, login, uid, type TestUser } from '../helpers/payload'
import { configureTestBootcampGrader, createProgram, ensureNodejsProgramCourse } from '../helpers/bootcamp'

let payload: Payload
let admin: TestUser
let adminToken: string
let studentToken: string
let courseId: number
const telegram: string[] = []
const savedEnv = { token: process.env.TELEGRAM_BOT_TOKEN, chat: process.env.TELEGRAM_ADMIN_CHAT_ID, proxy: process.env.TELEGRAM_PROXY_URL }

const hmac = (label: string) => createHmac('sha256', process.env.PAYLOAD_SECRET ?? '').update(label).digest('hex')
const workerKey = () => hmac('lms-bootcamp-enroll-worker-v1')
const webhookToken = () => hmac('lms-gitlab-webhook-v1')

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  studentToken = await login(payload, await createStudent(payload))
  courseId = await ensureNodejsProgramCourse(payload)
  process.env.TELEGRAM_BOT_TOKEN = `123456:${'a'.repeat(32)}`
  process.env.TELEGRAM_ADMIN_CHAT_ID = '42'
  delete process.env.TELEGRAM_PROXY_URL
  vi.spyOn(adminTelegramTransport, 'send').mockImplementation(async (_cfg, _chat, text) => { telegram.push(text) })
})

afterAll(() => {
  vi.restoreAllMocks()
  for (const [key, value] of [['TELEGRAM_BOT_TOKEN', savedEnv.token], ['TELEGRAM_ADMIN_CHAT_ID', savedEnv.chat], ['TELEGRAM_PROXY_URL', savedEnv.proxy]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

beforeEach(() => {
  telegram.length = 0
  // Предел 40 сообщений в минуту общий на процесс: тесты шлют больше, а проверяют каждое.
  ;(globalThis as unknown as Record<symbol, number[]>)[Symbol.for('lms.adminTelegram.sent')] = []
})

/** Зачисляют только оплаченную заявку: по умолчанию она уже оплачена. */
async function newLead(extra: Partial<Pick<BootcampLead, 'email' | 'status' | 'paidAt' | 'program'>> = {}): Promise<BootcampLead> {
  return payload.create({
    collection: 'bootcamp-leads',
    data: { email: `${uid('cand')}@mail.test`.toLowerCase(), name: 'Иван Петров', program: 'nodejs', status: 'paid', paidAt: new Date().toISOString(), consentVersion: '2026-10-26', consentAt: new Date().toISOString(), submissionCount: 1, entryTaskToken: uid('entry-token'), ...extra },
    overrideAccess: true,
  })
}

type Ctx<T extends string> = { params: Promise<Record<T, string>> }
const asAdmin = (token = adminToken): Record<string, string> => ({ 'Content-Type': 'application/json', Authorization: `JWT ${token}` })

function call<T extends string>(route: (request: Request, ctx: Ctx<T>) => Promise<Response>, params: Record<T, string>, init: { method?: string, headers?: Record<string, string>, body?: unknown }) {
  return route(new Request('http://lms.test/api/x', { method: init.method ?? 'POST', headers: init.headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) }), { params: Promise.resolve(params) })
}

const enroll = (leadId: number, body: unknown, headers: Record<string, string> = asAdmin()) => call(enrollRoute, { id: String(leadId) }, { headers, body })
const claim = (key = workerKey()) => claimRoute(new Request('http://lms.test/api/internal/bootcamp-enrollments/claim', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-lms-worker-key': key }, body: '{}' }))
const report = (id: number, body: unknown) => call(reportRoute, { id: String(id) }, { headers: { 'Content-Type': 'application/json', 'x-lms-worker-key': workerKey() }, body })
const form = (username: string) => ({ firstName: 'Иван', lastName: 'Петров', username, group: 'nodejs-bootcamp', accessUntil: '' })

describe('защита и доступ участника массового потока', () => {
  it('сохраняет результат только наставнику, открывает выпускнику курс после срока и показывает его проект только владельцу', async () => {
    const course = (await createCourseTree(payload, { lessons: 1 })).course
    await payload.update({ collection: 'courses', id: course.id, data: { isBootcamp: true, assignedOnly: true }, overrideAccess: true })
    const program = await createProgram(payload, { manualsCourse: course.id })
    const owner = await createStudent(payload)
    const other = await createStudent(payload)
    await confirmEnrollmentIdentity(payload, admin, owner.id, owner.email)
    const lead = await newLead({ program: program.key, email: owner.email })
    const username = uid('defense').toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const future = new Date(Date.now() + 90 * 86400_000).toISOString().slice(0, 10)
    const enrolled = await enroll(lead.id, { ...form(username), group: program.gitlabStreamGroup, accessUntil: future })
    expect(enrolled.status).toBe(201)
    const { enrollment } = await enrolled.json() as { enrollment: { id: number } }
    const id = String(enrollment.id)
    const defend = (body: unknown, headers = asAdmin()) => call(defenseRoute, { id }, { headers, body })
    const change = { outcome: 'revise', url: 'https://review.test/first', revision: '' }
    expect((await defend(change)).status).toBe(409)
    await claimJob(enrollment.id)
    const project = `https://git.mentorcareer.ru/${program.gitlabStreamGroup}/${username}`
    expect((await report(enrollment.id, { status: 'done', steps: [], gitlabProjectId: 873551, gitlabProjectUrl: project })).status).toBe(200)
    expect((await defend(change, asAdmin(studentToken))).status).toBe(403)
    expect((await defend({ ...change, url: 'javascript:alert(1)' })).status).toBe(400)
    const revised = await defend(change)
    expect(revised.status).toBe(200)
    const { recordedAt } = await revised.json() as { recordedAt: string }
    const approve = { ...change, outcome: 'passed', url: 'https://review.test/final', revision: recordedAt }
    expect((await defend({ ...approve, revision: '' })).status).toBe(409)
    const twice = await Promise.all([defend(approve), defend(approve)])
    expect(twice.map(result => result.status)).toEqual([200, 200])
    const entries = await Promise.all(twice.map(result => result.json()))
    expect(entries[0]).toEqual(entries[1])
    const grant = (await payload.find({ collection: 'learning-access-grants', where: { ruleKey: { equals: `${owner.id}:courses:${course.id}` } }, limit: 1 })).docs[0]
    expect(grant?.effect).toBe('allow')
    expect(grant?.expiresAt).toBeNull()
    const own = () => createLocalReq({ user: owner }, payload)
    expect(await getBuyerEnrollment(payload, owner, await own(), { leadId: lead.id })).toMatchObject({
      courseHref: `/bootcamp/${course.slug}`, projectUrl: project, defense: { outcome: 'passed', url: approve.url },
    })
    expect(await getBuyerEnrollment(payload, other, await createLocalReq({ user: other }, payload), { leadId: lead.id })).toBeNull()
    await expect(payload.update({ collection: 'bootcamp-enrollments', id: enrollment.id, user: admin, overrideAccess: false, data: { defenseUrl: 'https://review.test/wrong' } })).rejects.toThrow()
    // Старая покупка без однозначного снимка требует подтверждения назначения именно этого ученика.
    await payload.update({ collection: 'bootcamp-enrollments', id: enrollment.id, overrideAccess: true, data: { manualsCourse: null } })
    expect((await getBuyerEnrollment(payload, owner, await own(), { leadId: lead.id }))?.courseHref).toBeNull()
    expect((await call(confirmCourseRoute, { id }, { headers: asAdmin(studentToken), body: { grantId: grant?.id } })).status).toBe(403)
    const wrongGrant = await payload.create({ collection: 'learning-access-grants', user: admin, overrideAccess: false, data: {
      user: other.id, target: { relationTo: 'courses', value: course.id }, effect: 'allow', ruleKey: `${other.id}:courses:${course.id}`,
    } })
    expect((await call(confirmCourseRoute, { id }, { headers: asAdmin(), body: { grantId: wrongGrant.id } })).status).toBe(409)
    expect((await call(confirmCourseRoute, { id }, { headers: asAdmin(), body: { grantId: grant?.id } })).status).toBe(200)
    await payload.update({ collection: 'bootcamp-enrollments', id: enrollment.id, overrideAccess: true, data: { revokeRequestedAt: new Date().toISOString() } })
    expect(await getBuyerEnrollment(payload, owner, await own(), { leadId: lead.id })).toBeNull()
    expect((await defend(approve)).status).toBe(409)
  })
})

describe('вторая покупка одного ученика', () => {
  async function purchases() {
    const owner = await createStudent(payload)
    await confirmEnrollmentIdentity(payload, admin, owner.id, owner.email)
    const secondProgram = await createProgram(payload, { manualsCourse: courseId })
    const [a, b] = await Promise.all([newLead({ email: owner.email }), newLead({ email: owner.email, program: secondProgram.key })])
    const username = uid('buyer').toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const [first, second] = await Promise.all([enroll(a.id, form(username)), enroll(b.id, { ...form(username), group: secondProgram.gitlabStreamGroup })])
    expect([first.status, second.status]).toEqual([201, 201])
    const entries = (await Promise.all([first.json(), second.json()])).map(body => body.enrollment as { id: number; streamGroup: string }).sort((x, y) => x.id - y.id)
    return { username, first: entries[0], second: entries[1] }
  }

  it('два потока получают разные проекты, повторная выдача ждет прежний подтвержденный ID и исполнителя v2', async () => {
    const { username, first, second } = await purchases()
    await claimJob(first.id)
    expect((await claimEnrollment(payload, true)).job?.id).not.toBe(second.id)
    const firstProject = `https://git.mentorcareer.ru/${first.streamGroup}/${username}`
    expect((await report(first.id, { status: 'done', steps: [], gitlabUserId: 975623, gitlabProjectId: 975624, gitlabProjectUrl: firstProject })).status).toBe(200)
    expect((await claimEnrollment(payload)).job?.id).not.toBe(second.id)
    expect((await claimEnrollment(payload, true)).job).toMatchObject({ id: second.id, gitlabUserId: 975623 })
    expect((await report(second.id, { status: 'running', steps: [], gitlabUserId: 99999 })).status).toBe(409)
    expect((await report(second.id, { status: 'running', steps: [], gitlabUserId: 975623, gitlabProjectId: 975624 })).status).toBe(409)
    const secondProject = `https://git.mentorcareer.ru/${second.streamGroup}/${username}`
    expect((await report(second.id, { status: 'done', steps: [], gitlabUserId: 975623, gitlabProjectId: 975625, gitlabProjectUrl: secondProject })).status).toBe(200)
    const foreign = await newLead()
    expect((await enroll(foreign.id, form(username))).status).toBe(409)
    await payload.update({ collection: 'bootcamp-enrollments', id: first.id, data: { revokeRequestedAt: new Date().toISOString() } })
    const { revoke } = await claimEnrollment(payload, true)
    expect(revoke.find(item => item.id === first.id)).toMatchObject({ gitlabUserId: 975623, gitlabProjectId: 975624, group: first.streamGroup })
    expect(revoke.some(item => item.id === second.id)).toBe(false)
  })

  it('после отмены первой покупки до выдачи один ожидающий проект можно выдать с нуля', async () => {
    const { first, second } = await purchases()
    const refunded = new Date().toISOString()
    await payload.update({ collection: 'bootcamp-enrollments', id: first.id, data: {  status: 'failed', revokeRequestedAt: refunded, revokedAt: refunded } })
    const { job } = await claimEnrollment(payload, true)
    expect(job?.id).toBe(second.id)
    expect(job?.gitlabUserId).toBeUndefined()
  })
})

/** Очередь общая для всего прогона: чужие задания (фикстуры, тесты оплаты) исполнитель разбирает по пути к нашему. */
async function claimJob(id: number) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const body = await (await claim()).json() as { job: { id: number } | null }
    if (!body.job || body.job.id === id) return body
  }
  throw new Error(`задание ${id} не взято`)
}

describe('зачисление из заявки', () => {
  it('кнопка заводит учётку LMS с приглашением и курсом, ставит GitLab в очередь и пишет в Telegram', async () => {
    const lead = await newLead()
    const mail = captureEmails(payload)
    try {
      const state = await (await call(enrollmentState, { id: String(lead.id) }, { method: 'GET', headers: asAdmin() })).json() as { enrollment: unknown, defaults: { firstName: string, lastName: string, username: string } }
      expect(state.enrollment).toBeNull()
      expect(state.defaults).toMatchObject({ firstName: 'Иван', lastName: 'Петров', username: lead.email.split('@')[0] })

      const username = uid('st').toLowerCase().replace(/[^a-z0-9-]/g, '-')
      const response = await enroll(lead.id, form(username))
      expect(response.status).toBe(201)
      const body = await response.json() as { enrollment: { id: number, status: string, steps: { key: string, state: string }[], lmsUserId: number } }
      expect(body.enrollment.status).toBe('queued')
      expect(body.enrollment.steps.filter((step) => step.state === 'done').map((step) => step.key)).toEqual(['lms_account', 'lms_course'])

      const user = await payload.findByID({ collection: 'users', id: body.enrollment.lmsUserId, depth: 0 })
      expect(user).toMatchObject({ email: lead.email, role: 'student', firstName: 'Иван', lastName: 'Петров' })
      const grants = await payload.find({ collection: 'learning-access-grants', where: { ruleKey: { equals: `${user.id}:courses:${courseId}` } }, depth: 0, overrideAccess: true })
      expect(grants.docs[0]).toMatchObject({ effect: 'allow' })
      await vi.waitFor(() => expect(mail.sent.find((message) => message.to === lead.email)).toBeTruthy())
      await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`Зачисление начато: ${lead.email}`))).toContain(username))

      expect((await enroll(lead.id, form(`${username}-2`))).status).toBe(409)
      const other = await newLead()
      expect((await enroll(other.id, form(username))).status).toBe(409)
    } finally {
      mail.restore()
    }
  })

  it('чужим и с чужой страницы зачислять нельзя, кривой логин отклоняется', async () => {
    const lead = await newLead()
    expect((await enroll(lead.id, form('ok-login'), { 'Content-Type': 'application/json' })).status).toBe(401)
    expect((await enroll(lead.id, form('ok-login'), asAdmin(studentToken))).status).toBe(403)
    // Payload не принимает cookie с чужого origin, а наша проверка отсекает чужую страницу и с действующей сессией.
    expect((await enroll(lead.id, form('ok-login'), { 'Content-Type': 'application/json', Cookie: `payload-token=${adminToken}`, Origin: 'https://evil.test', 'Sec-Fetch-Site': 'cross-site' })).status).toBe(401)
    expect((await enroll(lead.id, form('ok-login'), { ...asAdmin(), Origin: 'https://evil.test', 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
    expect((await enroll(lead.id, form('Bad Login'))).status).toBe(400)
    expect((await enroll(lead.id, { ...form('ok-login'), accessUntil: '2020-01-01' })).status).toBe(400)
    // Кнопка «Зачислить» вводит группу заново: опечатка отклоняется до создания учёток.
    const typo = await enroll(lead.id, { ...form('ok-login'), group: 'nodejs-botcamp' })
    expect(typo.status).toBe(409)
    expect((await typo.json() as { error: string }).error).toMatch(/Группы «nodejs-botcamp» нет/)
    const unpaid = await newLead({ status: 'admitted', paidAt: null })
    const refused = await enroll(unpaid.id, form('ok-login'))
    expect(refused.status).toBe(409)
    expect((await refused.json() as { error: string }).error).toContain('после оплаты')
    expect((await payload.find({ collection: 'bootcamp-enrollments', where: { lead: { equals: lead.id } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('исполнитель берёт задание по ключу, отчитывается по шагам, итог переводит заявку в «Зачислен»', async () => {
    expect((await claim('0'.repeat(64))).status).toBe(403)
    const lead = await newLead()
    const username = uid('wk').toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const { enrollment } = await (await enroll(lead.id, form(username))).json() as { enrollment: { id: number } }

    const claimed = await claimJob(enrollment.id) as { job: { id: number, username: string, group: string, courseProject: string }, webhook: { url: string, token: string } }
    expect(claimed.job).toMatchObject({ id: enrollment.id, username, group: 'nodejs-bootcamp', courseProject: 'bootcamp/course', gradingProject: 'bootcamp-staff/grading' })
    expect(claimed.webhook.url).toMatch(/\/api\/bootcamp\/gitlab-events$/)
    expect(claimed.webhook.token).toBe(webhookToken())

    const progress = await report(enrollment.id, { status: 'running', steps: [{ key: 'gitlab_user', state: 'done', detail: 'создана' }, { key: 'lms_account', state: 'failed' }], gitlabUserId: 77 })
    expect(progress.status).toBe(200)
    const running = await payload.findByID({ collection: 'bootcamp-enrollments', id: enrollment.id, depth: 0, overrideAccess: true })
    expect(running.gitlabUserId).toBe(77)
    // Отчёт исполнителя шаги LMS не трогает.
    expect((running.steps as { key: string, state: string }[]).find((step) => step.key === 'lms_account')?.state).toBe('done')

    const done = await report(enrollment.id, { status: 'done', steps: [{ key: 'gitlab_webhook', state: 'done' }], gitlabProjectId: 501, gitlabProjectUrl: `https://git.test/nodejs-bootcamp/${username}` })
    expect(done.status).toBe(200)
    expect((await payload.findByID({ collection: 'bootcamp-leads', id: lead.id, depth: 0, overrideAccess: true })).status).toBe('enrolled')
    await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`Зачислен: ${lead.email}`))).toContain(`https://git.test/nodejs-bootcamp/${username}`))
    // Своё сообщение о смене этапа зачисление не дублирует.
    expect(telegram.some((text) => text.startsWith('Этап заявки'))).toBe(false)
    expect((await report(enrollment.id, { status: 'running', steps: [] })).status).toBe(409)

    // Первый вход в GitLab видит исполнитель, в LMS - хук входа; оба сообщения по одному разу.
    expect((await call(signedInRoute, { id: String(enrollment.id) }, { headers: { 'Content-Type': 'application/json', 'x-lms-worker-key': workerKey() }, body: { at: '2026-10-31T10:00:00Z' } })).status).toBe(200)
    await call(signedInRoute, { id: String(enrollment.id) }, { headers: { 'Content-Type': 'application/json', 'x-lms-worker-key': workerKey() }, body: { at: '2026-10-31T11:00:00Z' } })
    await vi.waitFor(() => expect(telegram.filter((text) => text.startsWith(`Ученик впервые вошёл в GitLab: ${username}`))).toHaveLength(1))
    const after = await payload.findByID({ collection: 'bootcamp-enrollments', id: enrollment.id, depth: 0, overrideAccess: true })
    expect(after.gitlabSignedInAt).toBe('2026-10-31T10:00:00.000Z')
  })

  it('зачисление на другую программу: её курс в LMS, её репозиторий и проект проверки в задании', async () => {
    const tree = await createCourseTree(payload, { lessons: 1 })
    const program = await createProgram(payload, { manualsCourse: tree.course.id })
    const lead = await newLead({ program: program.key })
    const state = await (await call(enrollmentState, { id: String(lead.id) }, { method: 'GET', headers: asAdmin() })).json() as { defaults: { group: string } }
    expect(state.defaults.group).toBe(program.gitlabStreamGroup)
    const username = uid('py').toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const response = await enroll(lead.id, { ...form(username), group: program.gitlabStreamGroup })
    expect(response.status).toBe(201)
    const { enrollment } = await response.json() as { enrollment: { id: number } }
    const saved = await payload.findByID({ collection: 'bootcamp-enrollments', id: enrollment.id, depth: 0, overrideAccess: true })
    expect(saved).toMatchObject({ program: program.key, courseProject: program.gitlabCourseProject, gradingProject: program.gradingProject })
    const user = (await payload.find({ collection: 'users', where: { email: { equals: lead.email } }, depth: 0, overrideAccess: true })).docs[0]
    const grant = await payload.find({ collection: 'learning-access-grants', where: { ruleKey: { equals: `${user?.id}:courses:${tree.course.id}` } }, depth: 0, overrideAccess: true })
    expect(grant.docs[0]?.effect).toBe('allow')

    // Правка программы после зачисления задание не меняет: в нём снимок условий.
    await payload.update({ collection: 'bootcamp-programs', id: program.id, data: { gradingProject: 'other/grading' }, overrideAccess: true })
    const claimed = await claimJob(enrollment.id) as unknown as { job: { courseProject: string, gradingProject: string, group: string } }
    expect(claimed.job).toMatchObject({ courseProject: program.gitlabCourseProject, gradingProject: program.gradingProject, group: program.gitlabStreamGroup })
    expect((await report(enrollment.id, { status: 'failed', steps: [], error: 'проверка теста' })).status).toBe(200)
  })

  it('ошибка исполнителя видна в Telegram, «Повторить» возвращает задание в очередь', async () => {
    const lead = await newLead()
    const username = uid('fl').toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const { enrollment } = await (await enroll(lead.id, form(username))).json() as { enrollment: { id: number } }
    await claimJob(enrollment.id)
    await report(enrollment.id, { status: 'failed', steps: [{ key: 'gitlab_user', state: 'failed', detail: 'почта занята' }], error: 'Почта уже у учётки GitLab someone' })
    await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`Зачисление не удалось: ${lead.email}`))).toContain('Почта уже у учётки GitLab someone'))

    expect((await call(retryRoute, { id: String(enrollment.id) }, { headers: asAdmin(studentToken) })).status).toBe(403)
    const retried = await call(retryRoute, { id: String(enrollment.id) }, { headers: asAdmin() })
    expect(retried.status).toBe(200)
    expect(((await retried.json()) as { enrollment: { status: string, error: string | null } }).enrollment).toMatchObject({ status: 'queued', error: null })
    expect((await call(retryRoute, { id: String(enrollment.id) }, { headers: asAdmin() })).status).toBe(409)
  })

  it('уже существующая учётка LMS не получает второе приглашение', async () => {
    const student = await createStudent(payload)
    const lead = await newLead({ email: student.email })
    const purchase = form(uid('ex').toLowerCase().replace(/[^a-z0-9-]/g, '-'))
    expect((await enroll(lead.id, purchase)).status).toBe(409)
    expect((await payload.findByID({ collection: 'bootcamp-leads', id: lead.id })).paidAt).toBeTruthy()
    expect((await payload.count({ collection: 'bootcamp-enrollments', where: { lead: { equals: lead.id } } })).totalDocs).toBe(0)
    await confirmEnrollmentIdentity(payload, admin, student.id, student.email)
    const mail = captureEmails(payload)
    try {
      const { enrollment } = await (await enroll(lead.id, purchase)).json() as { enrollment: { lmsUserId: number, steps: { key: string, detail?: string }[] } }
      expect(enrollment.lmsUserId).toBe(student.id)
      expect(enrollment.steps.find((step) => step.key === 'lms_account')?.detail).toContain('уже была')
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(mail.sent.filter((message) => message.to === student.email)).toHaveLength(0)
    } finally {
      mail.restore()
    }
  })
})

describe('события буткемпа в Telegram', () => {
  it('новая заявка: кто, откуда, анкета и что задание ещё не ушло', async () => {
    const email = `${uid('tg-lead')}@mail.test`.toLowerCase()
    const mail = captureEmails(payload)
    try {
      const response = await leadForm(new Request('http://info.test/api/bootcamp/leads', {
        method: 'POST',
        headers: { 'X-Forwarded-Host': 'info.test', Origin: 'http://info.test', 'Sec-Fetch-Site': 'same-origin' },
        body: leadFormData({ ...LEAD_ANSWERS, program: 'nodejs', email, name: 'Мария', consent: true, consentVersion: '2026-10-26', utm: { utm_source: 'habr' }, links: 'github.com/maria' }),
      }))
      expect(response.status).toBe(200)
      await vi.waitFor(() => {
        const text = telegram.find((item) => item.startsWith('Новая заявка на буткемп Node.js'))
        expect(text).toContain(`Мария, ${email}`)
        expect(text).toContain('Откуда: habr')
        expect(text).toContain('Входное задание ещё не отправлено')
        expect(text).toContain('Telegram: @ivan_petrov')
        expect(text).toContain('Тема: Сменить работу или вырасти в грейде')
        expect(text).toContain('Срочность: 1-3 месяца')
        expect(text).toContain(`Проблема: ${LEAD_ANSWERS.problem}`)
        expect(text).toContain(`История: ${LEAD_ANSWERS.story}`)
        expect(text).toContain('Ссылки: https://github.com/maria')
        expect(text).toContain('Время заполнения: 20 с')
        expect(text).toMatch(/\/admin\/collections\/bootcamp-leads\/\d+$/)
      })
    } finally {
      mail.restore()
    }
  })

  it('обращение ученика и вопрос к уроку приходят наставнику', async () => {
    const student = await createStudent(payload, { firstName: 'Ольга', lastName: 'Смирнова' })
    const token = await login(payload, student)
    const sent = await supportMessage(new Request('http://lms.test/api/support-message', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` }, body: JSON.stringify({ subject: 'Не открывается урок', message: 'Пишет 404' }) }))
    expect(sent.status).toBe(200)
    await vi.waitFor(() => expect(telegram.find((text) => text.startsWith('Обращение ученика: Не открывается урок'))).toContain('Ольга Смирнова'))

    const tree = await createCourseTree(payload, { lessons: 1 })
    await payload.create({ collection: 'comments', data: { lesson: tree.lessons[0].id, content: 'Почему тест падает?' } as never, user: student, overrideAccess: false })
    await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`Вопрос к уроку «${tree.lessons[0].title}»`))).toContain('Почему тест падает?'))
  })

  // Этап меняют кнопки, у них свои сообщения; хук ловит системные переходы, у которых сообщения нет.
  it('смена этапа без своего сообщения уходит в Telegram с указанием, кто и куда перевёл', async () => {
    const lead = await newLead({ status: 'new' })
    await payload.update({ collection: 'bootcamp-leads', id: lead.id, data: { status: 'withdrawn' }, user: admin, overrideAccess: true })
    await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`Этап заявки на буткемп: ${lead.email}`))).toContain('Было: Новая, стало: Отозвана'))
  })

  it('первый вход зачисленного ученика в LMS приходит один раз', async () => {
    const student = await createStudent(payload)
    const lead = await newLead({ email: student.email })
    await confirmEnrollmentIdentity(payload, admin, student.id, student.email)
    await enroll(lead.id, form(uid('li').toLowerCase().replace(/[^a-z0-9-]/g, '-')))
    await login(payload, student)
    await login(payload, student)
    await vi.waitFor(() => expect(telegram.filter((text) => text.startsWith(`Ученик впервые вошёл в LMS: ${student.email}`))).toHaveLength(1))
  })

  it('вебхук GitLab: без токена 403, MR и вердикт проверки ученика уходят, комментарий наставника нет', async () => {
    const lead = await newLead()
    const username = uid('gh').toLowerCase().replace(/[^a-z0-9-]/g, '-')
    await enroll(lead.id, form(username))
    const project = { id: 900_000 + Math.floor(Math.random() * 1000), path_with_namespace: `nodejs-bootcamp/${username}`, web_url: `https://git.test/nodejs-bootcamp/${username}` }
    const hook = (event: string, body: unknown, token = webhookToken()) => gitlabEvents(new Request('http://lms.test/api/bootcamp/gitlab-events', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gitlab-Event': event, 'X-Gitlab-Token': token }, body: JSON.stringify(body) }))
    const gitlabUserId = 440000 + lead.id
    const head = 'd'.repeat(40)
    const timestamp = new Date().toISOString()
    const botId = 6658
    const restore = await configureTestBootcampGrader(payload, 'nodejs', botId)
    const { docs: [enrollment] } = await payload.find({ collection: 'bootcamp-enrollments', where: { lead: { equals: lead.id } } })
    await payload.update({ collection: 'bootcamp-enrollments', id: enrollment.id, data: {
      status: 'done', gitlabUserId, gitlabProjectId: project.id, gitlabProjectUrl: project.web_url,
    } })
    const mr = { iid: 3, title: 'Неделя 1', url: project.web_url + '/-/merge_requests/3', author_id: gitlabUserId, target_branch: 'main',
      source_project_id: project.id, target_project_id: project.id, source_branch: 'week-01', state: 'opened',
      last_commit: { id: head }, updated_at: timestamp, created_at: timestamp }
    try {

      expect((await hook('Merge Request Hook', { project }, 'f'.repeat(64))).status).toBe(403)
      const opened = await hook('Merge Request Hook', { project, user: { id: gitlabUserId, username }, object_attributes: { ...mr, action: 'open', source_branch: 'week-01', target_branch: 'main' } })
      expect(await opened.json()).toEqual({ result: 'notified' })
      await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`${username} открыл MR`))).toContain('из ветки week-01 в main'))

      await hook('Note Hook', { project, user: { id: botId, username: 'group_5_bot_abc', name: 'grader-bot' }, merge_request: mr, object_attributes: { noteable_type: 'MergeRequest', updated_at: timestamp, note: '<!-- grader:01:' + head + ' -->\n**Доверенная проверка: неделя 1 - пройдена**', url: `${mr.url}#note_1` } })
      await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`${username}: вердикт проверки`))).toContain('неделя 1 - пройдена'))

      const mentor = await hook('Note Hook', { project, user: { username: 'root' }, merge_request: mr, object_attributes: { noteable_type: 'MergeRequest', note: 'Поправь тесты' } })
      expect(await mentor.json()).toEqual({ result: 'ignored' })
      const stranger = await hook('Merge Request Hook', { project: { id: 1, path_with_namespace: 'other/project' }, object_attributes: { action: 'open' } })
      expect(await stranger.json()).toEqual({ result: 'ignored' })
    } finally { await restore() }
  })
})
