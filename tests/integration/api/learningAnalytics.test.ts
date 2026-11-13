import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { POST as activityPOST } from '@/app/api/activity/route'
import { GET as analyticsGET } from '@/app/api/manage/student-analytics/route'
import { activityDayKey, moscowDay, type StudentLearning, type StudentsOverview } from '@/lib/learning-analytics'
import type { StudentAnalyticsSnapshot } from '@/lib/student-analytics'
import { adminTelegramTransport } from '@/server/admin-telegram'
import { sendInactiveDigest } from '@/server/analytics-digests'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, type CourseTree, type TestUser } from '../helpers/payload'

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const DAY = 86_400_000
const TELEGRAM = { TELEGRAM_BOT_TOKEN: `123456:${'a'.repeat(32)}`, TELEGRAM_ADMIN_CHAT_ID: '42', TELEGRAM_PROXY_URL: undefined }
const saved = Object.fromEntries(Object.keys(TELEGRAM).map((key) => [key, process.env[key]]))

let payload: Payload
let db: Db
let admin: TestUser
let adminToken: string
let learner: TestUser
let learnerToken: string
let frozen: TestUser
let silent: TestUser
let tester: TestUser
let tree: CourseTree
const telegram: string[] = []

const request = (path: string, auth: string, body?: unknown) => new Request(`http://lms.test/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `JWT ${auth}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const overview = async (query: string) => {
  const response = await analyticsGET(request(`manage/student-analytics?kind=students&${query}`, adminToken))
  expect(response.status).toBe(200)
  return response.json() as Promise<StudentsOverview>
}
const dayRow = async (userId: number, courseId: number | null) => {
  const found = await payload.find({ collection: 'student-activity-days', where: { key: { equals: activityDayKey(userId, moscowDay(), courseId) } }, limit: 1, depth: 0 })
  return found.docs[0] ?? null
}
/** Ближайший понедельник 12:00 по Москве после настоящего времени: окно сводки открыто. */
function nextMonday(): Date {
  const moscow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const daysAhead = ((8 - moscow.getUTCDay()) % 7) || 7
  return new Date(Date.UTC(moscow.getUTCFullYear(), moscow.getUTCMonth(), moscow.getUTCDate() + daysAhead, 9, 0, 0))
}

beforeAll(async () => {
  payload = await getTestPayload()
  db = (payload.db as unknown as { drizzle: Db }).drizzle
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  tree = await createCourseTree(payload, { lessons: 3 })
  learner = await createStudent(payload, { learningAccessMode: 'assigned', firstName: 'Занятой', lastName: 'Ученик' })
  await payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: learner.id, target: { relationTo: 'courses', value: tree.course.id }, effect: 'allow', ruleKey: 'server-generated' } })
  learnerToken = await login(payload, learner)
  frozen = await createStudent(payload, { firstName: 'Замороженный', lastName: 'Ученик' })
  await payload.create({ collection: 'account-freezes', data: { user: frozen.id, startsAt: new Date(Date.now() - DAY).toISOString(), endsAt: null, reason: 'vacation', automatic: false }, overrideAccess: true, context: { syncAccountFreezes: true } })
  silent = await createStudent(payload, { firstName: 'Молчаливый', lastName: 'Ученик' })
  // Учётка создана три недели назад, занятий не было - кандидат в сводку «нет активности».
  await db.execute(sql`update users set created_at = now() - interval '21 days' where id = ${silent.id}`)
  tester = await createStudent(payload, { isTestStudent: true, firstName: 'Тестовый', lastName: 'Ученик' })
  await db.execute(sql`update users set created_at = now() - interval '21 days' where id = ${tester.id}`)
  for (const [key, value] of Object.entries(TELEGRAM)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.spyOn(adminTelegramTransport, 'send').mockImplementation(async (_cfg, _chat, text) => { telegram.push(text) })
})

afterAll(async () => {
  vi.restoreAllMocks()
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await db.execute(sql`delete from admin_digests where kind = 'inactive-students' and period = ${new Date(nextMonday().getTime() - 7 * DAY).toISOString().slice(0, 10)}`)
  for (const user of [frozen, silent, tester, admin]) if (user) await payload.delete({ collection: 'users', id: user.id })
})

describe('дневная сводка активности', () => {
  it('сигнал вкладки добавляет минуту курса, повтор в ту же минуту - нет, следующая минута - да', async () => {
    const path = `/lessons/${tree.lessons[0].slug}`
    expect(await (await activityPOST(request('activity', learnerToken, { path }))).json()).toEqual({ recorded: true })
    expect((await dayRow(learner.id, tree.course.id))?.minutes).toBe(1)
    expect(await (await activityPOST(request('activity', learnerToken, { path }))).json()).toEqual({ recorded: false })
    expect((await dayRow(learner.id, tree.course.id))?.minutes).toBe(1)
    const real = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(real + 61_000)
    try {
      expect(await (await activityPOST(request('activity', learnerToken, { path }))).json()).toEqual({ recorded: true })
    } finally { clock.mockRestore() }
    expect((await dayRow(learner.id, tree.course.id))?.minutes).toBe(2)
  })

  it('пройденный урок попадает в сводку один раз, даже если отметку сняли и поставили снова', async () => {
    const progress = await payload.create({ collection: 'user-progress', data: { user: learner.id, lesson: tree.lessons[0].id, isCompleted: true, completedAt: new Date().toISOString() } })
    expect((await dayRow(learner.id, tree.course.id))?.lessonsCompleted).toBe(1)
    await payload.update({ collection: 'user-progress', id: progress.id, data: { isCompleted: false } })
    await payload.update({ collection: 'user-progress', id: progress.id, data: { isCompleted: true, completedAt: new Date().toISOString() } })
    expect((await dayRow(learner.id, tree.course.id))?.lessonsCompleted).toBe(1)
  })
})

describe('таблица учеников', () => {
  it('показывает занятия за период, открытые курсы и вопросы без ответа', async () => {
    const question = await payload.create({ collection: 'comments', data: { lesson: tree.lessons[0].id, content: 'Почему так?' } as never, user: learner, overrideAccess: false })
    const [row] = (await overview(`search=${encodeURIComponent(learner.email)}`)).docs
    expect(row).toMatchObject({ id: learner.id, state: 'learning', freeze: null, courses: { open: 1, started: 1 }, waitingQuestions: 1, lessonsTotal: 1 })
    expect(row.period).toMatchObject({ activeDays: 1, minutes: 2, lessons: 1 })
    await payload.create({ collection: 'comments', data: { lesson: tree.lessons[0].id, content: 'Потому что так задумано.', parentComment: question.id } as never, user: admin, overrideAccess: false })
    expect((await overview(`search=${encodeURIComponent(learner.email)}`)).docs[0].waitingQuestions).toBe(0)
  })

  it('замороженный ученик - с отметкой и в своём фильтре, без плановой даты доступа', async () => {
    const data = await overview(`filter=frozen&search=${encodeURIComponent(frozen.email)}`)
    expect(data.docs).toHaveLength(1)
    expect(data.docs[0]).toMatchObject({ state: 'frozen', freeze: { until: null, reason: 'отпуск' }, accessUntil: null })
  })

  it('кто не занимался 14 дней, попадает в «нет активности»; тестовый скрыт, пока его не попросили', async () => {
    const inactive = await overview(`filter=inactive&search=${encodeURIComponent(silent.email)}`)
    expect(inactive.docs[0]).toMatchObject({ id: silent.id, state: 'inactive', lastActivityAt: null })
    expect((await overview(`search=${encodeURIComponent(tester.email)}`)).docs).toHaveLength(0)
    expect((await overview(`test=1&search=${encodeURIComponent(tester.email)}`)).docs[0]).toMatchObject({ id: tester.id, isTestStudent: true })
    expect((await overview(`test=1&search=${encodeURIComponent(admin.email)}`)).docs).toHaveLength(0)
  })

  it('ученику таблица недоступна', async () => {
    expect((await analyticsGET(request('manage/student-analytics?kind=students', learnerToken))).status).toBe(403)
  })
})

describe('карточка ученика', () => {
  it('показывает курс с прогрессом по программе, минуты, место остановки и неделю', async () => {
    await payload.create({ collection: 'lesson-learning-states', data: { user: learner.id, lesson: tree.lessons[1].id, lastViewedAt: new Date().toISOString() }, depth: 0 })
    const response = await analyticsGET(request(`manage/student-analytics?user=${learner.id}`, adminToken))
    expect(response.status).toBe(200)
    const { learning } = await response.json() as StudentAnalyticsSnapshot & { learning: StudentLearning }
    expect(learning.roadmaps).toEqual([expect.objectContaining({ id: tree.roadmap.id, courses: 1, started: 1, lessonsDone: 1, lessonsTotal: 3 })])
    expect(learning.courses).toEqual([expect.objectContaining({ id: tree.course.id, open: true, lessonsDone: 1, lessonsTotal: 3, minutes: 2, stoppedAt: { title: tree.lessons[1].title, href: `/lessons/${tree.lessons[1].slug}` } })])
    expect(learning.notStarted).toBe(0)
    expect(learning.weeks).toHaveLength(12)
    expect(learning.weeks.at(-1)).toMatchObject({ minutes: 2, lessons: 1 })
  })

  it('у администратора блоков обучения нет', async () => {
    const response = await analyticsGET(request(`manage/student-analytics?user=${admin.id}`, adminToken))
    expect('learning' in await response.json()).toBe(false)
  })
})

describe('понедельничная сводка о пропавших', () => {
  it('уходит один раз за неделю, без тестовых и замороженных', async () => {
    const monday = nextMonday()
    telegram.length = 0
    expect(await sendInactiveDigest(payload, monday)).toBe(true)
    expect(await sendInactiveDigest(payload, monday)).toBe(false)
    await vi.waitFor(() => expect(telegram).toHaveLength(1))
    expect(telegram[0]).toContain('Нет активности 14+ дней')
    expect(telegram[0]).toContain(`${silent.firstName} ${silent.lastName} - не занимался ни разу`)
    expect(telegram[0]).not.toContain(tester.email)
    expect(telegram[0]).not.toContain(`${tester.firstName} ${tester.lastName}`)
    expect(telegram[0]).not.toContain(`${frozen.firstName} ${frozen.lastName}`)
    expect(telegram[0]).toContain('/admin/student-analytics?filter=inactive')
  })

  it('вне окна сводки ничего не делает', async () => {
    expect(await sendInactiveDigest(payload, new Date(nextMonday().getTime() + DAY))).toBe(false)
  })
})

describe('удаление ученика', () => {
  it('удаляет и его дневную сводку', async () => {
    await payload.delete({ collection: 'users', id: learner.id })
    expect((await payload.count({ collection: 'student-activity-days', where: { user: { equals: learner.id } } })).totalDocs).toBe(0)
  })
})
