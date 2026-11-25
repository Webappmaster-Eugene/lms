import { createLocalReq, type Payload } from 'payload'
import { beforeAll, expect, it } from 'vitest'

import { tutoringMemberships } from '@/server/tutoring-access'
import { finishTutoringMeeting } from '@/server/tutoring-attendance'
import { saveTutoringCharge } from '@/server/tutoring-payments'
import { createAdmin, createStudent, getTestPayload, uid, type TestUser } from '../helpers/payload'

let payload: Payload
let teacher: TestUser
let first: TestUser
let second: TestUser
const rate = 180050

beforeAll(async () => {
  payload = await getTestPayload()
  ;[teacher, first, second] = await Promise.all([createAdmin(payload), createStudent(payload), createStudent(payload)])
})

async function course(current = 1, intro = false) {
  const stream = await payload.create({ collection: 'tutoring-streams', data: {
    title: uid('attendance'), program: 'react-next', status: 'active', currentMeeting: current, awaitingFirstLecture: intro,
    startsAt: '2020-02-04T17:00:00Z', hourlyKopecks: rate,
  } })
  const add = (student: number) => payload.create({ collection: 'tutoring-participants', data: {
    student, stream: stream.id, active: true, currentMeeting: current,
  } })
  const [present, absent] = await Promise.all([add(first.id), add(second.id)])
  const charges = () => payload.find({ collection: 'tutoring-charges', depth: 0,
    where: { participant: { in: [present.id, absent.id] } } })
  const open = async (user: TestUser) => (await tutoringMemberships(payload, await createLocalReq({ user }, payload), user.id))
    .find(m => m.stream.id === stream.id)?.openThrough
  const finish = (ids: number[], by = teacher, minutes = 75) => finishTutoringMeeting(payload, by, stream.id, {
    meeting: current, streamRevision: stream.updatedAt, present: ids, minutes,
  })
  return { stream, present, absent, charges, open, finish }
}

it('завершает занятие один раз и открывает следующую встречу только присутствующим', async () => {
  const { stream, present, absent, charges, open, finish } = await course()
  await expect(finish([absent.id], second)).rejects.toThrow()
  await expect(finish([])).rejects.toThrow('Выберите присутствовавших')
  await Promise.all([finish([present.id]), finish([present.id])])
  const billed = await charges()
  expect(billed.totalDocs).toBe(1)
  const [charge] = billed.docs
  expect(charge).toMatchObject({ participant: present.id, meeting: 1, status: 'due', minutes: 75, amountKopecks: 225063, attendedAt: expect.any(String) })
  expect(await open(first)).toBe(2)
  expect(await open(second)).toBe(1)
  const paid = await saveTutoringCharge(payload, teacher, stream.id, present.id, 1, { action: 'paid', revision: charge.updatedAt, minutes: '', rate: '' })
  await finish([present.id])
  expect((await charges()).docs[0]).toMatchObject({ id: charge.id, status: 'paid', paidAt: paid.paidAt, updatedAt: paid.updatedAt })
  await saveTutoringCharge(payload, teacher, stream.id, present.id, 1, { action: 'reopen', revision: paid.updatedAt, minutes: '', rate: '' })
  expect((await charges()).docs[0]).toMatchObject({ status: 'due', paidAt: null, attendedAt: charge.attendedAt })
  await finish([absent.id])
  expect(await open(second)).toBe(2)
  expect((await charges()).totalDocs).toBe(2)
})

it('сохраняет обе позиции и оплаты при ошибке одного ученика и не начисляет за вводную', async () => {
  const intro = await course(1, true)
  await expect(intro.finish([intro.present.id])).rejects.toThrow('технические встречи')
  expect((await intro.charges()).totalDocs).toBe(0)
  const group = await course()
  await expect(group.finish([intro.present.id])).rejects.toThrow('Состав потока')
  await payload.update({ collection: 'tutoring-participants', id: group.absent.id, data: { currentMeeting: 4 } })
  await expect(group.finish([group.present.id, group.absent.id])).rejects.toThrow('другая текущая встреча')
  expect((await group.charges()).totalDocs).toBe(0)
  expect(await group.open(first)).toBe(1)
  expect(await group.open(second)).toBe(4)
})

it('сохраняет ручную оплату и оставляет участника последней встречи в потоке после завершения', async () => {
  const group = await course(24)
  const due = await saveTutoringCharge(payload, teacher, group.stream.id, group.present.id, 24, {
    action: 'charge', revision: '', minutes: '75', rate: '1800,50',
  })
  const paid = await saveTutoringCharge(payload, teacher, group.stream.id, group.present.id, 24, {
    action: 'paid', revision: due.updatedAt, minutes: '', rate: '',
  })
  await expect(group.finish([group.present.id], teacher, 80)).rejects.toThrow('другими условиями')
  await group.finish([group.present.id])
  await group.finish([group.present.id])
  const billed = await group.charges()
  expect(billed.totalDocs).toBe(1)
  expect(billed.docs[0]).toMatchObject({ id: paid.id, paidAt: paid.paidAt, status: 'paid', attendedAt: expect.any(String) })
  expect(await group.open(first)).toBe(24)
})
