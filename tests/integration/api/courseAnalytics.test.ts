import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'

import { GET } from '@/app/api/manage/learning-analytics/route'
import { median, type CourseDetail, type CoursesOverview } from '@/lib/learning-analytics'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, uid, type CourseTree, type TestUser } from '../helpers/payload'

let payload: Payload
let admin: TestUser
let adminToken: string
let fast: TestUser
let slow: TestUser
let idle: TestUser
let tester: TestUser
let tree: CourseTree
let spare: { id: number; title: string }
// Ученики других файлов с режимом «все курсы» видят и курсы этого теста: база общая на весь прогон.
let everyone = 0

const request = (query: string, auth = adminToken) => new Request(`http://lms.test/api/manage/learning-analytics?${query}`, { headers: { Authorization: `JWT ${auth}` } })
const overview = async (query = '') => {
  const response = await GET(request(query))
  expect(response.status).toBe(200)
  return response.json() as Promise<CoursesOverview>
}
const complete = (user: TestUser, lesson: number) => payload.create({ collection: 'user-progress', data: { user: user.id, lesson, isCompleted: true, completedAt: new Date().toISOString() } })
const grant = async (user: TestUser, relationTo: 'courses' | 'roadmaps', value: number) => payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: user.id, target: { relationTo, value }, effect: 'allow', ruleKey: 'server-generated' } })

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  // Курс, к которому никто не получал назначения: его видят только ученики с режимом «все курсы».
  const probe = await createCourseTree(payload, { lessons: 1 })
  everyone = (await overview()).unopened.find((course) => course.id === probe.course.id)?.access ?? 0
  tree = await createCourseTree(payload, { lessons: 3 })
  // Курс другой карты в теме роадмапа в его программу не входит - как и у сертификата.
  const foreign = await createCourseTree(payload, { lessons: 2 })
  await payload.create({ collection: 'roadmap-nodes', data: { nodeId: uid('shared-node'), label: uid('Тема'), nodeType: 'topic', roadmap: tree.roadmap.id, positionX: 0, positionY: 0, sharedCourses: [foreign.course.id] } as never })
  const key = uid('spare')
  spare = await payload.create({ collection: 'courses', data: { title: `Нетронутый ${key}`, slug: `spare-${key}`, roadmap: tree.roadmap.id, isPublished: true } })
  await payload.create({ collection: 'lessons', data: { title: `Урок ${key}`, slug: `spare-lesson-${key}`, course: spare.id, isPublished: true, order: 1 } })
  fast = await createStudent(payload, { learningAccessMode: 'assigned' })
  slow = await createStudent(payload, { learningAccessMode: 'assigned' })
  idle = await createStudent(payload, { learningAccessMode: 'assigned' })
  tester = await createStudent(payload, { learningAccessMode: 'assigned', isTestStudent: true })
  for (const user of [fast, slow, tester]) await grant(user, 'courses', tree.course.id)
  await grant(idle, 'roadmaps', tree.roadmap.id)
  await complete(fast, tree.lessons[0].id)
  await complete(fast, tree.lessons[1].id)
  await complete(slow, tree.lessons[0].id)
  // Тестовый ученик прошёл всё - в аналитике его быть не должно.
  for (const lesson of tree.lessons) await complete(tester, lesson.id)
  await payload.create({ collection: 'lesson-learning-states', data: { user: slow.id, lesson: tree.lessons[1].id, lastViewedAt: new Date().toISOString(), lastVideoId: 'clip', positions: { clip: { seconds: 300, at: Date.now(), ended: true } } }, depth: 0 })
  await payload.create({ collection: 'comments', data: { lesson: tree.lessons[1].id, content: 'Не понял второй урок' } as never, user: slow, overrideAccess: false })
})

afterAll(async () => {
  for (const user of [fast, slow, idle, tester, admin]) if (user) await payload.delete({ collection: 'users', id: user.id })
})

describe('аналитика курсов и роадмапов', () => {
  it('курс: доступ, начали, закончили, медиана и урок, на котором стоят', async () => {
    const data = await overview(`roadmap=${tree.roadmap.id}`)
    const row = data.courses.find((course) => course.id === tree.course.id)
    expect(row).toMatchObject({ lessons: 3, access: 3 + everyone, started: 2, completed: 0, medianProgress: 50, questions: 1 })
    expect(row?.stuckAt).toMatchObject({ title: tree.lessons[1].title, href: `/lessons/${tree.lessons[1].slug}`, students: 1 })
    expect(row?.period.lessons).toBe(3)
    expect(data.unopened).toEqual([expect.objectContaining({ id: spare.id, access: 1 + everyone })])
  })

  it('роадмап считает программу целиком: с доступом, начали, медиана по всем с доступом', async () => {
    const data = await overview()
    const row = data.roadmaps.find((roadmap) => roadmap.id === tree.roadmap.id)
    expect(row).toMatchObject({ courses: 2, lessons: 4, access: 3 + everyone, started: 2, completed: 0 })
    // Прогресс по 4 урокам программы: 50%, 25%, у остальных с доступом 0%.
    expect(row?.medianProgress).toBe(median([50, 25, 0, ...Array<number>(everyone).fill(0)]))
  })

  it('прохождение всех уроков делает курс законченным', async () => {
    await complete(fast, tree.lessons[2].id)
    const row = (await overview(`roadmap=${tree.roadmap.id}`)).courses.find((course) => course.id === tree.course.id)
    expect(row).toMatchObject({ started: 2, completed: 1 })
    expect(row?.stuckAt?.title).toBe(tree.lessons[1].title)
  })

  it('курс по урокам: прошли, открывали, досмотрели видео, вопросы и место, где бросают', async () => {
    const response = await GET(request(`course=${tree.course.id}`))
    expect(response.status).toBe(200)
    const detail = await response.json() as CourseDetail
    expect(detail.started).toBe(2)
    expect(detail.lessons.map((lesson) => lesson.completed)).toEqual([2, 1, 1])
    expect(detail.lessons[1]).toMatchObject({ viewed: 1, videoEnded: 1, questions: 1, drop: true })
    expect(detail.lessons.filter((lesson) => lesson.drop)).toHaveLength(1)
  })

  it('ученику и чужим запросам отвечает ошибкой', async () => {
    expect((await GET(request('', await login(payload, slow)))).status).toBe(403)
    expect((await GET(request('course=abc'))).status).toBe(400)
    expect((await GET(request('course=999999999'))).status).toBe(404)
  })
})
