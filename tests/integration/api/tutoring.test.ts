import { readFile } from 'node:fs/promises'
import type { Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { POST as replacePresentation } from '@/app/api/manage/tutoring/presentation/route'
import { saveTutoringDeck } from '@/server/tutoring-decks'
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

  it('публикует пару целиком и сохраняет ручную версию при повторном импорте', async () => {
    const form = new FormData()
    const pdfFile = new File([new Uint8Array(blankPDF())], 'mentorcareer.pdf')
    form.set('pdf', pdfFile)
    form.set('pptx', new File([new Uint8Array(await readFile('tests/fixtures/tutoring-editable.pptx'))], 'mentorcareer.pptx'))
    const data = {
      program: material.program, number: material.number, title: 'Исходная лекция', homework: material.homework.map(({ stage, description }) => ({ stage, description })),
      instructorNotes: 'Только ведущему', sourceDigest: 'a'.repeat(64),
    }
    const created = await saveTutoringDeck(payload, admin, form, { id: null, updatedAt: '', material: { ...data, number: 3 } })
    const createdMeeting = await payload.findByID({ collection: 'tutoring-meetings', id: created.id, depth: 0 })
    expect(createdMeeting).toMatchObject({ number: 3, deckOrigin: 'import' })
    expect(createdMeeting.deckPdf).toEqual(expect.any(Number))
    expect(createdMeeting.deckPptx).toEqual(expect.any(Number))
    const first = await saveTutoringDeck(payload, admin, form, { id: material.id, updatedAt: material.updatedAt, material: data })
    expect(first).toEqual({ id: material.id, status: 'saved' })
    const read = () => payload.findByID({ collection: 'tutoring-meetings', id: material.id, depth: 1 })
    const imported = await read()
    if (!imported.deckPdf || typeof imported.deckPdf === 'number' || !imported.deckPptx || typeof imported.deckPptx === 'number') {
      throw new Error('Файлы презентации не связаны с лекцией')
    }
    const deckPath = (filename?: string | null) => `/tutoring-deck-files/file/${filename}`
    const pdf = deckPath(imported.deckPdf.filename)
    const editable = deckPath(imported.deckPptx.filename)
    const studentPdf = await rest('GET', pdf, { token: studentToken })
    expect(studentPdf.status).toBe(200)
    expect(studentPdf.headers.get('cache-control')).toContain('no-store')
    expect((await rest('GET', editable, { token: studentToken })).status).not.toBe(200)
    expect((await rest('GET', editable, { token: await login(payload, admin) })).status).toBe(200)
    expect((await rest('GET', pdf, { token: outsiderToken })).status).not.toBe(200)

    const withBadPptx = new FormData()
    withBadPptx.set('pdf', pdfFile)
    withBadPptx.set('pptx', new File(['строка'], 'fake.pptx'))
    await expect(saveTutoringDeck(payload, admin, withBadPptx, { id: material.id, updatedAt: imported.updatedAt })).rejects.toThrow('повреждён')
    expect((await read()).deckPdf).toEqual(imported.deckPdf)
    expect((await read()).deckPptx).toEqual(imported.deckPptx)
    const attempt = () => saveTutoringDeck(payload, admin, form, { id: material.id, updatedAt: imported.updatedAt })
    const concurrent = await Promise.allSettled([attempt(), attempt()])
    expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(concurrent.find(result => result.status === 'rejected')).toMatchObject({ reason: { message: expect.stringContaining('уже изменилась') } })
    const manual = await read()
    expect(manual.deckOrigin).toBe('manual')
    expect(manual.deckPdf).not.toEqual(imported.deckPdf)
    expect(manual.deckPptx).not.toEqual(imported.deckPptx)
    expect((await rest('GET', pdf, { token: studentToken })).status).not.toBe(200)
    expect(await saveTutoringDeck(payload, admin, form, { id: material.id, updatedAt: manual.updatedAt, material: data })).toEqual({
      id: material.id, status: 'manual',
    })
    expect((await read()).deckPdf).toEqual(manual.deckPdf)

    const unauthorised = await replacePresentation(new Request('http://lms.test/api/manage/tutoring/presentation', {
      method: 'POST', headers: { Authorization: `JWT ${studentToken}` }, body: form,
    }))
    expect(unauthorised.status).toBe(403)
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
