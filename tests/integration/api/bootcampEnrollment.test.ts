import { createHmac } from 'node:crypto'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { POST as gitlabEvents } from '@/app/api/bootcamp/gitlab-events/route'
import { POST as leadForm } from '@/app/api/bootcamp/leads/route'
import { POST as supportMessage } from '@/app/api/support-message/route'
import { POST as retryRoute } from '@/app/api/bootcamp/enrollments/[id]/retry/route'
import { GET as enrollmentState, POST as enrollRoute } from '@/app/api/bootcamp/leads/[id]/enrollment/route'
import { POST as claimRoute } from '@/app/api/internal/bootcamp-enrollments/claim/route'
import { POST as reportRoute } from '@/app/api/internal/bootcamp-enrollments/[id]/report/route'
import { POST as signedInRoute } from '@/app/api/internal/bootcamp-enrollments/[id]/signed-in/route'
import { BOOTCAMP_MANUALS_COURSE_SLUG } from '@/lib/bootcamp-enrollment'
import { adminTelegramTransport } from '@/server/admin-telegram'
import type { BootcampLead } from '@/payload-types'
import { captureEmails, createAdmin, createCourseTree, createStudent, getTestPayload, login, uid, type TestUser } from '../helpers/payload'

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
  const existing = await payload.find({ collection: 'courses', where: { slug: { equals: BOOTCAMP_MANUALS_COURSE_SLUG } }, limit: 1, overrideAccess: true })
  if (existing.docs[0]) courseId = existing.docs[0].id
  else {
    const { course } = await createCourseTree(payload, { lessons: 1 })
    courseId = (await payload.update({ collection: 'courses', id: course.id, data: { slug: BOOTCAMP_MANUALS_COURSE_SLUG }, overrideAccess: true })).id
  }
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

beforeEach(() => { telegram.length = 0 })

async function newLead(extra: Partial<Pick<BootcampLead, 'email' | 'status'>> = {}): Promise<BootcampLead> {
  return payload.create({
    collection: 'bootcamp-leads',
    data: { email: `${uid('cand')}@mail.test`.toLowerCase(), name: 'Иван Петров', program: 'nodejs', status: 'admitted', consentVersion: '2026-10-26', consentAt: new Date().toISOString(), submissionCount: 1, entryTaskToken: uid('entry-token'), ...extra },
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

/** Пока в базе нет чужих заданий в очереди, исполнитель берёт именно это. */
async function claimJob(id: number) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
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
    expect((await payload.find({ collection: 'bootcamp-enrollments', where: { lead: { equals: lead.id } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('исполнитель берёт задание по ключу, отчитывается по шагам, итог переводит заявку в «Зачислен»', async () => {
    expect((await claim('0'.repeat(64))).status).toBe(403)
    const lead = await newLead()
    const username = uid('wk').toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const { enrollment } = await (await enroll(lead.id, form(username))).json() as { enrollment: { id: number } }

    const claimed = await claimJob(enrollment.id) as { job: { id: number, username: string, group: string, courseProject: string }, webhook: { url: string, token: string } }
    expect(claimed.job).toMatchObject({ id: enrollment.id, username, group: 'nodejs-bootcamp', courseProject: 'bootcamp/course' })
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
    const mail = captureEmails(payload)
    try {
      const { enrollment } = await (await enroll(lead.id, form(uid('ex').toLowerCase().replace(/[^a-z0-9-]/g, '-')))).json() as { enrollment: { lmsUserId: number, steps: { key: string, detail?: string }[] } }
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
  it('новая заявка: кто, откуда и ушло ли письмо с заданием', async () => {
    const email = `${uid('tg-lead')}@mail.test`.toLowerCase()
    const mail = captureEmails(payload)
    try {
      const response = await leadForm(new Request('http://info.test/api/bootcamp/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-Host': 'info.test', Origin: 'http://info.test', 'Sec-Fetch-Site': 'same-origin' },
        body: JSON.stringify({ program: 'nodejs', email, name: 'Мария', consent: true, consentVersion: '2026-10-26', utm: { utm_source: 'habr' } }),
      }))
      expect(response.status).toBe(200)
      await vi.waitFor(() => {
        const text = telegram.find((item) => item.startsWith('Новая заявка на буткемп Node.js'))
        expect(text).toContain(`Мария, ${email}`)
        expect(text).toContain('Откуда: habr')
        expect(text).toContain('Письмо с входным заданием ушло, срок до')
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

  it('смена этапа заявки в CMS пишет, кто и куда перевёл', async () => {
    const lead = await newLead({ status: 'new' })
    await payload.update({ collection: 'bootcamp-leads', id: lead.id, data: { status: 'admitted' }, user: admin, overrideAccess: false })
    await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`Этап заявки на буткемп: ${lead.email}`))).toContain('Было: Новая, стало: Допущен'))
  })

  it('первый вход зачисленного ученика в LMS приходит один раз', async () => {
    const student = await createStudent(payload)
    const lead = await newLead({ email: student.email })
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
    const mr = { iid: 3, title: 'Неделя 1', url: `${project.web_url}/-/merge_requests/3` }

    expect((await hook('Merge Request Hook', { project }, 'f'.repeat(64))).status).toBe(403)
    const opened = await hook('Merge Request Hook', { project, user: { username }, object_attributes: { ...mr, action: 'open', source_branch: 'week-01', target_branch: 'main' } })
    expect(await opened.json()).toEqual({ result: 'notified' })
    await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`${username} открыл MR`))).toContain('из ветки week-01 в main'))

    await hook('Note Hook', { project, user: { username: 'group_5_bot_abc', name: 'grader-bot' }, merge_request: mr, object_attributes: { noteable_type: 'MergeRequest', note: 'Доверенная проверка: неделя 1 - пройдена', url: `${mr.url}#note_1` } })
    await vi.waitFor(() => expect(telegram.find((text) => text.startsWith(`${username}: вердикт проверки`))).toContain('неделя 1 - пройдена'))

    const mentor = await hook('Note Hook', { project, user: { username: 'root' }, merge_request: mr, object_attributes: { noteable_type: 'MergeRequest', note: 'Поправь тесты' } })
    expect(await mentor.json()).toEqual({ result: 'ignored' })
    const stranger = await hook('Merge Request Hook', { project: { id: 1, path_with_namespace: 'other/project' }, object_attributes: { action: 'open' } })
    expect(await stranger.json()).toEqual({ result: 'ignored' })
  })
})
