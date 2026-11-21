import type { Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { writeTutoringReview } from '@/server/tutoring'
import type { TutoringMeeting, TutoringParticipant, TutoringStream } from '@/payload-types'
import { blankPDF } from '../helpers/fixtures'
import { createAdmin, createStudent, getTestPayload, login, rest, uid, type TestUser } from '../helpers/payload'

let payload: Payload
let admin: TestUser
let student: TestUser
let outsider: TestUser
let studentToken: string
let outsiderToken: string
let material: TutoringMeeting
let future: TutoringMeeting
let stream: TutoringStream
let participant: TutoringParticipant
const startsAt = '2027-02-16T17:00:00.000Z'

async function addMaterial(number: number) {
  const data = blankPDF()
  return payload.create({
    collection: 'tutoring-meetings',
    file: { data, name: `${uid('tutoring')}.pdf`, mimetype: 'application/pdf', size: data.length },
    data: { program: 'nodejs', number, title: `Встреча ${number}`, instructorNotes: 'Ответ для наставника', homework: [
      { stage: 1, description: 'Сделать первый шаг задания' },
    ] },
  })
}

beforeAll(async () => {
  payload = await getTestPayload()
  ;[admin, student, outsider] = await Promise.all([createAdmin(payload), createStudent(payload), createStudent(payload)])
  ;[studentToken, outsiderToken] = await Promise.all([login(payload, student), login(payload, outsider)])
  ;[material, future] = await Promise.all([addMaterial(1), addMaterial(2)])
  stream = await payload.create({
    collection: 'tutoring-streams',
    data: { title: uid('tutoring'), program: 'nodejs', startsAt, status: 'active', currentMeeting: 1, meetingUrl: 'https://example.test/meeting' },
  })
  participant = await payload.create({
    collection: 'tutoring-participants', data: { student: student.id, stream: stream.id, paidAt: startsAt, active: true, currentMeeting: 1 },
  })
})

describe('репетиторство в LMS', () => {
  it('защищает PDF, записи потока и заметки ведущего', async () => {
    const file = `/tutoring-meetings/file/${material.filename}`
    const nextFile = `/tutoring-meetings/file/${future.filename}`
    expect((await rest('GET', file)).status).not.toBe(200)
    expect((await rest('GET', file, { token: outsiderToken })).status).not.toBe(200)
    expect((await rest('GET', nextFile, { token: studentToken })).status).not.toBe(200)
    const opened = await rest('GET', file, { token: studentToken })
    expect(opened.status).toBe(200)
    expect(opened.headers.get('content-type')).toContain('application/pdf')
    expect(opened.headers.get('cache-control')).toContain('no-store')
    const meeting = await rest('GET', `/tutoring-meetings/${material.id}`, { token: studentToken })
    expect(meeting.status).toBe(200)
    expect(meeting.json).not.toHaveProperty('instructorNotes')
    expect(meeting.json).toHaveProperty('title', 'Встреча 1')
    expect((await rest('GET', `/tutoring-streams/${stream.id}`, { token: studentToken })).status).not.toBe(200)
    expect((await rest('PATCH', `/tutoring-participants/${participant.id}`, { token: studentToken, body: { currentMeeting: 2 } })).status).not.toBe(200)
  })

  it('принимает одну сдачу в гонке, защищает чужую и закрытую встречу и возвращает на доработку', async () => {
    const url = 'https://example.test/work'
    const submit = (actor: TestUser, number = 1) => writeTutoringReview(payload, stream.id, participant.id, number, { kind: 'submit', actor, url })
    await expect(submit(outsider)).rejects.toThrow('Задание пока недоступно')
    await expect(submit(student, 2)).rejects.toThrow('Задание пока недоступно')
    const parallel = await Promise.allSettled([submit(student), submit(student)])
    expect(parallel.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const result = parallel.find(candidate => candidate.status === 'fulfilled')
    if (result?.status !== 'fulfilled') throw new Error('Нет принятой сдачи')
    const first = result.value
    expect(first).toMatchObject({ status: 'submitted', submissionUrl: url })
    await expect(writeTutoringReview(payload, stream.id, participant.id, 1, {
      kind: 'grade', actor: student, status: 'accepted', feedback: '', expectedUpdatedAt: first.updatedAt,
    })).rejects.toThrow('Оценку сохраняет наставник')
    await expect(writeTutoringReview(payload, stream.id, participant.id, 1, {
      kind: 'grade', actor: admin, status: 'accepted', feedback: '', expectedUpdatedAt: '',
    })).rejects.toThrow('Работа уже изменилась')
    const changes = await writeTutoringReview(payload, stream.id, participant.id, 1, {
      kind: 'grade', actor: admin, status: 'changes', feedback: 'Добавьте тест', expectedUpdatedAt: first.updatedAt,
    })
    expect(changes.feedback).toBe('Добавьте тест')
    const second = await submit(student)
    const accepted = await writeTutoringReview(payload, stream.id, participant.id, 1, {
      kind: 'grade', actor: admin, status: 'accepted', feedback: 'Готово', expectedUpdatedAt: second.updatedAt,
    })
    expect(accepted).toMatchObject({ id: first.id, status: 'accepted', feedback: 'Готово' })
    await expect(submit(student)).rejects.toThrow('Эта работа уже принята')
    expect((await rest('GET', `/tutoring-reviews/${accepted.id}`, { token: outsiderToken })).status).not.toBe(200)
  })

  it('открывает материалы при личной отметке, закрывает их при архивировании и чистит связи при удалении аккаунта', async () => {
    await payload.update({ collection: 'tutoring-participants', id: participant.id, data: { currentMeeting: 2 } })
    const nextFile = `/tutoring-meetings/file/${future.filename}`
    expect((await rest('GET', nextFile, { token: studentToken })).status).toBe(200)
    await payload.update({ collection: 'tutoring-streams', id: stream.id, data: { status: 'archived' } })
    expect((await rest('GET', nextFile, { token: studentToken })).status).not.toBe(200)
    await payload.delete({ collection: 'users', id: student.id })
    expect((await payload.count({ collection: 'tutoring-participants', where: { id: { equals: participant.id } } })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'tutoring-reviews', where: { participant: { equals: participant.id } } })).totalDocs).toBe(0)
  })
})
