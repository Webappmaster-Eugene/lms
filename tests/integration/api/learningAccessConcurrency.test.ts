import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { CollectionAfterLogoutHook, CollectionBeforeChangeHook, Payload } from 'payload'

import { POST as changeProfilePassword } from '@/app/api/profile/password/route'
import { GET, PUT } from '@/app/api/manage/learning-access/route'
import type { AssignmentSnapshot } from '@/components/learning-access/contracts'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, type CourseTree, type TestUser } from '../helpers/payload'
import { canAccessLesson } from '@/server/learning-access'

let payload: Payload
let admin: TestUser
let adminToken: string
let tree: CourseTree

function request(method: 'GET' | 'PUT', userId: number, data?: unknown) {
  return new Request(`http://lms.test/api/manage/learning-access?user=${userId}`, { method, headers: { Authorization: `JWT ${adminToken}`, 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
}

async function snapshot(userId: number): Promise<AssignmentSnapshot> {
  const response = await GET(request('GET', userId))
  expect(response.status).toBe(200)
  return await response.json() as AssignmentSnapshot
}

/** Pause the real REST operation after Payload has filled omitted fields, before our late lock. */
function pauseUpdate(collection: 'users' | 'learning-access-grants', id: number, key: string, marker: string) {
  let enter: () => void = () => undefined
  let release: () => void = () => undefined
  const entered = new Promise<void>((resolve) => { enter = resolve })
  const released = new Promise<void>((resolve) => { release = resolve })
  const hooks = payload.collections[collection].config.hooks.beforeChange ?? []
  const pause: CollectionBeforeChangeHook = async ({ data, operation, originalDoc }) => {
    if (operation === 'update' && originalDoc?.id === id && data[key] === marker) {
      enter()
      await released
    }
    return data
  }
  hooks.unshift(pause)
  return {
    entered,
    release,
    restore: () => { const index = hooks.indexOf(pause); if (index !== -1) hooks.splice(index, 1) },
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  tree = await createCourseTree(payload)
})

describe('PATCH с устаревшим fallback не восстанавливает отозванный доступ', () => {
  it('частичный User DTO и явно пустой режим не расширяют assigned до all', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'assigned' })
    expect(await canAccessLesson(payload, { id: student.id, role: student.role }, tree.lessons[0].id)).toBe(false)
    await payload.update({ collection: 'users', id: student.id, data: { learningAccessMode: null }, user: admin })
    expect(await canAccessLesson(payload, { id: student.id, role: student.role, learningAccessMode: null }, tree.lessons[0].id)).toBe(false)
  })

  it('подтверждённый пароль профиля реально меняется и timestamps/XP сохраняют работу после fresh merge', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'all' })
    const token = await login(payload, student)
    const current = await payload.findByID({ collection: 'users', id: student.id })
    const password = 'Updated-Test-Pass-2'
    const updated = await changeProfilePassword(new Request('http://lms.test/api/profile/password', { method: 'POST', headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: student.password, newPassword: password }) }))
    expect(updated.status).toBe(200)
    await expect(payload.login({ collection: 'users', data: { email: student.email, password: student.password } })).rejects.toMatchObject({ status: 401 })
    const newToken = await login(payload, { email: student.email, password })
    const actual = await payload.findByID({ collection: 'users', id: student.id })
    expect(Date.parse(actual.updatedAt)).toBeGreaterThanOrEqual(Date.parse(current.updatedAt))
    expect((await rest('POST', '/user-progress', { token: newToken, body: { lesson: tree.lessons[0].id, isCompleted: true } })).status).toBe(201)
    expect((await payload.findByID({ collection: 'users', id: student.id })).totalPoints).toBeGreaterThan(0)
  })

  it.each([false, true])('профиль ученика сохраняет новый assigned, даже при mode в сыром PATCH: %s', async (spoofMode) => {
    const student = await createStudent(payload, { learningAccessMode: 'all' })
    const token = await login(payload, student)
    const firstName = 'Профиль после отзыва'
    const pause = pauseUpdate('users', student.id, 'firstName', firstName)
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('PATCH', `/users/${student.id}`, { token, body: { firstName, ...(spoofMode ? { learningAccessMode: 'all' } : {}) } })
      await Promise.race([pause.entered, pending.then((result) => { throw new Error(`PATCH завершился до блокировки: ${result.status}`) })])
      const before = await snapshot(student.id)
      expect(before.mode).toBe('all')
      expect((await PUT(request('PUT', student.id, { ...before, mode: 'assigned', rules: [] }))).status).toBe(200)
      pause.release()
      expect((await pending).status).toBe(200)
      const actual = await payload.findByID({ collection: 'users', id: student.id })
      expect(actual.learningAccessMode).toBe('assigned')
      expect(actual.firstName).toBe(firstName)
      const audit = await payload.find({ collection: 'learning-access-audit', where: { and: [{ userId: { equals: student.id } }, { operation: { equals: 'mode' } }] }, depth: 0 })
      expect(audit.totalDocs).toBe(1)
      expect(audit.docs[0]).toMatchObject({ previous: { mode: 'all' }, current: { mode: 'assigned' }, effect: 'deny' })
    } finally {
      pause.release()
      if (pending) await pending
      pause.restore()
    }
  })

  it('note-only PATCH сохраняет текущий deny вместо старого allow; аудит содержит фактическое previous', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'assigned' })
    const initial = await snapshot(student.id)
    const created = await PUT(request('PUT', student.id, { ...initial, rules: [{ target: { relationTo: 'courses', value: tree.course.id }, effect: 'allow', startsAt: null, expiresAt: null, note: '' }] }))
    expect(created.status).toBe(200)
    const saved = await created.json() as AssignmentSnapshot
    const rule = saved.rules[0]
    expect(rule.id).toBeTypeOf('number')
    if (rule.id === undefined) throw new Error('Созданное назначение не содержит ID')
    const note = 'Комментарий после отзыва'
    const pause = pauseUpdate('learning-access-grants', rule.id, 'note', note)
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('PATCH', `/learning-access-grants/${rule.id}`, { token: adminToken, body: { note } })
      await Promise.race([pause.entered, pending.then((result) => { throw new Error(`PATCH завершился до блокировки: ${result.status}`) })])
      const current = await snapshot(student.id)
      expect((await PUT(request('PUT', student.id, { ...current, rules: [{ ...current.rules[0], effect: 'deny' }] }))).status).toBe(200)
      pause.release()
      expect((await pending).status).toBe(200)
      const actual = await payload.findByID({ collection: 'learning-access-grants', id: rule.id, depth: 0 })
      expect(actual.effect).toBe('deny')
      expect(actual.note).toBe(note)
      const audit = await payload.find({ collection: 'learning-access-audit', where: { and: [{ grantId: { equals: rule.id } }, { operation: { equals: 'update' } }] }, depth: 0, sort: 'id' })
      expect(audit.docs).toHaveLength(2)
      expect(audit.docs[0]).toMatchObject({ previous: { effect: 'allow' }, effect: 'deny' })
      expect(audit.docs[1]).toMatchObject({ previous: { effect: 'deny' }, effect: 'deny' })
    } finally {
      pause.release()
      if (pending) await pending
      pause.restore()
    }
  })

  it('вход SDK со старой копией User не восстанавливает all после административного отзыва', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'all' })
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    const original = payload.db.findOne.bind(payload.db)
    const spy = vi.spyOn(payload.db, 'findOne').mockImplementation(async (args) => {
      const result = await original(args)
      if (args.collection === 'users' && JSON.stringify(args.where).includes(student.email)) { enter(); await released }
      return result
    })
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('POST', '/users/login', { body: { email: student.email, password: student.password } })
      await Promise.race([entered, pending.then((result) => { throw new Error(`Login завершился до точки гонки: ${result.status}`) })])
      const current = await snapshot(student.id)
      expect((await PUT(request('PUT', student.id, { ...current, mode: 'assigned', rules: [] }))).status).toBe(200)
      release()
      const loggedIn = await pending
      expect(loggedIn.status).toBe(200)
      const token = loggedIn.json.token
      if (typeof token !== 'string') throw new Error('Вход не вернул токен')
      const raw = await original({ collection: 'users', where: { id: { equals: student.id } } })
      expect(raw).toMatchObject({ learningAccessMode: 'assigned' })
      expect((await rest('GET', `/users/${student.id}`, { token })).json).toMatchObject({ learningAccessMode: 'assigned' })
      expect((await rest('GET', `/lessons/${tree.lessons[0].id}`, { token })).status).toBe(404)
      expect(await canAccessLesson(payload, { id: student.id, role: 'student', learningAccessMode: 'all' }, tree.lessons[0].id)).toBe(false)
    } finally { release(); if (pending) await pending; spy.mockRestore() }
  })

  it('выход SDK со старым контекстом входа не восстанавливает all после административного отзыва', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'all' })
    const token = await login(payload, student)
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    const hooks = payload.collections.users.config.hooks.afterLogout ?? []
    const pause: CollectionAfterLogoutHook = async ({ req }) => { if (req.user?.id === student.id) { enter(); await released } }
    hooks.unshift(pause)
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('POST', '/users/logout', { token })
      await Promise.race([entered, pending.then((result) => { throw new Error(`Logout завершился до точки гонки: ${result.status}`) })])
      const current = await snapshot(student.id)
      expect((await PUT(request('PUT', student.id, { ...current, mode: 'assigned', rules: [] }))).status).toBe(200)
      release()
      expect((await pending).status).toBe(200)
      const actual = await payload.findByID({ collection: 'users', id: student.id })
      expect(actual.learningAccessMode).toBe('assigned')
      expect(await canAccessLesson(payload, student, tree.lessons[0].id)).toBe(false)
    } finally { release(); if (pending) await pending; const index = hooks.indexOf(pause); if (index !== -1) hooks.splice(index, 1) }
  })

  it('старый вход администратора не возвращает admin после понижения роли', async () => {
    const formerAdmin = await createAdmin(payload)
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    const original = payload.db.findOne.bind(payload.db)
    const spy = vi.spyOn(payload.db, 'findOne').mockImplementation(async (args) => {
      const result = await original(args)
      if (args.collection === 'users' && JSON.stringify(args.where).includes(formerAdmin.email)) { enter(); await released }
      return result
    })
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('POST', '/users/login', { body: { email: formerAdmin.email, password: formerAdmin.password } })
      await Promise.race([entered, pending.then((result) => { throw new Error(`Login завершился до точки гонки: ${result.status}`) })])
      expect((await rest('PATCH', `/users/${formerAdmin.id}`, { token: adminToken, body: { role: 'student', learningAccessMode: 'assigned' } })).status).toBe(200)
      release()
      const loggedIn = await pending
      expect(loggedIn.status).toBe(200)
      const token = loggedIn.json.token
      if (typeof token !== 'string') throw new Error('Вход не вернул токен')
      const raw = await original({ collection: 'users', where: { id: { equals: formerAdmin.id } } })
      expect(raw).toMatchObject({ role: 'student', learningAccessMode: 'assigned' })
      expect((await rest('GET', `/users/${formerAdmin.id}`, { token })).json).toMatchObject({ role: 'student', learningAccessMode: 'assigned' })
      expect((await GET(new Request(`http://lms.test/api/manage/learning-access?user=${formerAdmin.id}`, { headers: { Authorization: `JWT ${token}` } }))).status).toBe(403)
      expect((await rest('GET', `/users/${admin.id}`, { token })).status).toBe(404)
      expect(await canAccessLesson(payload, { id: formerAdmin.id, role: 'admin', learningAccessMode: 'all' }, tree.lessons[0].id)).toBe(false)
      await expect(payload.findByID({ collection: 'users', id: admin.id, user: formerAdmin, overrideAccess: false })).rejects.toMatchObject({ status: 404 })
      const protectedFields = await payload.update({ collection: 'users', id: formerAdmin.id, user: formerAdmin, overrideAccess: false, data: { role: 'admin', learningAccessMode: 'all', totalPoints: 999, isActive: false } })
      expect(protectedFields).toMatchObject({ role: 'student', learningAccessMode: 'assigned', totalPoints: 0, isActive: true })
    } finally { release(); if (pending) await pending; spy.mockRestore() }
  })

  it('старый административный PATCH не повышает себя обратно после понижения роли во время ожидания', async () => {
    const formerAdmin = await createAdmin(payload)
    const token = await login(payload, formerAdmin)
    const firstName = 'Старый административный PATCH'
    const pause = pauseUpdate('users', formerAdmin.id, 'firstName', firstName)
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('PATCH', `/users/${formerAdmin.id}`, { token, body: { firstName, role: 'admin', learningAccessMode: 'all', totalPoints: 999 } })
      await Promise.race([pause.entered, pending.then((result) => { throw new Error(`PATCH завершился до блокировки: ${result.status}`) })])
      expect((await rest('PATCH', `/users/${formerAdmin.id}`, { token: adminToken, body: { role: 'student', learningAccessMode: 'assigned' } })).status).toBe(200)
      pause.release()
      expect((await pending).status).toBe(200)
      expect(await payload.findByID({ collection: 'users', id: formerAdmin.id })).toMatchObject({ role: 'student', learningAccessMode: 'assigned', totalPoints: 0, firstName })
      const audit = await payload.find({ collection: 'learning-access-audit', where: { and: [{ userId: { equals: formerAdmin.id } }, { targetType: { equals: 'users.role' } }] } })
      expect(audit.docs).toHaveLength(1)
      expect(audit.docs[0]).toMatchObject({ previous: { role: 'admin' }, current: { role: 'student' }, effect: 'deny' })
    } finally { pause.release(); if (pending) await pending; pause.restore() }
  })

  it('параллельный вход другого устройства не восстанавливает уже отозванную сессию', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'all' })
    const firstToken = await login(payload, student)
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    const original = payload.db.findOne.bind(payload.db)
    const spy = vi.spyOn(payload.db, 'findOne').mockImplementation(async (args) => {
      const result = await original(args)
      if (args.collection === 'users' && JSON.stringify(args.where ?? {}).includes(student.email)) { enter(); await released }
      return result
    })
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('POST', '/users/login', { body: { email: student.email, password: student.password } })
      await Promise.race([entered, pending.then((result) => { throw new Error(`Login завершился до точки гонки: ${result.status}`) })])
      expect((await rest('POST', '/users/logout', { token: firstToken })).status).toBe(200)
      expect((await payload.auth({ headers: new Headers({ Authorization: `JWT ${firstToken}` }) })).user === null).toBe(true)
      release()
      const second = await pending
      expect(second.status).toBe(200)
      const secondToken = second.json.token
      if (typeof secondToken !== 'string') throw new Error('Вход не вернул токен')
      expect((await payload.auth({ headers: new Headers({ Authorization: `JWT ${firstToken}` }) })).user === null).toBe(true)
      expect((await payload.auth({ headers: new Headers({ Authorization: `JWT ${secondToken}` }) })).user?.id).toBe(student.id)
    } finally { release(); if (pending) await pending; spy.mockRestore() }
  })

  it('отложенный вход старым паролем не восстанавливает пароль и не получает новую сессию', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'all' })
    const newPassword = 'Rotated-Test-Pass-3'
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    const original = payload.db.findOne.bind(payload.db)
    const spy = vi.spyOn(payload.db, 'findOne').mockImplementation(async (args) => {
      const result = await original(args)
      if (args.collection === 'users' && JSON.stringify(args.where ?? {}).includes(student.email)) { enter(); await released }
      return result
    })
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('POST', '/users/login', { body: { email: student.email, password: student.password } })
      await Promise.race([entered, pending.then((result) => { throw new Error(`Login завершился до точки гонки: ${result.status}`) })])
      expect((await rest('PATCH', `/users/${student.id}`, { token: adminToken, body: { password: newPassword } })).status).toBe(200)
      release()
      expect((await pending).status).toBe(401)
      spy.mockRestore()
      expect((await rest('POST', '/users/login', { body: { email: student.email, password: student.password } })).status).toBe(401)
      expect((await rest('POST', '/users/login', { body: { email: student.email, password: newPassword } })).status).toBe(200)
    } finally { release(); if (pending) await pending; spy.mockRestore() }
  })

  it('полная запись SDK при пороге неправильных паролей сохраняет новый пароль и счётчик блокировки', async () => {
    const student = await createStudent(payload)
    await login(payload, student)
    const password = 'Threshold-Rotated-Pass-4'
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    const original = payload.db.findOne.bind(payload.db)
    const spy = vi.spyOn(payload.db, 'findOne').mockImplementation(async (args) => {
      const result = await original(args)
      if (args.collection === 'users' && JSON.stringify(args.where ?? {}).includes(student.email)) { enter(); await released }
      return result
    })
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('POST', '/users/login', { body: { email: student.email, password: 'Incorrect-Password' } })
      await Promise.race([entered, pending.then((result) => { throw new Error(`Login завершился до точки гонки: ${result.status}`) })])
      await payload.update({ collection: 'users', id: student.id, user: admin, data: { password, loginAttempts: 4, lockUntil: null } })
      release()
      expect((await pending).status).toBe(401)
      spy.mockRestore()
      const current = await original({ collection: 'users', where: { id: { equals: student.id } } })
      expect(current).toMatchObject({ loginAttempts: 5 })
      await payload.update({ collection: 'users', id: student.id, user: admin, data: { loginAttempts: 0, lockUntil: null } })
      expect((await rest('POST', '/users/login', { body: { email: student.email, password } })).status).toBe(200)
      expect((await rest('POST', '/users/login', { body: { email: student.email, password: student.password } })).status).toBe(401)
    } finally { release(); if (pending) await pending; spy.mockRestore() }
  })

  it('выключенный администратором аккаунт теряет прежний JWT и не может войти', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    expect((await rest('PATCH', `/users/${student.id}`, { token: adminToken, body: { isActive: false } })).status).toBe(200)
    expect((await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })).user === null).toBe(true)
    expect((await rest('POST', '/users/login', { body: { email: student.email, password: student.password } })).status).toBe(401)
    expect((await GET(new Request(`http://lms.test/api/manage/learning-access?user=${student.id}`, { headers: { Authorization: `JWT ${token}` } }))).status).toBe(401)
  })

  it('refresh после конкурентного выхода получает 403 вместо ошибки undefinedsession', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    const hooks = payload.collections.users.config.hooks.beforeOperation ?? []
    const pause: typeof hooks[number] = async ({ operation, req }) => { if (operation === 'refresh' && req.user?.id === student.id) { enter(); await released } }
    hooks.unshift(pause)
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('POST', '/users/refresh-token', { token })
      await Promise.race([entered, pending.then((result) => { throw new Error(`Refresh завершился до точки гонки: ${result.status}`) })])
      expect((await rest('POST', '/users/logout', { token })).status).toBe(200)
      release()
      expect((await pending).status).toBe(403)
    } finally { release(); if (pending) await pending; const index = hooks.indexOf(pause); if (index !== -1) hooks.splice(index, 1) }
  })

  it('два параллельных успешных входа сохраняют обе сессии устройств', async () => {
    const student = await createStudent(payload)
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const bothRead = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    let reads = 0
    const original = payload.db.findOne.bind(payload.db)
    const spy = vi.spyOn(payload.db, 'findOne').mockImplementation(async (args) => {
      const result = await original(args)
      if (args.collection === 'users' && JSON.stringify(args.where ?? {}).includes(student.email)) {
        reads += 1
        if (reads === 2) enter()
        await released
      }
      return result
    })
    const pending = Promise.all([rest('POST', '/users/login', { body: { email: student.email, password: student.password } }), rest('POST', '/users/login', { body: { email: student.email, password: student.password } })])
    try {
      await Promise.race([bothRead, pending.then(() => { throw new Error('Входы завершились до точки гонки') })])
      release()
      const results = await pending
      expect(results.map((result) => result.status)).toEqual([200, 200])
      for (const result of results) {
        const token = result.json.token
        if (typeof token !== 'string') throw new Error('Вход не вернул токен')
        expect((await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })).user?.id).toBe(student.id)
      }
    } finally { release(); await pending; spy.mockRestore() }
  })
})
