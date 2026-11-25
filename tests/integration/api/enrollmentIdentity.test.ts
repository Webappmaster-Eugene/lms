import { createLocalReq, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { POST } from '@/app/api/manage/students/[id]/enrollment-identity/route'
import { GET } from '@/app/api/manage/students/[id]/route'
import { inTransaction } from '@/server/bootcamp-lead-events'
import { confirmEnrollmentIdentity, hasEnrollmentIdentity } from '@/server/enrollment-identity'
import { updateProfile } from '@/server/profile/account'
import { captureEmails, createAdmin, createStudent, DEFAULT_PASSWORD, getTestPayload, login, uid, type TestUser } from '../helpers/payload'

let payload: Payload
let teacher: TestUser
let token: string
const path = (id: number) => `http://lms.test/api/manage/students/${id}`
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) })
const headers = (token: string) => ({ authorization: `JWT ${token}`, 'content-type': 'application/json' })
const matches = (id: number, email: string) => inTransaction(payload, teacher, req => hasEnrollmentIdentity(req, id, email))
const submit = (id: number, email: string, revision: string, auth = token) => POST(new Request(path(id) + '/enrollment-identity', {
  method: 'POST', headers: headers(auth), body: JSON.stringify({ email, revision }),
}), ctx(id))

beforeAll(async () => {
  payload = await getTestPayload()
  teacher = await createAdmin(payload)
  token = await login(payload, teacher)
})

describe('привязка почты для новых зачислений', () => {
  it('связывает получателя штатного приглашения с исходным адресом и сбрасывает связь после любой смены адреса', async () => {
    const mail = captureEmails(payload)
    const email = uid('original') + '@lms.test'
    const other = uid('changed') + '@lms.test'
    try {
      const req = await createLocalReq({ user: teacher }, payload)
      const student = await payload.create({ collection: 'users', overrideAccess: false, req,
        data: { firstName: 'Алина', lastName: 'Морозова', email, password: DEFAULT_PASSWORD, role: 'student' } })
      expect(await matches(student.id, email)).toBe(true)
      expect(mail.sent.some(item => item.to === email)).toBe(true)
      const signIn = await login(payload, { ...student, password: DEFAULT_PASSWORD })
      const change = await updateProfile(new Request('http://lms.test/api/profile', { method: 'PATCH', headers: headers(signIn),
        body: JSON.stringify({ email: other, currentPassword: DEFAULT_PASSWORD }) }))
      expect(change.status).toBe(200)
      expect(await matches(student.id, email)).toBe(false)
      expect(await matches(student.id, other)).toBe(false)
      await payload.update({ collection: 'users', id: student.id, overrideAccess: true, data: { email, enrollmentIdentityEmail: email } })
      expect(await matches(student.id, email)).toBe(false)
      // SDK входа пишет снимок профиля через адаптер, минуя beforeChange коллекции.
      await payload.db.updateOne({ collection: 'users', id: student.id, data: { enrollmentIdentityEmail: email }, returning: false })
      expect(await matches(student.id, email)).toBe(false)
    } finally { mail.restore() }
  })

  it('привязывает только выбранный аккаунт и актуальный адрес, записывает одно действие при двух подтверждениях', async () => {
    const student = await createStudent(payload)
    const second = await createStudent(payload)
    const memberToken = await login(payload, student)
    const details = await GET(new Request(path(student.id), { headers: headers(token) }), ctx(student.id))
    const { enrollmentIdentity } = await details.json()
    expect(enrollmentIdentity.confirmed).toBe(false)
    expect((await submit(student.id, student.email, enrollmentIdentity.revision, memberToken)).status).toBe(403)
    expect((await submit(student.id, second.email, enrollmentIdentity.revision)).status).toBe(409)
    expect((await submit(student.id, student.email, '1970-01-01T00:00:00.000Z')).status).toBe(409)
    const confirmations = await Promise.all([submit(student.id, student.email, enrollmentIdentity.revision), submit(student.id, student.email, enrollmentIdentity.revision)])
    expect(confirmations.map(result => result.status)).toEqual([200, 200])
    expect(await matches(student.id, student.email)).toBe(true)
    expect(await matches(second.id, second.email)).toBe(false)
    const events = await payload.find({ collection: 'learning-access-audit', where: { and: [
      { userId: { equals: student.id } }, { targetType: { equals: 'enrollmentIdentity' } },
    ] }, depth: 0 })
    expect(events.docs).toHaveLength(1)
    expect(events.docs[0]).toMatchObject({ actorId: teacher.id, targetId: student.id, current: { email: student.email } })
    await expect(confirmEnrollmentIdentity(payload, student, second.id, second.email)).rejects.toThrow('администратор')
  })
})
