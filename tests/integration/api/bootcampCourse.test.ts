import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { notBootcamp } from '@/lib/course-path'
import { notificationLinkIsVisible } from '@/server/notification-visibility'
import type { LearningTargetCollection } from '@/lib/learning-access'
import { browsableCourseIds, getLearningAccess } from '@/server/learning-access'
import { GET, PUT } from '@/app/api/manage/learning-access/route'
import type { AssignmentSnapshot } from '@/components/learning-access/contracts'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, type CourseTree, type TestUser } from '../helpers/payload'

/**
 * Буткемп — курс с флагом isBootcamp: свой раздел меню, назначается только целиком
 * и всегда «только по назначению».
 */
let payload: Payload
let bootcamp: CourseTree
let regular: CourseTree
let admin: TestUser
let student: TestUser
let adminToken: string

async function assign(target: LearningTargetCollection, id: number) {
  const req = await createLocalReq({ user: admin }, payload)
  return payload.create({ collection: 'learning-access-grants', req, data: { user: student.id, target: { relationTo: target, value: id }, effect: 'allow', ruleKey: 'server-generated' } })
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  student = await createStudent(payload, { learningAccessMode: 'all', learningCatalogVisibility: 'catalog' })
  adminToken = await login(payload, admin)
  bootcamp = await createCourseTree(payload, { lessons: 2 })
  regular = await createCourseTree(payload, { lessons: 1 })
  // Флаг ставится без assignedOnly: открыть буткемп режимом «все курсы» нельзя и по ошибке администратора.
  const saved = await rest('PATCH', `/courses/${bootcamp.course.id}`, { token: adminToken, body: { isBootcamp: true, assignedOnly: false } })
  expect(saved.status).toBe(200)
})

describe('курс-буткемп', () => {
  it('всегда только по назначению', async () => {
    const course = await payload.findByID({ collection: 'courses', id: bootcamp.course.id, depth: 0 })
    expect(course).toMatchObject({ isBootcamp: true, assignedOnly: true })
    const again = await rest('PATCH', `/courses/${bootcamp.course.id}`, { token: adminToken, body: { assignedOnly: false } })
    expect(again.status).toBe(200)
    expect((await payload.findByID({ collection: 'courses', id: bootcamp.course.id, depth: 0 })).assignedOnly).toBe(true)
  })

  it('каталог курсов отсекает буткемп и не теряет курсы без значения флага', async () => {
    const adapter = payload.db as unknown as { drizzle: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } }
    await adapter.drizzle.execute(sql`update courses set is_bootcamp = null where id = ${regular.course.id}`)
    const found = await payload.find({ collection: 'courses', where: { and: [{ id: { in: [bootcamp.course.id, regular.course.id] } }, notBootcamp] }, depth: 0, overrideAccess: true })
    expect(found.docs.map((course) => course.id)).toEqual([regular.course.id])
  })

  it('раздел и урок буткемпа по отдельности не назначаются', async () => {
    const whole = { data: { errors: [expect.objectContaining({ path: 'target', message: expect.stringMatching(/^Буткемп назначается только целиком/) })] } }
    await expect(assign('sections', bootcamp.section.id)).rejects.toMatchObject(whole)
    await expect(assign('lessons', bootcamp.lessons[0].id)).rejects.toMatchObject(whole)
    // Обычный курс по-прежнему назначается по частям.
    await expect(assign('lessons', regular.lessons[0].id)).resolves.toMatchObject({ effect: 'allow' })
  })

  it('облегчённая проверка меню учитывает назначение на урок закрытого курса, как полная политика', async () => {
    const closed = await createCourseTree(payload, { lessons: 2 })
    expect((await rest('PATCH', `/courses/${closed.course.id}`, { token: adminToken, body: { assignedOnly: true } })).status).toBe(200)
    const other = await createStudent(payload, { learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned' })
    const req = await createLocalReq({ user: admin }, payload)
    await payload.create({ collection: 'learning-access-grants', req, data: { user: other.id, target: { relationTo: 'lessons', value: closed.lessons[1].id }, effect: 'allow', ruleKey: 'server-generated' } })
    const courses = (await payload.find({ collection: 'courses', where: { id: { equals: closed.course.id } }, select: { roadmap: true, roadmapNode: true, isPublished: true, assignedOnly: true }, depth: 0, overrideAccess: true })).docs
    const full = await getLearningAccess(payload, other, await createLocalReq({ user: other }, payload))
    expect(full.canBrowseCourse(closed.course.id)).toBe(true)
    expect([...await browsableCourseIds(payload, other, courses, await createLocalReq({ user: other }, payload))]).toEqual([closed.course.id])
  })

  it('экран назначений объясняет администратору, почему раздел буткемпа не сохранился', async () => {
    const other = await createStudent(payload)
    const url = `http://lms.test/api/manage/learning-access?user=${other.id}`
    const headers = { 'Content-Type': 'application/json', Authorization: `JWT ${adminToken}` }
    const current = await (await GET(new Request(url, { headers }))).json() as AssignmentSnapshot
    const saved = await PUT(new Request(url, { method: 'PUT', headers, body: JSON.stringify({ ...current, rules: [{ target: { relationTo: 'sections', value: bootcamp.section.id }, effect: 'allow', startsAt: null, expiresAt: null, note: '' }] }) }))
    expect(saved.status).toBe(400)
    expect((await saved.json() as { error: string }).error).toMatch(/^Буткемп назначается только целиком/)
    expect((await (await GET(new Request(url, { headers }))).json() as AssignmentSnapshot).rules).toEqual([])
  })

  it('без назначения не виден, после назначения курса — открыт целиком; облегчённая проверка меню совпадает с полной', async () => {
    const courses = async () => (await payload.find({ collection: 'courses', where: { id: { in: [bootcamp.course.id, regular.course.id] } }, select: { roadmap: true, roadmapNode: true, isPublished: true, assignedOnly: true }, depth: 0, overrideAccess: true })).docs
    const light = async () => [...await browsableCourseIds(payload, student, await courses(), await createLocalReq({ user: student }, payload))].sort()
    const req = await createLocalReq({ user: student }, payload)
    expect((await getLearningAccess(payload, student, req)).canBrowseCourse(bootcamp.course.id)).toBe(false)
    expect(await light()).toEqual([regular.course.id])
    // Уведомление со ссылкой в раздел буткемпа неназначенному не показывается — как и со ссылкой на курс.
    expect(await notificationLinkIsVisible(payload, student.id, `/bootcamp/${bootcamp.course.slug}`)).toBe(false)
    await assign('courses', bootcamp.course.id)
    const after = await getLearningAccess(payload, student, await createLocalReq({ user: student }, payload))
    expect(after.canBrowseCourse(bootcamp.course.id)).toBe(true)
    expect(after.canAccessCourse(bootcamp.course.id)).toBe(true)
    expect(await light()).toEqual([bootcamp.course.id, regular.course.id].sort())
    expect(await notificationLinkIsVisible(payload, student.id, `/bootcamp/${bootcamp.course.slug}`)).toBe(true)
    expect([...await browsableCourseIds(payload, admin, await courses(), await createLocalReq({ user: admin }, payload))].sort()).toEqual([bootcamp.course.id, regular.course.id].sort())
  })
})
