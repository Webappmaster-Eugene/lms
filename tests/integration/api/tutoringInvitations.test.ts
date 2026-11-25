import { randomUUID } from 'node:crypto'

import { createLocalReq, type Payload } from 'payload'
import { afterAll, beforeAll, expect, it } from 'vitest'

import type { BootcampProgram } from '@/payload-types'
import { getBootcamps } from '@/server/bootcamps'
import { confirmEnrollmentIdentity } from '@/server/enrollment-identity'
import { addTutoringInvite, removeWaitingTutoringInvite, repeatTutoringInvitations, saveNewTutoringStream, saveTutoringStreamSettings } from '@/server/tutoring-invitations'
import { writeTutoringStream } from '@/server/tutoring-schedule'

import { ensureNodejsProgramCourse } from '../helpers/bootcamp'
import { blankPDF } from '../helpers/fixtures'
import { captureEmails, createAdmin, createStudent, getTestPayload, login, rest, uid, type TestUser } from '../helpers/payload'

let payload: Payload
let teacher: TestUser
let existing: TestUser
let program: BootcampProgram
const materials: number[] = []
const title = uid('invite-stream')
const input = { title, program: 'nodejs' as const, startsAt: '2027-04-06T17:00:00Z', hourlyKopecks: 200000 }
const newEmail = uid('mentoring-new') + '@lms.test'
const anonymousEmail = uid('0-mentoring-new') + '@lms.test'

beforeAll(async () => {
  payload = await getTestPayload()
  ;[teacher, existing] = await Promise.all([createAdmin(payload), createStudent(payload)])
  await confirmEnrollmentIdentity(payload, teacher, existing.id, existing.email)
  ;[program] = (await payload.find({ collection: 'bootcamp-programs', where: { key: { equals: 'nodejs' } }, limit: 1 })).docs
  await ensureNodejsProgramCourse(payload)
  await payload.update({ collection: 'bootcamp-programs', id: program.id,
    data: { mentoringGitlabGroup: 'nodejs-bootcamp/invite-test', mentoringGraderUserId: 12 } })
  const present = await payload.find({ collection: 'tutoring-meetings', where: { program: { equals: 'nodejs' } }, limit: 32 })
  const pdf = blankPDF()
  for (let number = 1; number <= 32; number++) {
    if (present.docs.some(lesson => lesson.number === number)) continue
    const doc = await payload.create({ collection: 'tutoring-meetings',
      file: { data: pdf, name: uid('invite-material') + '.pdf', size: pdf.length, mimetype: 'application/pdf' },
      data: { program: 'nodejs', number, title: `Встреча ${number}`, homework: [{ stage: 1, description: 'Задание' }] } })
    materials.push(doc.id)
  }
})

afterAll(async () => {
  if (!payload) return
  await payload.delete({ collection: 'tutoring-streams', where: { title: { equals: title } } })
  await payload.delete({ collection: 'users', where: { email: { in: [existing.email, newEmail, anonymousEmail] } } })
  if (materials.length) await payload.delete({ collection: 'tutoring-meetings', where: { id: { in: materials } } })
  if (program) await payload.update({ collection: 'bootcamp-programs', id: program.id,
    data: { mentoringGitlabGroup: program.mentoringGitlabGroup ?? null, mentoringGraderUserId: program.mentoringGraderUserId ?? null } })
})

it('создает один поток, отправляет письма только после сохранения и оставляет прежний пароль ученику', async () => {
  const mail = captureEmails(payload)
  try {
    const key = randomUUID()
    const students = `${existing.email}\nИрина Белова <${newEmail}>\n${existing.email.toUpperCase()}`
    const open = () => saveNewTutoringStream(payload, teacher, input, key, students, true)
    const [first, second] = await Promise.all([open(), open()])
    expect(first).toBe(second)
    expect(await payload.findByID({ collection: 'tutoring-streams', id: first })).toMatchObject({ status: 'active', hourlyKopecks: input.hourlyKopecks, awaitingFirstLecture: true })
    const memberList = await payload.find({ collection: 'tutoring-participants', where: { stream: { equals: first } }, depth: 0 })
    expect(memberList.docs.map(member => member.gitlabInviteEmail).sort()).toEqual([existing.email, newEmail].sort())
    const account = (await payload.find({ collection: 'users', where: { email: { equals: newEmail } } })).docs[0]
    expect(account).toMatchObject({ enrollmentIdentityEmail: newEmail, firstName: 'Ирина', lastName: 'Белова', role: 'student', learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned',
      trainerAccessMode: 'assigned', guidesAccessMode: 'assigned' })
    expect(await getBootcamps(payload, account, await createLocalReq({ user: account }, payload))).toEqual([])
    const projects = await payload.find({ collection: 'tutoring-projects', where: { and: [{ program: { equals: input.program } }, { student: { in: [account.id, existing.id] } }] } })
    expect(projects.docs.map(project => project.gitlabEmail).sort()).toEqual([existing.email, newEmail].sort())
    expect(mail.sent.filter(message => message.to === newEmail)).toHaveLength(1)
    expect(mail.sent.filter(message => message.to === existing.email)).toHaveLength(1)
    expect(mail.sent.find(message => message.to === existing.email)?.text).not.toContain('reset-password')
    const welcome = mail.sent.find(message => message.to === newEmail)?.text
    expect(welcome).toContain('/reset-password?token=')
    expect(welcome).toContain(`/tutoring/nodejs/streams/${first}`)
    const token = welcome?.match(/reset-password\?token=([^\s]+)/u)?.[1]
    if (!token) throw new Error('Письмо не содержит ссылку установки пароля')
    const password = 'Student-password-confirmation-2027'
    await payload.resetPassword({ collection: 'users', overrideAccess: false, data: { token: decodeURIComponent(token), password } })
    await expect(login(payload, { email: newEmail, password })).resolves.toBeTruthy()
    await expect(login(payload, existing)).resolves.toBeTruthy()
    const member = memberList.docs.find(row => row.student === account.id)
    expect(await addTutoringInvite(payload, teacher, first, newEmail)).toBe(member?.id)
    expect(mail.sent.filter(message => message.to === newEmail)).toHaveLength(1)
  } finally { mail.restore() }
})

it('хранит отложенные адреса в черновике и не создает аккаунт и письма при неудачном открытии', async () => {
  const mail = captureEmails(payload)
  try {
    const draft = await saveNewTutoringStream(payload, teacher, { ...input, hourlyKopecks: null }, randomUUID(), anonymousEmail, false)
    const open = (list?: string, hourlyKopecks: number | null = input.hourlyKopecks) => writeTutoringStream(payload, teacher, draft, (req, stream) =>
      saveTutoringStreamSettings(req, stream, { title: stream.title, meetingUrl: stream.meetingUrl, status: 'active', currentMeeting: stream.currentMeeting, hourlyKopecks }, list))
    expect(await payload.count({ collection: 'users', where: { email: { equals: anonymousEmail } } })).toMatchObject({ totalDocs: 0 })
    await expect(open(undefined, null)).rejects.toThrow('стоимость часа')
    await expect(open(`${anonymousEmail}\n${teacher.email}`)).rejects.toThrow('служебный аккаунт')
    expect(await payload.findByID({ collection: 'tutoring-streams', id: draft })).toMatchObject({ status: 'draft', pendingInviteEmails: anonymousEmail })
    expect(await payload.count({ collection: 'users', where: { email: { equals: anonymousEmail } } })).toMatchObject({ totalDocs: 0 })
    expect(await payload.count({ collection: 'tutoring-participants', where: { stream: { equals: draft } } })).toMatchObject({ totalDocs: 0 })
    expect(mail.sent).toHaveLength(0)
    await open()
    expect(await payload.findByID({ collection: 'tutoring-streams', id: draft })).toMatchObject({ status: 'active', pendingInviteEmails: null })
    expect(mail.sent.filter(message => message.to === anonymousEmail)).toHaveLength(1)
    expect(await payload.count({ collection: 'tutoring-participants', where: { stream: { equals: draft } } })).toMatchObject({ totalDocs: 1 })
    const frozen = await createStudent(payload)
    try {
      await payload.create({ collection: 'account-freezes', data: { user: frozen.id, startsAt: new Date(Date.now() - 60000).toISOString(), reason: 'vacation', automatic: false }, context: { syncAccountFreezes: true } })
      await expect(addTutoringInvite(payload, teacher, draft, frozen.email)).rejects.toThrow(/заморожен|отключенный/)
      expect(await payload.count({ collection: 'tutoring-participants', where: { student: { equals: frozen.id } } })).toMatchObject({ totalDocs: 0 })
      expect(mail.sent.some(message => message.to === frozen.email)).toBe(false)
    } finally { await payload.delete({ collection: 'users', id: frozen.id }) }
    await expect(saveNewTutoringStream(payload, existing, input, randomUUID(), newEmail, true)).rejects.toThrow('наставник')
  } finally { mail.restore() }
})

it('ждет сверки только спорного адреса, привязывает повтор к исходному аккаунту и не дублирует письмо', async () => {
  const unsynced = await createStudent(payload)
  const abandoned = await createStudent(payload)
  const fresh = uid('invite-ready') + '@lms.test'
  const cleanup = [unsynced.email, abandoned.email, fresh]
  const mail = captureEmails(payload)
  try {
    const id = await saveNewTutoringStream(payload, teacher, input, randomUUID(), [unsynced.email, abandoned.email, fresh].join('\n'), true)
    const reload = () => payload.findByID({ collection: 'tutoring-streams', id, depth: 0 })
    const members = () => payload.find({ collection: 'tutoring-participants', depth: 0, where: { stream: { equals: id } } })
    const pending = { studentId: unsynced.id, email: unsynced.email }
    const oldAddress = { studentId: abandoned.id, email: abandoned.email }
    expect((await reload()).invitesAwaitingIdentity).toEqual(expect.arrayContaining([pending, oldAddress]))
    expect((await members()).docs.map(row => row.gitlabInviteEmail)).toEqual([fresh])
    expect(mail.sent.map(m => m.to)).toEqual([fresh])
    expect((await payload.count({ collection: 'tutoring-projects', where: { student: { in: [unsynced.id, abandoned.id] } } })).totalDocs).toBe(0)

    await repeatTutoringInvitations(payload, teacher, id)
    await confirmEnrollmentIdentity(payload, teacher, unsynced.id, unsynced.email)
    expect((await members()).totalDocs).toBe(1)
    await payload.delete({ collection: 'users', id: abandoned.id })
    const replacement = await createStudent(payload, { email: abandoned.email })
    await confirmEnrollmentIdentity(payload, teacher, replacement.id, replacement.email)
    await Promise.all([repeatTutoringInvitations(payload, teacher, id), repeatTutoringInvitations(payload, teacher, id)])
    expect((await reload()).invitesAwaitingIdentity).toEqual([oldAddress])
    expect((await members()).docs.map(row => row.gitlabInviteEmail).sort()).toEqual([unsynced.email, fresh].sort())
    expect((await payload.count({ collection: 'tutoring-projects', where: { student: { equals: unsynced.id } } })).totalDocs).toBe(1)
    expect(mail.sent.map(m => m.to).sort()).toEqual([unsynced.email, fresh].sort())
    await removeWaitingTutoringInvite(payload, teacher, id, abandoned.id, abandoned.email)
    expect((await reload()).invitesAwaitingIdentity).toBeNull()
  } finally {
    mail.restore()
    await payload.delete({ collection: 'users', where: { email: { in: cleanup } } })
  }
})

it('при ручном создании и повторном включении участия через API требует сверку почты', async () => {
  const other = await createStudent(payload)
  const token = await login(payload, teacher)
  const stream = await payload.create({ collection: 'tutoring-streams', data: { ...input, status: 'active', currentMeeting: 1 } })
  const data = { student: other.id, stream: stream.id, currentMeeting: 1 }
  const route = '/tutoring-participants'
  try {
    const rejected = await rest('POST', route, { token, body: { ...data, active: true } })
    expect(rejected.status).toBe(400)
    expect(JSON.stringify(rejected.json)).toContain('сверьте адрес')
    const inactive = await rest('POST', route, { token, body: { ...data, active: false } })
    expect(inactive.status).toBe(201)
    const member = (inactive.json.doc as { id: number }).id
    const enable = () => rest('PATCH', route + '/' + member, { token, body: { active: true } })
    expect((await enable()).status).toBe(400)
    expect((await payload.findByID({ collection: 'tutoring-participants', id: member })).active).toBe(false)
    await confirmEnrollmentIdentity(payload, teacher, other.id, other.email)
    expect((await enable()).status).toBe(200)
    expect(await payload.findByID({ collection: 'tutoring-participants', id: member })).toMatchObject({ active: true, gitlabInviteEmail: other.email })
  } finally {
    await payload.delete({ collection: 'tutoring-streams', id: stream.id })
    await payload.delete({ collection: 'users', id: other.id })
  }
})
