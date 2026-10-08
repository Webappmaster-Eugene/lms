import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { APIError, type CollectionBeforeChangeHook, type Payload } from 'payload'
import { GET, POST, PUT } from '@/app/api/manage/learning-access/route'
import { getLearningAccess } from '@/server/learning-access'
import type { AssignmentSnapshot } from '@/components/learning-access/contracts'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, type CourseTree, type TestUser } from '../helpers/payload'

let payload: Payload
let admin: TestUser
let student: TestUser
let other: TestUser
let tree: CourseTree
let otherTree: CourseTree
let adminToken: string
let studentToken: string

function request(method: 'GET' | 'POST' | 'PUT', data?: unknown, token = adminToken, headers: Record<string, string> = {}, query = `user=${student.id}`) {
  return new Request(`http://lms.test/api/manage/learning-access?${query}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}), ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
}

async function current() { return await (await GET(request('GET'))).json() as AssignmentSnapshot }
const allow = (relationTo: 'roadmaps' | 'courses' | 'lessons', value: number) => ({ target: { relationTo, value }, effect: 'allow', startsAt: null, expiresAt: null, note: '' })

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  tree = await createCourseTree(payload, { lessons: 2 })
  otherTree = await createCourseTree(payload, { lessons: 1 })
})
beforeEach(async () => {
  student = await createStudent(payload)
  other = await createStudent(payload)
  studentToken = await login(payload, student)
})

describe('управление назначениями: реальная авторизация, транзакции и конфликты', () => {
  it('гость и ученик не читают имена, email и назначения других учеников', async () => {
    expect((await GET(request('GET', undefined, ''))).status).toBe(401)
    for (const query of [`user=${other.id}`, 'kind=students', 'kind=targets&type=lessons']) expect((await GET(request('GET', undefined, studentToken, {}, query))).status).toBe(403)
    const body = { ...(await current()), mode: 'assigned', rules: [] }
    expect((await PUT(request('PUT', body, studentToken))).status).toBe(403)
  })

  it('проверяет CSRF cookie-запроса и не использует cookie при неверном явном токене', async () => {
    const body = await current()
    expect((await PUT(request('PUT', body, '', { Cookie: `payload-token=${adminToken}`, Origin: 'https://attacker.example' }))).status).toBe(401)
    expect((await PUT(request('PUT', body, 'invalid', { Cookie: `payload-token=${adminToken}`, Origin: 'http://lms.test' }))).status).toBe(401)
    const proxy = new Request('http://0.0.0.0:3000/api/manage/learning-access', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `payload-token=${adminToken}`, Origin: 'http://lms.test', Host: 'lms.test', 'X-Forwarded-Proto': 'https', 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify(body) })
    expect((await POST(proxy)).status).toBe(200)
  })

  it('предварительный просмотр не меняет режим, назначения и аудит', async () => {
    const body = { ...(await current()), mode: 'assigned', rules: [allow('roadmaps', tree.roadmap.id), { ...allow('lessons', tree.lessons[0].id), effect: 'deny' }] }
    const courses: { id: number; access: string }[] = []
    for (let page = 1; page <= 100; page += 1) {
      const result = await POST(request('POST', body, adminToken, {}, `page=${page}`))
      expect(result.status).toBe(200)
      const preview = await result.json() as { courses: { id: number; access: string }[]; hasNextPage: boolean }
      courses.push(...preview.courses)
      if (!preview.hasNextPage || courses.some((course) => course.id === tree.course.id) && courses.some((course) => course.id === otherTree.course.id)) break
    }
    expect(courses.find((course) => course.id === tree.course.id)?.access).toBe('partial')
    expect(courses.find((course) => course.id === otherTree.course.id)?.access).toBe('closed')
    expect((await current()).mode).toBe('all')
    expect((await payload.count({ collection: 'learning-access-grants', where: { user: { equals: student.id } } })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'learning-access-audit', where: { userId: { equals: student.id } } })).totalDocs).toBe(0)
  })

  it('атомарно сохраняет режим и частичные назначения, повторное неизменённое сохранение сохраняет IDs', async () => {
    const body = { ...(await current()), mode: 'assigned', rules: [allow('roadmaps', tree.roadmap.id), { ...allow('lessons', tree.lessons[0].id), effect: 'deny' }] }
    const result = await PUT(request('PUT', body))
    expect(result.status).toBe(200)
    const saved = await result.json() as AssignmentSnapshot
    expect(saved.mode).toBe('assigned')
    expect(saved.rules).toHaveLength(2)
    const user = await payload.findByID({ collection: 'users', id: student.id })
    const access = await getLearningAccess(payload, user)
    expect(access.canAccessCourse(tree.course.id)).toBe(true)
    expect(access.canAccessCourse(otherTree.course.id)).toBe(false)
    expect(access.canAccessLessonMetadata({ ...tree.lessons[0], course: tree.course.id, section: tree.section.id, isPublished: true })).toBe(false)
    const audit = await payload.count({ collection: 'learning-access-audit', where: { userId: { equals: student.id } } })
    const repeated = await PUT(request('PUT', saved))
    expect(repeated.status).toBe(200)
    expect((await repeated.json() as AssignmentSnapshot).rules.map((rule) => rule.id)).toEqual(saved.rules.map((rule) => rule.id))
    expect((await payload.count({ collection: 'learning-access-audit', where: { userId: { equals: student.id } } })).totalDocs).toBe(audit.totalDocs)
  })

  it('два параллельных сохранения одной версии дают один успех и один 409', async () => {
    const body = { ...(await current()), mode: 'assigned', rules: [allow('roadmaps', tree.roadmap.id)] }
    const results = await Promise.all([PUT(request('PUT', body)), PUT(request('PUT', { ...body, rules: [allow('roadmaps', otherTree.roadmap.id)] }))])
    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    expect((await current()).rules).toHaveLength(1)
    expect((await payload.count({ collection: 'learning-access-audit', where: { userId: { equals: student.id } } })).totalDocs).toBe(2)
  })

  it('не принимает чужой grant ID и отсутствующие материалы; предыдущие назначения сохранены', async () => {
    await PUT(request('PUT', { ...(await current()), mode: 'assigned', rules: [allow('roadmaps', tree.roadmap.id)] }))
    const saved = await current()
    const foreign = await PUT(request('PUT', { ...saved, userId: other.id }))
    expect(foreign.status).toBe(409)
    const otherSnapshot = await (await GET(request('GET', undefined, adminToken, {}, `user=${other.id}`))).json() as AssignmentSnapshot
    expect((await PUT(request('PUT', { ...otherSnapshot, rules: saved.rules }))).status).toBe(403)
    expect((await PUT(request('PUT', { ...saved, mode: 'all', rules: [...saved.rules, allow('lessons', 2_147_483_647)] }))).status).toBe(404)
    expect((await current()).revision).toBe(saved.revision)
  })

  it('ошибка второго хука откатывает первое назначение, его аудит и изменение режима', async () => {
    const reject: CollectionBeforeChangeHook = ({ data }) => { if (data.note === 'fail-second') throw new APIError('Проверка отката', 400); return data }
    const hooks = payload.collections['learning-access-grants'].config.hooks.beforeChange
    hooks.push(reject)
    try {
      const body = { ...(await current()), mode: 'assigned', rules: [allow('roadmaps', tree.roadmap.id), { ...allow('roadmaps', otherTree.roadmap.id), note: 'fail-second' }] }
      expect((await PUT(request('PUT', body))).status).toBe(400)
      expect((await current()).mode).toBe('all')
      expect((await current()).rules).toEqual([])
      expect((await payload.count({ collection: 'learning-access-audit', where: { userId: { equals: student.id } } })).totalDocs).toBe(0)
    } finally { hooks.splice(hooks.indexOf(reject), 1) }
  })

  it('поиск уроков возвращает только метаданные и поддерживает выбор курса', async () => {
    const result = await GET(request('GET', undefined, adminToken, {}, `kind=targets&type=lessons&parent=${tree.course.id}`))
    expect(result.status).toBe(200)
    const data = await result.json() as { docs: Record<string, unknown>[]; hasNextPage: boolean }
    expect(data.docs.map((doc) => doc.id)).toEqual(tree.lessons.map((lesson) => lesson.id))
    for (const doc of data.docs) { expect(doc).not.toHaveProperty('content'); expect(doc).not.toHaveProperty('description') }
  })

  it('ограничивает тело запроса до разбора JSON и не меняет доступ', async () => {
    const oversized = new Request('http://lms.test/api/manage/learning-access', { method: 'PUT', headers: { Authorization: `JWT ${adminToken}`, 'Content-Type': 'application/json' }, body: `"${'a'.repeat(512_001)}"` })
    expect((await PUT(oversized)).status).toBe(413)
    expect((await current()).mode).toBe('all')
    expect((await current()).rules).toEqual([])
  })
})
