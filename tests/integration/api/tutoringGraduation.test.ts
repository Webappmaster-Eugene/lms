import { readFile } from 'node:fs/promises'

import { createLocalReq } from 'payload'
import { expect, it } from 'vitest'

import { tutoringLibraryMemberships, tutoringMemberships } from '@/server/tutoring-access'
import { changeTutoringEnrollment } from '@/server/tutoring-graduation'
import { saveTutoringDeck, saveTutoringIntroduction } from '@/server/tutoring-decks'
import { writeTutoringReview } from '@/server/tutoring'
import { studentMeetingCharges } from '@/server/tutoring-student-payments'

import { blankPDF } from '../helpers/fixtures'
import { createAdmin, createStudent, getTestPayload, login, rest, uid } from '../helpers/payload'

it('сохраняет границу чтения при выпуске, закрывает сдачу и отзывает только явно выданный доступ', async () => {
  const payload = await getTestPayload()
  const admin = await createAdmin(payload)
  const student = await createStudent(payload)
  const classmate = await createStudent(payload)
  const req = await createLocalReq({ user: student }, payload)
  const token = await login(payload, student)
  const classmateToken = await login(payload, classmate)
  const stream = await payload.create({ collection: 'tutoring-streams',
    data: { program: 'react-next', title: uid('alumni'), startsAt: '2027-02-16T17:00:00Z', status: 'active', currentMeeting: 21 } })
  const enroll = (id: number) => payload.create({ collection: 'tutoring-participants',
    data: { stream: stream.id, student: id, currentMeeting: 19, active: true } })
  const member = await enroll(student.id)
  const neighbor = await enroll(classmate.id)
  const invoice = (participant: number, meeting: number, status: 'paid' | 'due') => payload.create({
    collection: 'tutoring-charges', data: { participant, meeting, minutes: 60, hourlyKopecks: 180000, amountKopecks: 180000, status, updatedBy: admin.id },
  })
  await Promise.all([invoice(member.id, 1, 'paid'), invoice(member.id, 2, 'due'), invoice(member.id, 22, 'due'), invoice(neighbor.id, 3, 'due')])
  const ownInvoices = async () => (await studentMeetingCharges(payload, req,
    await tutoringLibraryMemberships(payload, req, student.id))).map(row => [row.meeting, row.status, row.canOpenMeeting])
  const expectedInvoices = [[22, 'due', false], [2, 'due', true], [1, 'paid', true]]
  expect(await ownInvoices()).toEqual(expectedInvoices)
  const data = blankPDF()
  const lesson = (number: number) => payload.create({
    collection: 'tutoring-meetings',
    file: { data, name: uid('library') + '.pdf', size: data.length, mimetype: 'application/pdf' },
    data: { program: 'react-next', number, title: 'Встреча ' + number, instructorNotes: 'Только для наставника',
      homework: [{ stage: 19, description: 'Докажите, что изменение корректно' }] },
  })
  const open = await lesson(21)
  const locked = await lesson(22)
  const pair = new FormData()
  pair.set('pdf', new File([new Uint8Array(data)], 'reading.pdf'))
  pair.set('pptx', new File([new Uint8Array(await readFile('tests/fixtures/tutoring-editable.pptx'))], 'reading.pptx'))
  const technical = await saveTutoringDeck(payload, admin, pair, { id: null, updatedAt: '', material: {
    program: 'react-next', number: 20, title: 'Два исхода', instructorNotes: 'Ответ преподавателя',
    homework: [{ stage: 18, description: 'Разберите ответ' }], sourceDigest: 'b'.repeat(64),
  } })
  const intro = await saveTutoringIntroduction(payload, admin, pair, 'react-next', '', { instructorNotes: 'Сценарий вводной', sourceDigest: 'c'.repeat(64) })
  const slides = await payload.findByID({ collection: 'tutoring-meetings', id: technical.id, depth: 1 })
  const onboarding = await payload.findByID({ collection: 'tutoring-introductions', id: intro.id, depth: 1 })
  if (!slides.deckPdf || typeof slides.deckPdf === 'number' || typeof onboarding.deckPdf === 'number' || typeof onboarding.deckPptx === 'number') {
    throw new Error('Тестовая презентация не загружена')
  }
  const introURL = '/tutoring-deck-files/file/' + onboarding.deckPdf.filename
  const slidesURL = '/tutoring-deck-files/file/' + slides.deckPdf.filename
  const getFile = (filename: string | null | undefined, who: string) => rest('GET', '/tutoring-meetings/file/' + filename, { token: who })
  await expect(changeTutoringEnrollment(payload, student, stream.id, member.id, member.updatedAt, { kind: 'graduate' }))
    .rejects.toThrow('Доступ к материалам меняет наставник')
  const graduate = await changeTutoringEnrollment(payload, admin, stream.id, member.id, member.updatedAt, { kind: 'graduate' })
  expect(graduate).toMatchObject({ active: false, graduatedThrough: 21 })
  expect(await ownInvoices()).toEqual(expectedInvoices)
  await expect(changeTutoringEnrollment(payload, admin, stream.id, member.id, member.updatedAt, { kind: 'update', active: true, currentMeeting: 22 }))
    .rejects.toThrow('Доступ уже изменился')
  await expect(writeTutoringReview(payload, stream.id, member.id, open.number, { kind: 'submit', actor: student, url: 'https://example.test/work' }))
    .rejects.toThrow('Задание пока недоступно')
  await payload.update({ collection: 'tutoring-streams', id: stream.id, data: { currentMeeting: 24, status: 'archived' } })
  expect(await tutoringMemberships(payload, req, student.id)).toHaveLength(0)
  expect((await tutoringLibraryMemberships(payload, req, student.id)).map(({ openThrough }) => openThrough)).toEqual([21])
  const returningToken = await login(payload, student)
  expect((await getFile(open.filename, returningToken)).status).toBe(200)
  expect((await getFile(open.filename, token)).status).toBe(200)
  expect([403, 404]).toContain((await getFile(locked.filename, token)).status)
  expect([403, 404]).toContain((await getFile(open.filename, classmateToken)).status)
  expect((await rest('GET', '/tutoring-meetings/' + open.id, { token })).json).not.toHaveProperty('instructorNotes')
  expect((await rest('GET', introURL, { token })).status).toBe(200)
  expect((await rest('GET', slidesURL, { token })).status).toBe(200)
  expect([403, 404]).toContain((await rest('GET', '/tutoring-deck-files/file/' + onboarding.deckPptx.filename, { token })).status)
  expect((await rest('GET', '/tutoring-introductions/' + onboarding.id, { token })).json).not.toHaveProperty('instructorNotes')
  await changeTutoringEnrollment(payload, admin, stream.id, member.id, graduate.updatedAt, { kind: 'revoke' })
  expect(await ownInvoices()).toEqual([])
  expect([403, 404]).toContain((await rest('GET', introURL, { token: returningToken })).status)
  expect([403, 404]).toContain((await rest('GET', slidesURL, { token })).status)
  expect([403, 404]).toContain((await getFile(open.filename, token)).status)
  expect(await tutoringLibraryMemberships(payload, req, student.id)).toHaveLength(0)

  const onboardingOnly = await payload.create({ collection: 'tutoring-streams',
    data: { program: 'react-next', title: uid('onboarding'), startsAt: '2027-02-16T17:00:00Z', status: 'active', currentMeeting: 1, awaitingFirstLecture: true } })
  const visitor = await payload.create({ collection: 'tutoring-participants', data: { stream: onboardingOnly.id, student: student.id, currentMeeting: 1, active: true } })
  const firstTechnical = await lesson(1)
  expect([403, 404]).toContain((await getFile(firstTechnical.filename, token)).status)
  expect((await rest('GET', introURL, { token })).status).toBe(200)
  await expect(changeTutoringEnrollment(payload, admin, onboardingOnly.id, visitor.id, visitor.updatedAt, {
    kind: 'update', currentMeeting: 3, active: true,
  })).rejects.toThrow('Сначала откройте первую лекцию')
  await expect(writeTutoringReview(payload, onboardingOnly.id, visitor.id, 1, {
    kind: 'grade', actor: admin, status: 'accepted', feedback: '', expectedUpdatedAt: '',
  })).rejects.toThrow('Задание пока недоступно')
  const introGraduate = await changeTutoringEnrollment(payload, admin, onboardingOnly.id, visitor.id, visitor.updatedAt, { kind: 'graduate' })
  expect(introGraduate.graduatedThrough).toBe(0)
  await payload.update({ collection: 'tutoring-streams', id: onboardingOnly.id, data: { status: 'archived' } })
  expect([403, 404]).toContain((await getFile(firstTechnical.filename, token)).status)
  expect((await rest('GET', introURL, { token })).status).toBe(200)
  await changeTutoringEnrollment(payload, admin, onboardingOnly.id, visitor.id, introGraduate.updatedAt, { kind: 'revoke' })
  expect([403, 404]).toContain((await rest('GET', introURL, { token })).status)
})
