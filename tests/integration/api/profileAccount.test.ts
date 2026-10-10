import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { GET, PATCH } from '@/app/api/profile/route'
import { POST } from '@/app/api/profile/password/route'
import { canAccessLesson } from '@/server/learning-access'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, uid } from '../helpers/payload'

let payload: Payload
beforeAll(async () => { payload = await getTestPayload() })

function request(token?: string, data?: unknown, path = '/profile', origin = 'http://lms.test'): Request {
  return new Request(`http://lms.test/api${path}`, { method: data === undefined ? 'GET' : path.endsWith('password') ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json', Origin: origin, ...(token ? { Authorization: `JWT ${token}` } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
}

async function auth(token: string) { return payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) }) }

describe('персональный профиль и безопасность учётной записи', () => {
  it('требует auth и same-origin, возвращает только DTO своего пользователя', async () => {
    expect((await GET(request())).status).toBe(401)
    expect((await PATCH(request(undefined, { firstName: 'Имя' }))).status).toBe(401)
    const user = await createStudent(payload)
    const token = await login(payload, user)
    expect((await PATCH(request(token, { firstName: 'Новое' }, '/profile', 'https://other.test'))).status).toBe(403)
    const response = await GET(request(token))
    expect(response.headers.get('cache-control')).toContain('no-store')
    const body = await response.json() as { profile: Record<string, unknown> }
    expect(Object.keys(body.profile).sort()).toEqual(['avatar', 'bio', 'email', 'firstName', 'id', 'lastName', 'telegram'])
    expect(body.profile.id).toBe(user.id)
  })

  it('сохраняет имена, bio и безопасный Telegram; отвергает чужой id и привилегии', async () => {
    const user = await createStudent(payload)
    const token = await login(payload, user)
    const saved = await PATCH(request(token, { firstName: '  Иван ', lastName: ' Петров ', bio: ' Разработчик ', telegram: '@ivan_dev' }))
    expect(saved.status).toBe(200)
    expect((await saved.json()).profile).toMatchObject({ firstName: 'Иван', lastName: 'Петров', bio: 'Разработчик', telegram: 'https://t.me/ivan_dev' })
    expect((await PATCH(request(token, { firstName: 'Новое имя' }))).status).toBe(200)
    expect((await payload.findByID({ collection: 'users', id: user.id })).telegram).toBe('https://t.me/ivan_dev')
    for (const data of [{ id: user.id + 1 }, { role: 'admin' }, { totalPoints: 9999 }, { learningAccessMode: 'all' }, { sessions: [] }, { telegram: 'https://evil.test/test' }, { telegram: 'https://t.me/ivan_dev?x=1' }, { firstName: '' }, { bio: 'x'.repeat(501) }]) {
      expect((await PATCH(request(token, data))).status).toBe(400)
    }
    expect((await PATCH(request(token, { bio: null, telegram: null, avatar: null }))).status).toBe(200)
    expect((await PATCH(request(token, { firstName: 'Имя' }))).status).toBe(200)
    const actual = await payload.findByID({ collection: 'users', id: user.id })
    expect(actual).toMatchObject({ telegram: null, bio: null, avatar: null, role: 'student', totalPoints: 0 })
  })

  it('закрывает direct REST обход email/password и spoof context; admin management другого пользователя сохранён', async () => {
    const user = await createStudent(payload)
    const other = await createStudent(payload)
    const token = await login(payload, user)
    for (const body of [{ password: 'Bypass-Test-123' }, { email: `${uid('bypass')}@lms.test` }, { password: 'Bypass-Test-123', context: { profileCredentialChange: true, currentPassword: user.password } }]) {
      expect((await rest('PATCH', `/users/${user.id}`, { token, body })).status).toBe(403)
    }
    expect((await rest('PATCH', `/users/${other.id}`, { token, body: { firstName: 'Чужой' } })).status).toBe(403)
    const admin = await createAdmin(payload)
    const adminToken = await login(payload, admin)
    expect((await rest('PATCH', `/users/${user.id}`, { token: adminToken, body: { password: 'Admin-Changed-123' } })).status).toBe(200)
    expect(await login(payload, { email: user.email, password: 'Admin-Changed-123' })).toEqual(expect.any(String))
  })

  it('bulk REST администратора не меняет его собственный пароль без challenge после другого документа', async () => {
    const other = await createStudent(payload)
    const admin = await createAdmin(payload)
    const token = await login(payload, admin)
    const password = 'Bulk-New-Password-123'
    const response = await rest('PATCH', `/users?where[id][in]=${other.id},${admin.id}&sort=id`, { token, body: { password } })
    expect(response.status).toBe(400)
    expect(response.json.errors).toEqual(expect.arrayContaining([expect.objectContaining({ id: admin.id })]))
    expect(response.json.docs).toEqual(expect.arrayContaining([expect.objectContaining({ id: other.id })]))
    expect((await rest('POST', '/users/login', { body: { email: admin.email, password } })).status).toBe(401)
    expect(await login(payload, admin)).toEqual(expect.any(String))
    expect(await login(payload, { email: other.email, password })).toEqual(expect.any(String))
  })

  it('email требует current password; дубликат409, обновлённая cookie/identity, другие сессии отзываются', async () => {
    const user = await createStudent(payload)
    const other = await createStudent(payload)
    const token = await login(payload, user)
    const device2 = await login(payload, user)
    const email = `${uid('newemail')}@lms.test`
    expect((await PATCH(request(token, { email }))).status).toBe(400)
    expect((await PATCH(request(token, { email, currentPassword: 'Incorrect-123' }))).status).toBe(403)
    expect((await PATCH(request(token, { email: other.email, currentPassword: user.password }))).status).toBe(409)
    expect((await auth(device2)).user?.id).toBe(user.id)
    const response = await PATCH(request(token, { email: email.toUpperCase(), currentPassword: user.password }))
    expect(response.status).toBe(200)
    const result = await response.json() as { token: string; profile: { email: string } }
    expect(result.profile.email).toBe(email)
    expect(response.headers.get('set-cookie')).toContain(`payload-token=${result.token}`)
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect((await auth(result.token)).user?.email).toBe(email)
    expect((await auth(device2)).user).toBeNull()
    expect((await rest('POST', '/users/refresh-token', { token: device2 })).status).toBe(403)
    expect((await rest('POST', '/users/login', { body: { email: user.email, password: user.password } })).status).toBe(401)
    expect(await login(payload, { email, password: user.password })).toEqual(expect.any(String))
  })

  it('password update проверяет challenge+strength, сохраняет прогресс/доступ и отвергает прежний пароль', async () => {
    const user = await createStudent(payload, { learningAccessMode: 'assigned', totalPoints: 72 })
    const tree = await createCourseTree(payload)
    const admin = await createAdmin(payload)
    await payload.create({ collection: 'learning-access-grants', user: admin, data: { user: user.id, target: { relationTo: 'courses', value: tree.course.id }, effect: 'allow', ruleKey: `${user.id}:courses:${tree.course.id}` } })
    const token = await login(payload, user)
    const device2 = await login(payload, user)
    expect((await POST(request(token, { currentPassword: user.password, newPassword: 'weak' }, '/profile/password'))).status).toBe(400)
    expect((await POST(request(token, { currentPassword: 'Wrong-Password-1', newPassword: 'New-Password-123' }, '/profile/password'))).status).toBe(403)
    const response = await POST(request(token, { currentPassword: user.password, newPassword: 'New-Password-123' }, '/profile/password'))
    expect(response.status).toBe(200)
    const result = await response.json() as { token: string; ok: boolean }
    expect(result.ok).toBe(true)
    expect((await auth(result.token)).user?.id).toBe(user.id)
    expect((await auth(device2)).user).toBeNull()
    expect((await rest('POST', '/users/login', { body: { email: user.email, password: user.password } })).status).toBe(401)
    const newToken = await login(payload, { email: user.email, password: 'New-Password-123' })
    const actual = await payload.findByID({ collection: 'users', id: user.id })
    expect(actual).toMatchObject({ totalPoints: 72, learningAccessMode: 'assigned', role: 'student' })
    expect(await canAccessLesson(payload, { id: user.id, role: 'student' }, tree.lessons[0].id)).toBe(true)
    expect((await rest('POST', '/user-progress', { token: newToken, body: { lesson: tree.lessons[0].id, isCompleted: true } })).status).toBe(201)
  })

  it('вход со старым email, начатый до изменения, не выдаёт новую сессию после изменения', async () => {
    const user = await createStudent(payload)
    const token = await login(payload, user)
    const email = `${uid('race-email')}@lms.test`
    let enter: () => void = () => undefined
    let release: () => void = () => undefined
    const entered = new Promise<void>((resolve) => { enter = resolve })
    const released = new Promise<void>((resolve) => { release = resolve })
    const findOne = payload.db.findOne.bind(payload.db)
    const spy = vi.spyOn(payload.db, 'findOne').mockImplementation(async (args) => {
      const result = await findOne(args)
      if (args.collection === 'users' && JSON.stringify(args.where ?? {}).includes(user.email)) { enter(); await released }
      return result
    })
    let pending: ReturnType<typeof rest> | undefined
    try {
      pending = rest('POST', '/users/login', { body: { email: user.email, password: user.password } })
      await Promise.race([entered, pending.then((result) => { throw new Error(`Login завершился до точки гонки: ${result.status}`) })])
      const updated = await PATCH(request(token, { email, currentPassword: user.password }))
      expect(updated.status).toBe(200)
      const result = await updated.json() as { token: string }
      release()
      expect((await pending).status).toBe(401)
      spy.mockRestore()
      const actual = await payload.findByID({ collection: 'users', id: user.id })
      expect(actual.email).toBe(email)
      expect(actual.sessions).toHaveLength(1)
      expect((await auth(result.token)).user?.email).toBe(email)
      expect(await login(payload, { email, password: user.password })).toEqual(expect.any(String))
    } finally { release(); if (pending) await pending; spy.mockRestore() }
  })

  it('не позволяет выбрать чужую private media как аватар', async () => {
    const user = await createStudent(payload)
    const token = await login(payload, user)
    const admin = await createAdmin(payload)
    const media = await payload.create({ collection: 'media', user: admin, data: { alt: 'Чужая картинка' }, file: { name: `${uid('avatar')}.png`, mimetype: 'image/png', size: 68, data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR7cAAAAASUVORK5CYII=', 'base64') } })
    expect((await PATCH(request(token, { avatar: media.id }))).status).toBe(403)
    expect((await payload.findByID({ collection: 'users', id: user.id })).avatar).toBeNull()
  })
})
