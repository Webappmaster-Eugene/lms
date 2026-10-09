import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { APIError, createLocalReq, type CollectionBeforeChangeHook, type Payload } from 'payload'
import { GET, POST, PUT } from '@/app/api/manage/learning-access/route'
import type { AssignmentPreview, AssignmentSnapshot } from '@/components/learning-access/contracts'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, type TestUser } from '../helpers/payload'

let payload: Payload
let admin: TestUser
let student: TestUser
let adminToken: string
let studentToken: string
let topicId: number
let taskId: number

function request(method: 'GET' | 'POST' | 'PUT', data?: unknown, token = adminToken, query = `user=${student.id}`) {
  return new Request(`http://lms.test/api/manage/learning-access?${query}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `JWT ${token}` }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
}
async function current() { return await (await GET(request('GET'))).json() as AssignmentSnapshot }

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  await createCourseTree(payload)
  const topic = await payload.create({ collection: 'trainer-topics', data: { title: 'Админские назначения тренажёра', slug: `assignment-topic-${Date.now()}`, category: 'javascript', isPublished: true } })
  topicId = topic.id
  const task = await payload.create({ collection: 'trainer-tasks', data: { title: 'Закрытый стартовый код', slug: `assignment-task-${Date.now()}`, topic: topicId, starterCode: 'PRIVATE_STARTER', difficulty: 'easy', languages: ['js'], checkMode: 'stdout', expectedOutput: 'PRIVATE_OUTPUT', isPublished: true } })
  taskId = task.id
})
beforeEach(async () => {
  student = await createStudent(payload)
  studentToken = await login(payload, student)
})

describe('персональная видимость и тренажёр: административный контракт', () => {
  it('сохраняет настройки без смены режима курсов, старое PUT не возвращает прежние значения', async () => {
    const original = await current()
    const saved = await PUT(request('PUT', { ...original, catalogVisibility: 'assigned', trainerMode: 'disabled' }))
    expect(saved.status).toBe(200)
    const first = await saved.json() as AssignmentSnapshot
    expect(first).toMatchObject({ mode: original.mode, catalogVisibility: 'assigned', trainerMode: 'disabled', rules: [] })
    expect(first.revision).not.toBe(original.revision)
    const oldClient = { userId: first.userId, mode: first.mode, revision: first.revision, rules: first.rules }
    expect((await PUT(request('PUT', oldClient))).status).toBe(200)
    expect(await current()).toMatchObject({ catalogVisibility: 'assigned', trainerMode: 'disabled' })
    expect((await PUT(request('PUT', { ...original, trainerMode: 'all' }))).status).toBe(409)
    const audit = await payload.find({ collection: 'learning-access-audit', where: { userId: { equals: student.id } }, depth: 0 })
    expect(audit.totalDocs).toBeGreaterThan(0)
  })

  it('ученик не может менять свои настройки через manager и прямой REST', async () => {
    expect((await PUT(request('PUT', { ...(await current()), catalogVisibility: 'catalog', trainerMode: 'all' }, studentToken))).status).toBe(403)
    expect((await PUT(request('PUT', { ...(await current()), catalogVisibility: 'assigned', trainerMode: 'disabled' }))).status).toBe(200)
    const tampered = await rest('PATCH', `/users/${student.id}`, { token: studentToken, body: { learningCatalogVisibility: 'catalog', trainerAccessMode: 'all' } })
    expect(tampered.status).toBe(200)
    expect(await current()).toMatchObject({ catalogVisibility: 'assigned', trainerMode: 'disabled' })
  })

  it('пониженный администратор со старым JWT не может изменить новые настройки', async () => {
    const revoked = await createAdmin(payload)
    const revokedToken = await login(payload, revoked)
    await payload.update({ collection: 'users', id: revoked.id, data: { role: 'student' }, req: await createLocalReq({ user: admin }, payload) })
    expect((await PUT(request('PUT', { ...(await current()), catalogVisibility: 'catalog', trainerMode: 'all' }, revokedToken))).status).toBe(403)
  })

  it('выбор задачи фильтрует тему и не выдаёт код или ответы даже администратору в picker', async () => {
    const result = await GET(request('GET', undefined, adminToken, `kind=targets&type=trainer-tasks&parent=${topicId}`))
    expect(result.status).toBe(200)
    const body = await result.json() as { docs: Record<string, unknown>[] }
    expect(body.docs.map((doc) => doc.id)).toContain(taskId)
    expect(JSON.stringify(body)).not.toContain('PRIVATE_')
    for (const doc of body.docs) expect(Object.keys(doc).sort()).toEqual(['id', 'published', 'title'])
  })

  it('preview учитывает тему, исключение задачи и абсолютное выключение без записи', async () => {
    const original = await current()
    const rules = [{ target: { relationTo: 'trainer-topics', value: topicId }, effect: 'allow', startsAt: null, expiresAt: null, note: '' }]
    const enabled = await POST(request('POST', { ...original, trainerMode: 'assigned', rules }))
    expect(enabled.status).toBe(200)
    const preview = await enabled.json() as AssignmentPreview
    expect(preview.trainer.availableCount).toBeGreaterThan(0)
    const disabled = await POST(request('POST', { ...original, trainerMode: 'disabled', rules }))
    expect((await disabled.json() as AssignmentPreview).trainer.availableCount).toBe(0)
    const denied = await POST(request('POST', { ...original, trainerMode: 'assigned', rules: [...rules, { ...rules[0], target: { relationTo: 'trainer-tasks', value: taskId }, effect: 'deny' }] }))
    expect((await denied.json() as AssignmentPreview).trainer.availableCount).toBe(preview.trainer.availableCount - 1)
    expect((await current()).revision).toBe(original.revision)
  })

  it('ошибка сохранения пользователя откатывает назначения и обе настройки', async () => {
    const original = await current()
    const reject: CollectionBeforeChangeHook = ({ data }) => { if (data.trainerAccessMode === 'disabled') throw new APIError('Проверка атомарного отката настроек', 400); return data }
    const hooks = payload.collections.users.config.hooks.beforeChange
    hooks.push(reject)
    try {
      const changed = await PUT(request('PUT', { ...original, catalogVisibility: 'assigned', trainerMode: 'disabled', rules: [{ target: { relationTo: 'trainer-tasks', value: taskId }, effect: 'allow', startsAt: null, expiresAt: null, note: '' }] }))
      expect(changed.status).toBe(400)
      expect(await current()).toMatchObject({ revision: original.revision, catalogVisibility: original.catalogVisibility, trainerMode: original.trainerMode, rules: [] })
      expect((await payload.count({ collection: 'learning-access-audit', where: { userId: { equals: student.id } } })).totalDocs).toBe(0)
    } finally { hooks.splice(hooks.indexOf(reject), 1) }
  })
})
