import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import { POST as createRoute } from '@/app/api/manage/students/route'
import { DELETE, GET as detailsRoute, PATCH } from '@/app/api/manage/students/[id]/route'
import { POST as passwordRoute } from '@/app/api/manage/students/[id]/password/route'
import { GET as accessRoute } from '@/app/api/manage/learning-access/route'
import { getLearningAccess } from '@/server/learning-access'
import type { AccessCatalog } from '@/lib/learning-access-edit'
import type { CreatedStudent, StudentCredentials, StudentDetails } from '@/components/learning-access/contracts'
import { captureEmails, createAdmin, createCourseTree, createStudent, getTestPayload, login, uid, type TestUser } from '../helpers/payload'

let payload: Payload
let admin: TestUser
let adminToken: string

const base = 'http://lms.test/api/manage/students'
const headers = (token: string, extra: Record<string, string> = {}) => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}), ...extra })
const post = (data: unknown, token = adminToken, extra: Record<string, string> = {}) => createRoute(new Request(base, { method: 'POST', headers: headers(token, extra), body: JSON.stringify(data) }))
const context = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })
const details = (id: number | string, token = adminToken) => detailsRoute(new Request(`${base}/${id}`, { headers: headers(token) }), context(id))
const patch = (id: number | string, data: unknown, token = adminToken) => PATCH(new Request(`${base}/${id}`, { method: 'PATCH', headers: headers(token), body: JSON.stringify(data) }), context(id))
const password = (id: number | string, token = adminToken) => passwordRoute(new Request(`${base}/${id}/password`, { method: 'POST', headers: headers(token) }), context(id))
const remove = (id: number | string, data: unknown, token = adminToken) => DELETE(new Request(`${base}/${id}`, { method: 'DELETE', headers: headers(token), body: JSON.stringify(data) }), context(id))
const newStudent = async () => {
  const email = `${uid('st')}@lms.test`.toLowerCase()
  const response = await post({ email, firstName: 'Ростислав', lastName: 'Ученик' })
  expect(response.status).toBe(201)
  return await response.json() as CreatedStudent
}
const authed = async (token: string) => (await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })).user

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
})

describe('права маршрутов учеников', () => {
  it('гость и ученик не создают, не читают, не меняют и не удаляют', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const victim = await newStudent()
    expect((await post({ email: 'x@lms.test', firstName: 'А', lastName: 'Б' }, '')).status).toBe(401)
    expect((await post({ email: 'x@lms.test', firstName: 'А', lastName: 'Б' }, token)).status).toBe(403)
    expect((await details(victim.student.id, token)).status).toBe(403)
    expect((await patch(victim.student.id, { isActive: false }, token)).status).toBe(403)
    expect((await password(victim.student.id, token)).status).toBe(403)
    expect((await remove(victim.student.id, { confirmEmail: victim.student.email }, token)).status).toBe(403)
    expect((await details(victim.student.id, '')).status).toBe(401)
    expect((await payload.find({ collection: 'users', where: { email: { equals: 'x@lms.test' } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('пониженный администратор со старым токеном ничего не может', async () => {
    const demoted = await createAdmin(payload)
    const token = await login(payload, demoted)
    const victim = await newStudent()
    await payload.update({ collection: 'users', id: demoted.id, data: { role: 'student' }, overrideAccess: false, req: await createLocalReq({ user: admin }, payload) })
    expect((await post({ email: `${uid('st')}@lms.test`, firstName: 'А', lastName: 'Б' }, token)).status).toBe(403)
    expect((await details(victim.student.id, token)).status).toBe(403)
    expect((await patch(victim.student.id, { isActive: false }, token)).status).toBe(403)
    expect((await password(victim.student.id, token)).status).toBe(403)
    expect((await remove(victim.student.id, { confirmEmail: victim.student.email }, token)).status).toBe(403)
    expect((await details(victim.student.id)).status).toBe(200)
  })

  it('запрос с cookie с чужого сайта отклоняется', async () => {
    const email = `${uid('st')}@lms.test`.toLowerCase()
    // Payload не принимает cookie с чужого Origin ещё при входе в запрос, поэтому 401, а не 403.
    expect((await post({ email, firstName: 'А', lastName: 'Б' }, '', { Cookie: `payload-token=${adminToken}`, Origin: 'https://attacker.example' })).status).toBe(401)
    expect((await payload.count({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('с cookie со своей страницы проходит', async () => {
    const response = await post({ email: `${uid('st')}@lms.test`.toLowerCase(), firstName: 'А', lastName: 'Б' }, '', { Cookie: `payload-token=${adminToken}`, Origin: 'http://lms.test' })
    expect(response.status).toBe(201)
  })

  it('администратора этими маршрутами не изменить и не удалить', async () => {
    const other = await createAdmin(payload)
    expect((await patch(other.id, { firstName: 'Новое' })).status).toBe(400)
    expect((await password(other.id)).status).toBe(400)
    expect((await remove(other.id, { confirmEmail: other.email })).status).toBe(400)
    expect((await payload.findByID({ collection: 'users', id: other.id, overrideAccess: true })).firstName).not.toBe('Новое')
  })

  it('каталог дерева закрыт для ученика и не выдаёт текст уроков администратору', async () => {
    const tree = await createCourseTree(payload, { lessons: 2 })
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const url = (query: string) => new Request(`http://lms.test/api/manage/learning-access?${query}`, { headers: headers(token) })
    expect((await accessRoute(url('kind=catalog'))).status).toBe(403)
    expect((await accessRoute(url(`kind=lessons&course=${tree.course.id}`))).status).toBe(403)
    const asAdmin = (query: string) => new Request(`http://lms.test/api/manage/learning-access?${query}`, { headers: headers(adminToken) })
    const catalog = await (await accessRoute(asAdmin('kind=catalog'))).json() as AccessCatalog
    expect(catalog.courses.find((course) => course.id === tree.course.id)).toMatchObject({ title: tree.course.title, roadmap: tree.roadmap.id, assignedOnly: false, isBootcamp: false })
    const lessons = await (await accessRoute(asAdmin(`kind=lessons&course=${tree.course.id}`))).json() as { docs: Record<string, unknown>[] }
    expect(lessons.docs.map((doc) => doc.id)).toEqual(tree.lessons.map((lesson) => lesson.id))
    for (const doc of lessons.docs) expect(Object.keys(doc).sort()).toEqual(['course', 'id', 'isPublished', 'section', 'title'])
  })
})

describe('создание ученика', () => {
  it('создаёт с закрытым доступом и без письма, пароль подходит для входа и проходит политику', async () => {
    const mail = captureEmails(payload)
    try {
      const email = `${uid('Rost')}@LMS.test`
      const response = await post({ email, firstName: ' Ростислав ', lastName: 'Ученик', role: 'admin', learningAccessMode: 'all', totalPoints: 999 })
      expect(response.status).toBe(201)
      expect(response.headers.get('Cache-Control')).toContain('no-store')
      const { student, credentials } = await response.json() as CreatedStudent
      expect(student.email).toBe(email.toLowerCase())
      expect(student.firstName).toBe('Ростислав')
      expect(credentials.password).toMatch(/^(?=.*\p{L})(?=.*\d).{10,128}$/u)
      expect(mail.sent).toEqual([])
      const stored = await payload.findByID({ collection: 'users', id: student.id, overrideAccess: true })
      expect(stored).toMatchObject({ role: 'student', learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned', trainerAccessMode: 'assigned', guidesAccessMode: 'assigned', totalPoints: 0 })
      const token = await login(payload, credentials)
      const user = await authed(token)
      expect(user?.id).toBe(student.id)
      expect((await getLearningAccess(payload, user)).accessibleCourseIds).toEqual([])
    } finally { mail.restore() }
  })

  it('обычное создание через API по-прежнему отправляет приглашение', async () => {
    const mail = captureEmails(payload)
    try {
      const email = `${uid('invite')}@lms.test`.toLowerCase()
      await payload.create({ collection: 'users', data: { email, password: 'Invite-Pass-1234', firstName: 'А', lastName: 'Б', role: 'student' }, overrideAccess: true })
      await expect.poll(() => mail.sent.filter((item) => item.to === email).length).toBe(1)
    } finally { mail.restore() }
  })

  it('дубль почты и неверные поля дают понятный ответ, а не 500', async () => {
    const { student } = await newStudent()
    const duplicate = await post({ email: student.email.toUpperCase(), firstName: 'А', lastName: 'Б' })
    expect(duplicate.status).toBe(409)
    expect((await duplicate.json() as { error: string }).error).toContain('почта уже занята')
    expect((await post({ email: 'не почта', firstName: 'А', lastName: 'Б' })).status).toBe(400)
    expect((await post({ email: 'a@lms.test', firstName: '   ', lastName: 'Б' })).status).toBe(400)
    expect((await post([])).status).toBe(400)
    expect((await post({ email: `${uid('st')}@lms.test`, firstName: 'А', lastName: 'Б', telegram: 'not a telegram !!' })).status).toBe(400)
  })
})

describe('изменение ученика', () => {
  it('меняет данные и почту, вход новой почтой работает, чужая почта отклоняется', async () => {
    const { student, credentials } = await newStudent()
    const other = await newStudent()
    const email = `${uid('changed')}@lms.test`.toLowerCase()
    const response = await patch(student.id, { firstName: 'Новый', email, telegram: '@rostislav', role: 'admin' })
    expect(response.status).toBe(200)
    expect((await response.json() as { student: unknown }).student).toMatchObject({ firstName: 'Новый', email })
    expect((await payload.findByID({ collection: 'users', id: student.id, overrideAccess: true })).role).toBe('student')
    await login(payload, { email, password: credentials.password })
    expect((await patch(student.id, { email: other.student.email })).status).toBe(409)
  })

  it('новый пароль: старый не подходит, сессии закрыты, ссылка из приглашения не работает', async () => {
    const { student, credentials } = await newStudent()
    const token = await login(payload, credentials)
    expect((await authed(token))?.id).toBe(student.id)
    const reset = await payload.forgotPassword({ collection: 'users', data: { email: student.email }, disableEmail: true })
    const response = await password(student.id)
    expect(response.status).toBe(200)
    const next = (await response.json() as { credentials: StudentCredentials }).credentials
    expect(next.password).not.toBe(credentials.password)
    expect(await authed(token)).toBeNull()
    await expect(login(payload, credentials)).rejects.toBeTruthy()
    expect((await authed(await login(payload, next)))?.id).toBe(student.id)
    await expect(payload.resetPassword({ collection: 'users', data: { token: reset, password: 'Stolen-Pass-1234' }, overrideAccess: true })).rejects.toBeTruthy()
  })

  it('отключение закрывает вход и сессии, а включение не оживляет прежние сессии', async () => {
    const { student, credentials } = await newStudent()
    const token = await login(payload, credentials)
    expect((await patch(student.id, { isActive: false })).status).toBe(200)
    expect(await authed(token)).toBeNull()
    await expect(login(payload, credentials)).rejects.toBeTruthy()
    expect((await patch(student.id, { isActive: true })).status).toBe(200)
    expect(await authed(token)).toBeNull()
    expect((await authed(await login(payload, credentials)))?.id).toBe(student.id)
  })
})

describe('удаление ученика', () => {
  it('без точной почты не удаляет, с ней удаляет данные, журнал назначений остаётся', async () => {
    const tree = await createCourseTree(payload, { lessons: 1 })
    const { student, credentials } = await newStudent()
    const grant = await payload.create({ collection: 'learning-access-grants', data: { user: student.id, target: { relationTo: 'courses', value: tree.course.id }, effect: 'allow', ruleKey: 'x' }, overrideAccess: false, req: await createLocalReq({ user: admin }, payload) })
    const token = await login(payload, credentials)
    const info = await (await details(student.id)).json() as StudentDetails
    expect(info.impact).toMatchObject({ rules: 1, blockers: [] })
    expect((await remove(student.id, { confirmEmail: 'wrong@lms.test' })).status).toBe(400)
    expect((await remove(student.id, {})).status).toBe(400)
    const deleted = await remove(student.id, { confirmEmail: student.email.toUpperCase() })
    expect(deleted.status).toBe(200)
    expect(await authed(token)).toBeNull()
    expect((await details(student.id)).status).toBe(404)
    expect((await payload.count({ collection: 'learning-access-grants', where: { user: { equals: student.id } }, overrideAccess: true })).totalDocs).toBe(0)
    const audit = await payload.find({ collection: 'learning-access-audit', where: { grantId: { equals: grant.id } }, overrideAccess: true })
    expect(audit.docs.map((item) => item.operation).sort()).toEqual(['create', 'delete'])
    expect((await remove(student.id, { confirmEmail: student.email })).status).toBe(404)
  })

  it('зачисление на буткемп запрещает удаление и показывает причину', async () => {
    const { student } = await newStudent()
    const lead = await payload.create({ collection: 'bootcamp-leads', data: { email: student.email, name: 'Ростислав Ученик', program: 'nodejs', status: 'paid', paidAt: new Date().toISOString(), consentVersion: '2026-10-26', consentAt: new Date().toISOString(), submissionCount: 1, entryTaskToken: uid('entry-token') }, overrideAccess: true })
    await payload.create({ collection: 'bootcamp-enrollments', data: { lead: lead.id, lmsUser: student.id, email: student.email, firstName: 'Ростислав', lastName: 'Ученик', gitlabUsername: uid('gl'), streamGroup: 'bootcamp/test', status: 'done' }, overrideAccess: true })
    const info = await (await details(student.id)).json() as StudentDetails
    expect(info.impact.blockers).toHaveLength(1)
    const response = await remove(student.id, { confirmEmail: student.email })
    expect(response.status).toBe(409)
    expect((await response.json() as { error: string }).error).toContain('буткемп')
    expect((await details(student.id)).status).toBe(200)
  })

  it('личные записи собеседований запрещают удаление', async () => {
    const { student } = await newStudent()
    const direction = (await payload.find({ collection: 'interview-directions', where: { slug: { equals: 'react' } }, limit: 1 })).docs[0].id
    await payload.create({ collection: 'interview-recordings', data: { title: 'Мой собес', direction, category: 'personal', owner: student.id, status: 'ready', analysisStatus: 'idle', size: 1024, mimeType: 'video/mp4', diskPath: `disk:/LMS interviews/${student.id}/111-12345678-1234-4123-8123-123456789012.mp4` }, overrideAccess: true })
    expect((await remove(student.id, { confirmEmail: student.email })).status).toBe(409)
  })
})
