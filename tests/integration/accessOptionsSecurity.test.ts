import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import { notificationLinkIsVisible } from '@/server/notification-visibility'
import { createAdmin, createCourseTree, createStudent, createSumTask, getTestPayload, login, rest, uid, type TestUser } from './helpers/payload'

let payload: Payload
let admin: TestUser
beforeAll(async () => { payload = await getTestPayload(); admin = await createAdmin(payload) })
const adminReq = () => createLocalReq({ user: admin }, payload)

describe('защита персональных назначений и сохранённых данных', () => {
  it('новые настройки остаются после входа, XP, профиля и выхода', async () => {
    const student = await createStudent(payload)
    await payload.update({ collection: 'users', id: student.id, req: await adminReq(), data: { learningCatalogVisibility: 'assigned', trainerAccessMode: 'disabled' } })
    const token = await login(payload, student)
    await rest('PATCH', `/users/${student.id}`, { token, body: { firstName: 'Профиль', learningCatalogVisibility: 'catalog', trainerAccessMode: 'all' } })
    await payload.update({ collection: 'users', id: student.id, context: { skipHooks: true }, data: { totalPoints: 7 } })
    const fresh = await payload.findByID({ collection: 'users', id: student.id })
    expect(fresh).toMatchObject({ learningCatalogVisibility: 'assigned', trainerAccessMode: 'disabled', totalPoints: 7, firstName: 'Профиль' })
    await rest('POST', '/users/logout', { token })
    await login(payload, student)
    expect(await payload.findByID({ collection: 'users', id: student.id })).toMatchObject({ learningCatalogVisibility: 'assigned', trainerAccessMode: 'disabled' })
  })

  it('закладки на закрытую задачу нельзя создать, а сохранённая исчезает после отзыва', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'assigned', trainerAccessMode: 'assigned', learningCatalogVisibility: 'assigned' })
    const task = await createSumTask(payload)
    const topicId = typeof task.topic === 'number' ? task.topic : task.topic.id
    await payload.update({ collection: 'trainer-topics', id: topicId, data: { description: 'PRIVATE-UNASSIGNED-TASK-TITLES' } })
    const token = await login(payload, student)
    expect((await rest('POST', '/bookmarks', { token, body: { user: student.id, task: task.id } })).status).toBe(403)
    const rule = await payload.create({ collection: 'learning-access-grants', req: await adminReq(), data: { user: student.id, target: { relationTo: 'trainer-tasks', value: task.id }, effect: 'allow', ruleKey: 'server-generated' } })
    expect((await rest('POST', '/bookmarks', { token, body: { user: student.id, task: task.id } })).status).toBe(201)
    const visibleTopic = await rest('GET', `/trainer-topics/${topicId}`, { token })
    expect(visibleTopic.status).toBe(200)
    expect(visibleTopic.json.description).toBeNull()
    expect((await rest('GET', '/bookmarks?depth=3', { token })).json.totalDocs).toBe(1)
    await payload.delete({ collection: 'learning-access-grants', id: rule.id, req: await adminReq() })
    expect((await rest('GET', '/bookmarks?depth=3', { token })).json.docs).toEqual([])
  })

  it('уведомление о неназначенном уроке не выдаёт название, текст и ссылку', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned' })
    const tree = await createCourseTree(payload)
    const note = await payload.create({ collection: 'notifications', req: await adminReq(), context: { skipHooks: true }, data: { user: student.id, title: `PRIVATE-${uid('title')}`, message: 'PRIVATE-LESSON-TEXT', type: 'comment', link: `/lessons/${tree.lessons[0].slug}` } })
    const token = await login(payload, student)
    const read = await rest('GET', `/notifications/${note.id}`, { token })
    expect(read.status).toBe(200)
    expect(JSON.stringify(read.json)).not.toContain('PRIVATE-')
    expect(read.json.link).toBeNull()
    expect(await notificationLinkIsVisible(payload, student.id, note.link)).toBe(false)
    expect((await payload.findByID({ collection: 'notifications', id: note.id })).title).toBe(note.title)
    await payload.create({ collection: 'learning-access-grants', req: await adminReq(), data: { user: student.id, target: { relationTo: 'lessons', value: tree.lessons[0].id }, effect: 'allow', ruleKey: 'server-generated' } })
    expect((await rest('GET', `/notifications/${note.id}`, { token })).json.title).toBe(note.title)
    expect(await notificationLinkIsVisible(payload, student.id, note.link)).toBe(true)
  })
})

describe('уведомления о комнатах собеседования', () => {
  it('не раскрывает неизвестный источник и отозванную задачу даже при общем доступе к тренажёру', async () => {
    const student = await createStudent(payload, { learningCatalogVisibility: 'assigned', trainerAccessMode: 'all' })
    const task = await createSumTask(payload)
    const legacy = await payload.create({ collection: 'interview-rooms', data: { token: crypto.randomUUID(), owner: student.id, members: [student.id], title: 'Неизвестный источник', language: 'js', version: 1 } })
    expect(await notificationLinkIsVisible(payload, student.id, `/trainer/interview/${legacy.token}`)).toBe(false)
    const room = await payload.create({ collection: 'interview-rooms', data: { token: crypto.randomUUID(), sourceTaskKnown: true, sourceTaskId: task.id, owner: student.id, members: [student.id], title: 'Известный источник', language: 'js', version: 1 } })
    expect(await notificationLinkIsVisible(payload, student.id, `/trainer/interview/${room.token}`)).toBe(true)
    await payload.create({ collection: 'learning-access-grants', req: await adminReq(), data: { user: student.id, target: { relationTo: 'trainer-tasks', value: task.id }, effect: 'deny', ruleKey: 'server-generated' } })
    expect(await notificationLinkIsVisible(payload, student.id, `/trainer/interview/${room.token}`)).toBe(false)
    const other = await createStudent(payload)
    expect(await notificationLinkIsVisible(payload, other.id, `/trainer/interview/${room.token}`)).toBe(false)
  })
})
