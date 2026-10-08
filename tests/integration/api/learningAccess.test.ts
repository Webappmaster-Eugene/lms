import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'

import { canAccessLesson, getLearningAccess } from '@/server/learning-access'
import type { LearningTargetCollection } from '@/lib/learning-access'
import { createAdmin, createCourseTree, createStudent, createSumTask, getTestPayload, login, rest, uid, type CourseTree, type TestUser } from '../helpers/payload'

let payload: Payload
let tree: CourseTree
let otherTree: CourseTree
let admin: TestUser
let student: TestUser
let other: TestUser
let token: string
let adminToken: string

async function assignment(target: LearningTargetCollection, targetId: number, effect: 'allow' | 'deny' = 'allow') {
  const req = await createLocalReq({ user: admin }, payload)
  return payload.create({ collection: 'learning-access-grants', req, data: { user: student.id, target: { relationTo: target, value: targetId }, effect, ruleKey: 'server-generated' } })
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  student = await createStudent(payload, { learningAccessMode: 'assigned' })
  other = await createStudent(payload)
  token = await login(payload, student)
  adminToken = await login(payload, admin)
  tree = await createCourseTree(payload, { lessons: 3 })
  otherTree = await createCourseTree(payload, { lessons: 1 })
  await payload.update({ collection: 'lessons', id: tree.lessons[0].id, data: { content: [{ blockType: 'link', title: 'Секрет материала', url: 'https://secret.example/private' }] } })
})

describe('единая политика назначений через настоящие Payload REST и Local API', () => {
  it('новый аккаунт без явно выбранного режима получает assigned и не читает материалы', async () => {
    const fresh = await payload.create({ collection: 'users', data: { email: `${uid('fresh-assigned')}@lms.test`, password: 'Fresh-Test-Pass-1', firstName: 'Новый', lastName: 'Ученик', role: 'student' }, context: { skipHooks: true } })
    expect(fresh.learningAccessMode).toBe('assigned')
    const freshToken = await login(payload, { email: fresh.email, password: 'Fresh-Test-Pass-1' })
    expect((await rest('GET', `/lessons/${tree.lessons[0].id}`, { token: freshToken })).status).toBe(404)
  })
  it('assigned не читает контент урока через ID, find, select, depth или Local API', async () => {
    for (const suffix of ['', '?depth=3', '?select[content]=true']) expect((await rest('GET', `/lessons/${tree.lessons[0].id}${suffix}`, { token })).status).toBe(404)
    expect((await rest('GET', `/lessons?where[id][equals]=${tree.lessons[0].id}&depth=3`, { token })).json.docs).toEqual([])
    await expect(payload.findByID({ collection: 'lessons', id: tree.lessons[0].id, overrideAccess: false, user: student })).rejects.toMatchObject({ status: 404 })
  })

  it('ученик не перечисляет чужие email и не меняет свой режим или назначения', async () => {
    expect((await rest('GET', `/users/${other.id}`, { token })).status).toBe(404)
    const users = await rest('GET', '/users?depth=2&limit=100', { token })
    expect(users.json.docs).toMatchObject([{ id: student.id }])
    const result = await rest('PATCH', `/users/${student.id}`, { token, body: { learningAccessMode: 'all' } })
    expect(result.status).toBe(200)
    expect((await payload.findByID({ collection: 'users', id: student.id })).learningAccessMode).toBe('assigned')
    expect((await rest('POST', '/learning-access-grants', { token, body: { user: student.id, target: { relationTo: 'roadmaps', value: tree.roadmap.id }, effect: 'allow' } })).status).toBe(403)
    expect((await rest('GET', '/learning-access-grants', { token })).status).toBe(403)
  })

  it('назначение roadmap разрешает только его published уроки, исключение lessondeny отзывает Local/REST', async () => {
    await assignment('roadmaps', tree.roadmap.id)
    expect((await rest('GET', `/lessons/${tree.lessons[0].id}?depth=2`, { token })).status).toBe(200)
    expect(await canAccessLesson(payload, student, tree.lessons[0].id)).toBe(true)
    expect((await rest('GET', `/lessons/${otherTree.lessons[0].id}`, { token })).status).toBe(404)
    await assignment('lessons', tree.lessons[0].id, 'deny')
    expect((await rest('GET', `/lessons/${tree.lessons[0].id}`, { token })).status).toBe(404)
    expect(await canAccessLesson(payload, student, tree.lessons[0].id)).toBe(false)
    expect((await rest('GET', `/lessons/${tree.lessons[1].id}`, { token })).status).toBe(200)
  })

  it('нельзя создать прогресс/заметку/комментарий/закладку на закрытом уроке; баллы остаются нулевыми', async () => {
    for (const [collection, body] of [
      ['user-progress', { isCompleted: true }], ['notes', { content: 'Закрытая заметка' }],
      ['comments', { content: 'Закрытый вопрос' }], ['bookmarks', {}],
    ] as const) expect((await rest('POST', `/${collection}`, { token, body: { lesson: tree.lessons[0].id, ...body } })).status, collection).toBe(403)
    expect((await payload.findByID({ collection: 'users', id: student.id })).totalPoints).toBe(0)
    expect((await payload.count({ collection: 'points-transactions', where: { user: { equals: student.id } } })).totalDocs).toBe(0)
  })

  it('отзыв скрывает сохранённые данные и запрещает PATCH с omittedlesson или переназначением', async () => {
    const lessonId = tree.lessons[1].id
    const note = await rest('POST', '/notes', { token, body: { lesson: lessonId, content: 'До отзыва' } })
    expect(note.status).toBe(201)
    const doc = note.json.doc as { id: number }
    await assignment('lessons', lessonId, 'deny')
    expect((await rest('GET', `/notes/${doc.id}?depth=3`, { token })).status).toBe(404)
    expect((await rest('PATCH', `/notes/${doc.id}`, { token, body: { content: 'После отзыва' } })).status).toBe(403)
    expect((await rest('PATCH', `/notes/${doc.id}`, { token, body: { lesson: tree.lessons[2].id, content: 'Перенос' } })).status).toBe(403)
    const task = await createSumTask(payload)
    expect((await rest('POST', '/bookmarks', { token, body: { task: task.id } })).status).toBe(201)
    expect((await rest('GET', '/bookmarks?depth=0', { token })).json.docs).toMatchObject([{ task: task.id }])
  })

  it('публикация родителей и inconsistent section защищают REST даже при explicitallow', async () => {
    const lessonId = tree.lessons[2].id
    await assignment('lessons', lessonId)
    for (const [collection, id] of [['roadmaps', tree.roadmap.id], ['courses', tree.course.id], ['sections', tree.section.id]] as const) {
      await payload.update({ collection, id, data: { isPublished: false } })
      expect((await rest('GET', `/lessons/${lessonId}`, { token })).status).toBe(404)
      await payload.update({ collection, id, data: { isPublished: true } })
    }
    await payload.update({ collection: 'lessons', id: lessonId, data: { section: otherTree.section.id } })
    expect((await rest('GET', `/lessons/${lessonId}`, { token })).status).toBe(404)
    await payload.update({ collection: 'lessons', id: lessonId, data: { section: tree.section.id } })
  })

  it('обе связи темы разрешены, неправильный roadmap темы не даёт доступ', async () => {
    const node = await payload.create({ collection: 'roadmap-nodes', data: { nodeId: uid('policy-node'), label: 'Тема', nodeType: 'topic', roadmap: otherTree.roadmap.id, course: otherTree.course.id, positionX: 0, positionY: 0 } })
    await assignment('roadmap-nodes', node.id)
    expect((await rest('GET', `/lessons/${otherTree.lessons[0].id}`, { token })).status).toBe(200)
    try {
      await payload.update({ collection: 'roadmap-nodes', id: node.id, data: { roadmap: tree.roadmap.id } })
      expect((await rest('GET', `/lessons/${otherTree.lessons[0].id}`, { token })).status).toBe(404)
    } finally {
      // Other suites inspect the shared catalog; do not leave this deliberately corrupt fixture behind.
      await payload.delete({ collection: 'roadmap-nodes', id: node.id })
    }
  })

  it('аудит неизменяемый, unique rule key вычисляется сервером, истёкшие назначения не работают', async () => {
    const result = await rest('POST', '/learning-access-grants', { token: adminToken, body: { user: student.id, target: { relationTo: 'courses', value: otherTree.course.id }, effect: 'allow', ruleKey: 'forged', expiresAt: new Date(Date.now() - 1000).toISOString() } })
    expect(result.status).toBe(201)
    expect(result.json.doc).toMatchObject({ ruleKey: `${student.id}:courses:${otherTree.course.id}` })
    expect((await rest('GET', `/lessons/${otherTree.lessons[0].id}`, { token })).status).toBe(404)
    const audits = await payload.find({ collection: 'learning-access-audit', where: { userId: { equals: student.id } }, depth: 0 })
    expect(audits.totalDocs).toBeGreaterThanOrEqual(6)
    expect((await rest('PATCH', `/learning-access-audit/${audits.docs[0].id}`, { token: adminToken, body: { effect: 'allow' } })).status).toBe(403)
    expect((await rest('DELETE', `/learning-access-audit/${audits.docs[0].id}`, { token: adminToken })).status).toBe(403)
    expect((await rest('POST', '/learning-access-grants', { token: adminToken, body: { user: student.id, target: { relationTo: 'courses', value: otherTree.course.id }, effect: 'deny', ruleKey: 'another' } })).status).toBe(400)
  })

  it('удаление lesson очищает grant в той же транзакции, история аудита остаётся', async () => {
    const req = await createLocalReq({ user: admin }, payload)
    await payload.delete({ collection: 'lessons', id: tree.lessons[0].id, req })
    const grants = await payload.find({ collection: 'learning-access-grants', where: { user: { equals: student.id } }, depth: 0 })
    expect(grants.docs.some((item) => item.target.relationTo === 'lessons' && item.target.value === tree.lessons[0].id)).toBe(false)
    expect(await canAccessLesson(payload, student, tree.lessons[0].id)).toBe(false)
    expect((await payload.count({ collection: 'learning-access-audit', where: { and: [{ operation: { equals: 'delete' } }, { targetType: { equals: 'lessons' } }, { targetId: { equals: tree.lessons[0].id } }] } })).totalDocs).toBe(1)
  })

  it('request cache повторно используется, но запись назначения немедленно инвалидирует его', async () => {
    const req = await createLocalReq({ user: admin }, payload)
    const first = await getLearningAccess(payload, student, req)
    expect(await getLearningAccess(payload, student, req)).toBe(first)
    expect(first.canAccessCourse(otherTree.course.id)).toBe(false)
    const grants = await payload.find({ collection: 'learning-access-grants', where: { and: [{ user: { equals: student.id } }, { ruleKey: { equals: `${student.id}:courses:${otherTree.course.id}` } }] }, depth: 0 })
    await payload.update({ collection: 'learning-access-grants', id: grants.docs[0].id, data: { expiresAt: null }, req })
    const updated = await getLearningAccess(payload, student, req)
    expect(updated).not.toBe(first)
    expect(updated.canAccessCourse(otherTree.course.id)).toBe(true)
  })
})
