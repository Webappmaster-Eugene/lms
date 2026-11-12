import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import { POST as createRoute } from '@/app/api/manage/students/route'
import { PATCH } from '@/app/api/manage/students/[id]/route'
import { POST as freezeRoute } from '@/app/api/manage/students/[id]/freeze/route'
import { DELETE } from '@/app/api/manage/students/[id]/route'
import { resolveBroadcastAudience } from '@/server/broadcasts/service'
import { addMoscowMonths } from '@/lib/account-freeze'
import type { CreatedStudent, StudentProfile } from '@/components/learning-access/contracts'
import { createAdmin, createStudent, getTestPayload, login, uid, type TestUser } from '../helpers/payload'

let payload: Payload
let admin: TestUser
let adminToken: string

const base = 'http://lms.test/api/manage/students'
const headers = (token: string) => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}) })
const context = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })
const freeze = (id: number, data: unknown, token = adminToken) => freezeRoute(new Request(`${base}/${id}/freeze`, { method: 'POST', headers: headers(token), body: JSON.stringify(data) }), context(id))
const patch = (id: number, data: unknown) => PATCH(new Request(`${base}/${id}`, { method: 'PATCH', headers: headers(adminToken), body: JSON.stringify(data) }), context(id))
const authed = async (token: string) => (await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })).user
const periods = (userId: number) => payload.find({ collection: 'account-freezes', where: { user: { equals: userId } }, sort: 'startsAt', depth: 0, overrideAccess: true }).then((result) => result.docs)

async function newStudent(): Promise<CreatedStudent> {
  const response = await createRoute(new Request(base, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ email: `${uid('fr')}@lms.test`.toLowerCase(), firstName: 'Ростислав', lastName: 'Ученик' }) }))
  expect(response.status).toBe(201)
  return await response.json() as CreatedStudent
}

async function profileAfter(response: Response): Promise<StudentProfile> {
  const body = await response.json() as { student?: StudentProfile; error?: string }
  expect(response.status, body.error).toBe(200)
  return body.student as StudentProfile
}

/** Период с произвольными датами: так проверяются истёкший срок и начало в прошлом, как у миграции. */
const insertPeriod = (user: number, startsAt: string, endsAt: string | null, automatic = false) =>
  payload.create({ collection: 'account-freezes', data: { user, startsAt, endsAt, reason: automatic ? 'term' : 'vacation', automatic }, overrideAccess: true, context: { syncAccountFreezes: true } })

const loginError = async (credentials: { email: string; password: string }) => {
  try {
    await login(payload, credentials)
    return null
  } catch (error) {
    return { message: (error as Error).message, status: (error as { status?: number }).status }
  }
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
})

describe('автоматическая заморозка через 6 месяцев', () => {
  it('новому ученику планируется бессрочная заморозка через полгода после создания', async () => {
    const { student } = await newStudent()
    const [planned] = await periods(student.id)
    const created = (await payload.findByID({ collection: 'users', id: student.id, depth: 0, overrideAccess: true })).createdAt
    expect(planned).toMatchObject({ startsAt: addMoscowMonths(created, 6), endsAt: null, reason: 'term', automatic: true })
    expect(student.freeze).toMatchObject({ active: false, plannedAt: planned.startsAt })
  })

  it('администратору и тестовому ученику заморозка не планируется', async () => {
    const other = await createAdmin(payload)
    const tester = await createStudent(payload, { isTestStudent: true })
    expect(await periods(other.id)).toHaveLength(0)
    expect(await periods(tester.id)).toHaveLength(0)
  })

  it('флажок «Тестовый ученик» снимает автоматическую заморозку, снятие флажка возвращает её с запасом на плашку', async () => {
    const { student } = await newStudent()
    expect((await profileAfter(await patch(student.id, { isTestStudent: true })))).toMatchObject({ isTestStudent: true, freeze: { active: false, plannedAt: null } })
    expect(await periods(student.id)).toHaveLength(0)
    const back = await profileAfter(await patch(student.id, { isTestStudent: false }))
    expect(back.freeze.plannedAt).not.toBeNull()
    expect(Date.parse(back.freeze.plannedAt as string)).toBeGreaterThan(Date.now() + 13 * 24 * 60 * 60 * 1000)
  })

  it('флажок завершает и уже начавшуюся автоматическую заморозку, ручную не трогает', async () => {
    const student = await createStudent(payload)
    await insertPeriod(student.id, new Date(Date.now() - 60_000).toISOString(), null, true)
    await patch(student.id, { isTestStudent: true })
    const rows = await periods(student.id)
    expect(rows.every((row) => typeof row.endsAt === 'string' && Date.parse(row.endsAt) <= Date.now())).toBe(true)
    const token = await login(payload, student)
    expect((await authed(token))?.id).toBe(student.id)
  })
})

describe('заморозка закрывает вход и сессии', () => {
  it('заморозка на срок: вход отвечает 403 с датой, открытая сессия больше не действует', async () => {
    const { student, credentials } = await newStudent()
    const token = await login(payload, credentials)
    const frozen = await profileAfter(await freeze(student.id, { action: 'freeze', term: '1m', reason: 'vacation', note: 'Отпуск до декабря' }))
    expect(frozen.freeze).toMatchObject({ active: true, reason: 'vacation', note: 'Отпуск до декабря' })
    expect(frozen.freeze.frozenUntil).not.toBeNull()
    expect(await authed(token)).toBeNull()
    const refused = await loginError(credentials)
    expect(refused?.status).toBe(403)
    expect(refused?.message).toMatch(/^Доступ к платформе приостановлен до \d{2}\.\d{2}\.\d{4}\. Чтобы продолжить обучение, напишите наставнику\.$/)
    // Неверный пароль замороженной учётки не выдаёт, что она заморожена.
    expect((await loginError({ ...credentials, password: 'Wrong-Passw0rd!' }))?.message).not.toMatch(/приостановлен/)
  })

  it('бессрочная заморозка: сообщение без даты', async () => {
    const { student, credentials } = await newStudent()
    await profileAfter(await freeze(student.id, { action: 'freeze', term: 'forever', reason: 'left' }))
    expect((await loginError(credentials))?.message).toBe('Доступ к платформе приостановлен. Чтобы продолжить обучение, напишите наставнику.')
  })

  it('разморозка пускает снова, но сессия, открытая до заморозки, не оживает', async () => {
    const { student, credentials } = await newStudent()
    const before = await login(payload, credentials)
    await profileAfter(await freeze(student.id, { action: 'freeze', term: 'forever', reason: 'no-contact' }))
    const unfrozen = await profileAfter(await freeze(student.id, { action: 'unfreeze', next: '1y' }))
    expect(unfrozen.freeze.active).toBe(false)
    expect(Date.parse(unfrozen.freeze.plannedAt as string)).toBeGreaterThan(Date.now() + 360 * 24 * 60 * 60 * 1000)
    expect(await authed(before)).toBeNull()
    expect((await authed(await login(payload, credentials)))?.id).toBe(student.id)
  })

  it('истёкший срок пускает без действий администратора, сессии до заморозки не оживают', async () => {
    const student = await createStudent(payload)
    const old = await login(payload, student)
    const endsAt = Date.now() + 500
    await insertPeriod(student.id, new Date(Date.now() - 1_000).toISOString(), new Date(endsAt).toISOString())
    expect(await authed(old)).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, endsAt - Date.now()) + 50))
    expect(await authed(old)).toBeNull()
    expect((await authed(await login(payload, student)))?.id).toBe(student.id)
  })

  it('плановая заморозка в будущем ничего не меняет', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    await insertPeriod(student.id, new Date(Date.now() + 86_400_000).toISOString(), null, true)
    expect((await authed(token))?.id).toBe(student.id)
  })

  it('начало в прошлом, как у ученика старше полугода при выкате: сессии до разморозки не оживают', async () => {
    const { student, credentials } = await newStudent()
    const token = await login(payload, credentials)
    // Сессия открыта после начала периода, но до того, как заморозка заработала.
    await insertPeriod(student.id, new Date(Date.now() - 86_400_000).toISOString(), null, true)
    expect(await authed(token)).toBeNull()
    await profileAfter(await freeze(student.id, { action: 'unfreeze', next: 'none' }))
    expect(await authed(token)).toBeNull()
    expect((await periods(student.id)).filter((row) => Date.parse(row.startsAt) > Date.now())).toHaveLength(0)
  })
})

describe('операции администратора', () => {
  it('переносит и снимает плановую заморозку, отклоняет прошедшую дату и неизвестный срок', async () => {
    const { student } = await newStudent()
    const moved = await profileAfter(await freeze(student.id, { action: 'plan', date: '2031-03-01' }))
    expect(moved.freeze.plannedAt).toBe('2031-02-28T21:00:00.000Z')
    expect(await periods(student.id)).toHaveLength(1)
    expect((await profileAfter(await freeze(student.id, { action: 'plan', date: null }))).freeze.plannedAt).toBeNull()
    expect((await freeze(student.id, { action: 'plan', date: '2020-01-01' })).status).toBe(400)
    expect((await freeze(student.id, { action: 'freeze', term: '2w', reason: 'vacation' })).status).toBe(400)
    expect((await freeze(student.id, { action: 'freeze', term: '1m', reason: 'boredom' })).status).toBe(400)
    expect((await freeze(student.id, { action: 'unfreeze', next: '6m' })).status).toBe(409)
  })

  it('повторная заморозка заменяет срок, история остаётся', async () => {
    const { student } = await newStudent()
    await profileAfter(await freeze(student.id, { action: 'freeze', term: '1m', reason: 'vacation' }))
    const longer = await profileAfter(await freeze(student.id, { action: 'freeze', term: 'date', until: '2031-01-15', reason: 'other' }))
    // Плановая заморозка через полгода начнётся раньше 2031 года: после срока ученик останется замороженным.
    expect(longer.freeze).toMatchObject({ active: true, endsAt: '2031-01-14T21:00:00.000Z', frozenUntil: null, reason: 'other' })
    await profileAfter(await freeze(student.id, { action: 'plan', date: null }))
    expect((await profileAfter(await freeze(student.id, { action: 'freeze', term: 'date', until: '2031-01-15', reason: 'other' }))).freeze.frozenUntil).toBe('2031-01-14T21:00:00.000Z')
    const rows = await periods(student.id)
    expect(rows.filter((row) => row.reason === 'vacation')[0].endedBy).toBe(admin.id)
  })

  it('ученик не может заморозить и не видит заморозки через REST', async () => {
    const { student, credentials } = await newStudent()
    const token = await login(payload, credentials)
    expect((await freeze(student.id, { action: 'freeze', term: 'forever', reason: 'left' }, token)).status).toBe(403)
    const req = await createLocalReq({ user: { ...student, collection: 'users' } as never }, payload)
    await expect(payload.find({ collection: 'account-freezes', overrideAccess: false, req })).rejects.toMatchObject({ status: 403 })
    await expect(payload.create({ collection: 'account-freezes', data: { user: student.id, startsAt: new Date().toISOString(), reason: 'left' }, overrideAccess: false, req })).rejects.toBeTruthy()
    // Даже администратор пишет только через экран: прямое создание закрыто.
    await expect(payload.create({ collection: 'account-freezes', data: { user: student.id, startsAt: new Date().toISOString(), reason: 'left' }, overrideAccess: true })).rejects.toBeTruthy()
  })

  it('удаление замороженного ученика проходит и уносит его заморозки', async () => {
    const { student } = await newStudent()
    await profileAfter(await freeze(student.id, { action: 'freeze', term: 'forever', reason: 'left' }))
    const response = await DELETE(new Request(`${base}/${student.id}`, { method: 'DELETE', headers: headers(adminToken), body: JSON.stringify({ confirmEmail: student.email }) }), context(student.id))
    expect(response.status).toBe(200)
    expect(await periods(student.id)).toHaveLength(0)
  })
})

describe('рассылки', () => {
  it('замороженный ученик не попадает в аудиторию', async () => {
    const { student: frozen } = await newStudent()
    const { student: active } = await newStudent()
    await profileAfter(await freeze(frozen.id, { action: 'freeze', term: 'forever', reason: 'left' }))
    const audience = await resolveBroadcastAudience(payload, { audience: 'selected', recipients: [frozen.id, active.id] })
    expect(audience).toEqual({ userIds: [active.id], excluded: 1 })
  })
})
