import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { captureEmails, createAdmin, createCourseTree, createStudent, createSumTask, getTestPayload, login, rest, type TestUser } from '../helpers/payload'

/**
 * REST API Payload через тот же обработчик, что стоит за /api/[...slug]
 * (handleEndpoints), без HTTP-сервера. HTTP-уровень (cookie, GraphQL,
 * заголовки) проверяют e2e-тесты в tests/e2e/api.
 */
let payload: Payload
let student: TestUser
let admin: TestUser
let studentToken: string
let adminToken: string

beforeAll(async () => {
  payload = await getTestPayload()
  student = await createStudent(payload)
  admin = await createAdmin(payload)
  studentToken = await login(payload, student)
  adminToken = await login(payload, admin)
})

describe('аутентификация', () => {
  it('POST /users/login с верным паролем отдаёт токен и пользователя без секретов', async () => {
    const { status, json } = await rest('POST', '/users/login', { body: { email: student.email, password: student.password } })
    expect(status).toBe(200)
    expect(json.token).toEqual(expect.any(String))
    expect(json.user).toMatchObject({ email: student.email, role: 'student' })
    expect(json.user).not.toHaveProperty('hash')
  })

  it('POST /users/login с неверным паролем — 401 без подсказки, что именно не так', async () => {
    const { status, json } = await rest('POST', '/users/login', { body: { email: student.email, password: 'nope' } })
    expect(status).toBe(401)
    expect(JSON.stringify(json)).not.toContain('hash')
  })

  it('GET /users/me: аноним получает user=null, вошедший — себя', async () => {
    expect((await rest('GET', '/users/me')).json.user).toBeNull()
    const me = await rest('GET', '/users/me', { token: studentToken })
    expect(me.status).toBe(200)
    expect(me.json.user).toMatchObject({ id: student.id, email: student.email })
  })

  it('поддельный или просроченный токен не даёт доступа', async () => {
    const forged = `${studentToken.slice(0, -4)}AAAA`
    expect((await rest('GET', '/users/me', { token: forged })).json.user).toBeNull()
    expect((await rest('GET', '/courses', { token: forged })).status).toBe(403)
  })

  it('POST /users/logout инвалидирует сессию токена', async () => {
    const token = await login(payload, student)
    expect((await rest('POST', '/users/logout', { token })).status).toBe(200)
    expect((await rest('GET', '/users/me', { token })).json.user).toBeNull()
  })

  it('POST /users/forgot-password отвечает одинаково для существующего и неизвестного email', async () => {
    const mail = captureEmails(payload)
    try {
      const known = await rest('POST', '/users/forgot-password', { body: { email: student.email } })
      const unknown = await rest('POST', '/users/forgot-password', { body: { email: 'ghost@lms.test' } })
      expect(known.status).toBe(200)
      expect(unknown.status).toBe(200)
      expect(known.json.message).toBe(unknown.json.message)
      expect(mail.sent.map((m) => m.to)).toEqual([student.email])
    } finally {
      mail.restore()
    }
  })

  it('POST /users/reset-password с мусорным токеном — ошибка, пароль не меняется', async () => {
    const { status } = await rest('POST', '/users/reset-password', { body: { token: 'garbage', password: 'New-Pass-1' } })
    expect(status).toBeGreaterThanOrEqual(400)
    expect(await login(payload, student)).toBeTruthy()
  })
})

describe('коллекции через REST', () => {
  it('аноним не читает закрытые коллекции, но читает FAQ и медиа', async () => {
    for (const path of ['/courses', '/lessons', '/users', '/trainer-tasks', '/points-transactions', '/globals/site-settings']) {
      expect((await rest('GET', path)).status, path).toBe(403)
    }
    expect((await rest('GET', '/faq-items')).status).toBe(200)
    expect((await rest('GET', '/media')).status).toBe(200)
  })

  it('студент читает курсы, но не может их создавать, менять и удалять', async () => {
    const tree = await createCourseTree(payload, { lessons: 1 })
    expect((await rest('GET', `/courses/${tree.course.id}`, { token: studentToken })).status).toBe(200)
    expect((await rest('POST', '/courses', { token: studentToken, body: { title: 'Взлом', roadmap: tree.roadmap.id } })).status).toBe(403)
    expect((await rest('PATCH', `/courses/${tree.course.id}`, { token: studentToken, body: { title: 'Взлом' } })).status).toBe(403)
    expect((await rest('DELETE', `/courses/${tree.course.id}`, { token: studentToken })).status).toBe(403)
    expect((await payload.findByID({ collection: 'courses', id: tree.course.id })).title).toBe(tree.course.title)
  })

  it('админ создаёт и публикует курс через REST, slug генерируется', async () => {
    const tree = await createCourseTree(payload, { lessons: 0 })
    const created = await rest('POST', '/courses', { token: adminToken, body: { title: 'Курс через REST', roadmap: tree.roadmap.id } })
    expect(created.status).toBe(201)
    const doc = created.json.doc as { id: number; slug: string; isPublished: boolean }
    expect(doc.slug).toMatch(/^kurs-cherez-rest/)
    expect(doc.isPublished).toBe(false)
    const published = await rest('PATCH', `/courses/${doc.id}`, { token: adminToken, body: { isPublished: true } })
    expect((published.json.doc as { isPublished: boolean }).isPublished).toBe(true)
  })

  it('невалидные данные дают 400 со списком полей', async () => {
    const { status, json } = await rest('POST', '/courses', { token: adminToken, body: { description: null } })
    expect(status).toBe(400)
    const paths = ((json.errors as { data?: { errors?: { path: string }[] } }[])[0].data?.errors ?? []).map((e) => e.path)
    expect(paths).toEqual(expect.arrayContaining(['title', 'roadmap']))
  })

  it('PATCH /users/:id студентом: роль не меняется даже при явной попытке', async () => {
    const { status, json } = await rest('PATCH', `/users/${student.id}`, { token: studentToken, body: { role: 'admin', bio: 'хочу в админы' } })
    expect(status).toBe(200)
    expect((json.doc as { role: string; bio: string })).toMatchObject({ role: 'student', bio: 'хочу в админы' })
  })

  it('в выдаче задач тренажёра для студента нет эталона и ожидаемого вывода', async () => {
    const task = await createSumTask(payload)
    const { json } = await rest('GET', `/trainer-tasks/${task.id}`, { token: studentToken })
    for (const field of ['solutionCode', 'solutionCodeTs', 'solutionNotes', 'expectedOutput']) {
      expect(json, field).not.toHaveProperty(field)
    }
    // Открытые кейсы нужны клиенту для «Запустить».
    expect((json.testCases as { hidden: boolean }[]).some((c) => !c.hidden)).toBe(true)
  })

  it.fails('БАГ: скрытые табличные кейсы (hidden) не должны отдаваться студенту через REST', async () => {
    const task = await createSumTask(payload)
    const { json } = await rest('GET', `/trainer-tasks/${task.id}`, { token: studentToken })
    const hidden = (json.testCases as { hidden: boolean; argsCode?: string; expectedCode?: string }[]).filter((c) => c.hidden)
    expect(hidden.filter((c) => c.argsCode !== undefined || c.expectedCode !== undefined)).toEqual([])
  })

  it('студент не может выбрать чужие записи через where-запрос', async () => {
    const other = await createStudent(payload)
    await payload.create({ collection: 'points-transactions', data: { user: other.id, amount: 3, reason: 'admin_adjustment' } })
    const query = `/points-transactions?where[user][equals]=${other.id}`
    const { status, json } = await rest('GET', query, { token: studentToken })
    expect(status).toBe(200)
    expect(json.totalDocs).toBe(0)
  })

  it('GET /access: студенту закрыта админка и запись контента, админу открыта', async () => {
    // Формат прав Payload: либо boolean, либо { permission: boolean }.
    const can = (json: Record<string, unknown>, slug: string, op: string) => {
      const value = (json.collections as Record<string, Record<string, unknown>>)[slug]?.[op]
      return typeof value === 'object' && value !== null ? (value as { permission: boolean }).permission : Boolean(value)
    }
    const asStudent = await rest('GET', '/access', { token: studentToken })
    expect(asStudent.json.canAccessAdmin ?? false).toBe(false)
    expect(can(asStudent.json, 'courses', 'create')).toBe(false)
    expect(can(asStudent.json, 'courses', 'read')).toBe(true)
    const asAdmin = await rest('GET', '/access', { token: adminToken })
    expect(asAdmin.json.canAccessAdmin).toBe(true)
    expect(can(asAdmin.json, 'courses', 'create')).toBe(true)
  })

  it('глобал site-settings: студент читает, но не меняет', async () => {
    expect((await rest('GET', '/globals/site-settings', { token: studentToken })).status).toBe(200)
    expect((await rest('POST', '/globals/site-settings', { token: studentToken, body: { platformName: 'Взлом' } })).status).toBe(403)
  })
})
