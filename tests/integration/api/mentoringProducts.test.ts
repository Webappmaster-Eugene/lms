import type { Payload, Where } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { validTutoringWebhookToken, tutoringWebhookToken } from '@/server/bootcamp-worker-auth'
import { saveTutoringCharge } from '@/server/tutoring-payments'
import { claimTutoringProject, queueTutoringProject, recordTutoringVerdict, reportTutoringProject, tutoringMergeRequest } from '@/server/tutoring-projects'
import type { TutoringParticipant, TutoringStream } from '@/payload-types'
import { createAdmin, createStudent, getTestPayload, login, rest, uid, type TestUser } from '../helpers/payload'

let payload: Payload
let teacher: TestUser
let student: TestUser
let stream: TutoringStream
let member: TutoringParticipant
const gradingBot = 34

beforeAll(async () => {
  payload = await getTestPayload()
  const { docs: [program] } = await payload.find({ collection: 'bootcamp-programs', where: { key: { equals: 'nodejs' } }, limit: 1 })
  await payload.update({
    collection: 'bootcamp-programs', id: program.id,
    data: { mentoringGitlabGroup: 'nodejs-bootcamp/mentoring-nodejs', mentoringGraderUserId: gradingBot },
  })
  ;[teacher, student] = await Promise.all([createAdmin(payload), createStudent(payload)])
  stream = await payload.create({ collection: 'tutoring-streams',
    data: { title: uid('mentoring'), program: 'nodejs', status: 'active', currentMeeting: 1, startsAt: '2026-11-17T17:00:00Z' },
  })
  member = await payload.create({ collection: 'tutoring-participants',
    data: { student: student.id, stream: stream.id, active: true, currentMeeting: 1 },
  })
})

describe('менторство как отдельный продукт', () => {
  it('открывает участие без предоплаты и ведёт оплату по фактическим минутам', async () => {
    expect(member.paidAt ?? null).toBeNull()
    const input = { action: 'charge', minutes: '75', rate: '1800,50', revision: '' }
    await expect(saveTutoringCharge(payload, student, stream.id, member.id, 1, input)).rejects.toThrow('Оплату отмечает наставник')
    const first = await saveTutoringCharge(payload, teacher, stream.id, member.id, 1, input)
    expect(first).toMatchObject({ amountKopecks: 225063, hourlyKopecks: 180050, status: 'due' })
    await expect(saveTutoringCharge(payload, teacher, stream.id, member.id, 1, input)).rejects.toThrow('уже изменена')
    const paid = await saveTutoringCharge(payload, teacher, stream.id, member.id, 1, { ...input, action: 'paid', revision: first.updatedAt })
    expect(paid).toMatchObject({ id: first.id, amountKopecks: 225063, status: 'paid', paidAt: expect.any(String) })
    const cancelled = await saveTutoringCharge(payload, teacher, stream.id, member.id, 2, { action: 'cancel', minutes: '', rate: '', revision: '' })
    expect(cancelled).toMatchObject({ amountKopecks: 0, minutes: 0, status: 'cancelled' })
    const token = await login(payload, student)
    expect((await rest('GET', `/tutoring-charges/${first.id}`, { token })).status).not.toBe(200)
  })

  it('не выставляет оплату заранее', async () => {
    const future = await payload.create({ collection: 'tutoring-streams',
      data: { title: uid('future-mentoring'), program: 'nodejs', status: 'active', currentMeeting: 1, startsAt: '2099-02-03T17:00:00Z' },
    })
    const learner = await payload.create({ collection: 'tutoring-participants',
      data: { student: student.id, stream: future.id, active: true, currentMeeting: 1 },
    })
    await expect(saveTutoringCharge(payload, teacher, future.id, learner.id, 1, {
      action: 'charge', minutes: '120', rate: '1500', revision: '',
    })).rejects.toThrow('Оплата рассчитывается после занятия')
    await payload.update({ collection: 'tutoring-streams', id: future.id, data: { status: 'archived' } })
  })

  it('выдаёт отдельный проект, принимает вердикт и снимает доступ после архива', async () => {
    const username = `mc-student-${student.id}`
    const { docs: [project], totalDocs } = await payload.find({ collection: 'tutoring-projects',
      where: { and: [{ student: { equals: student.id } }, { program: { equals: 'nodejs' } }] }, depth: 0 })
    expect(totalDocs).toBe(1)
    expect(project).toMatchObject({ group: 'nodejs-bootcamp/mentoring-nodejs', state: 'queued', student: student.id })
    await expect(queueTutoringProject(payload, student, stream.id, member.id)).rejects.toThrow('Проект открывает наставник')
    const once = await queueTutoringProject(payload, teacher, stream.id, member.id)
    expect(once.id).toBe(project.id)
    const { job, webhook } = await claimTutoringProject(payload)
    expect(job).toMatchObject({ id: project.id, revoke: false, username, email: student.email, autoResolveUsername: true })
    if (!job) throw new Error('Нет задания GitLab')
    expect(validTutoringWebhookToken(project.id, webhook?.token ?? null)).toBe(true)
    expect(validTutoringWebhookToken(project.id + 1, tutoringWebhookToken(project.id))).toBe(false)
    const url = `https://git.mentorcareer.ru/nodejs-bootcamp/mentoring-nodejs/${username}`
    const report = { lease: job.lease, status: 'done', gitlabProjectId: 1234567, gitlabUserId: 890, gitlabProjectUrl: url }
    await expect(reportTutoringProject(payload, project.id, { ...report, lease: 'old' })).rejects.toThrow('уже передано')
    await expect(reportTutoringProject(payload, project.id, report)).resolves.toEqual({ ok: true })
    expect(tutoringMergeRequest(url, url + '/-/merge_requests/19')).toBe(19)
    expect(tutoringMergeRequest(url, url + '-another/-/merge_requests/19')).toBeNull()

    const event = {
      user: { id: gradingBot, username: 'group_5_bot_grader' }, project: { id: 1234567 },
      merge_request: { iid: 19, url: url + '/-/merge_requests/19' },
      object_attributes: { noteable_type: 'MergeRequest', updated_at: '2027-02-17T17:00:00Z',
        note: '<!-- grader:01:5d1444952459 -->\n**Доверенная проверка: неделя 1 - пройдена**\nПрошло проверок: 26 из 26.' },
    }
    expect(await recordTutoringVerdict(payload, project.id, 'Note Hook', { ...event, user: { id: gradingBot + 1, username: event.user.username } })).toBe(false)
    expect(await recordTutoringVerdict(payload, project.id, 'Note Hook', event)).toBe(true)
    expect(await recordTutoringVerdict(payload, project.id, 'Note Hook', event)).toBe(false)
    const result = await payload.find({ collection: 'tutoring-checks', where: { project: { equals: project.id } }, limit: 1 })
    expect(result.docs[0]).toMatchObject({ mrIid: 19, stage: 1, verdict: 'passed', passed: 26, total: 26 })
    expect(await recordTutoringVerdict(payload, project.id, 'Merge Request Hook', {
      project: event.project,
      object_attributes: { ...event.merge_request, action: 'update', oldrev: 'old', updated_at: '2027-02-17T18:00:00Z' },
    })).toBe(true)
    expect(await recordTutoringVerdict(payload, project.id, 'Note Hook', event)).toBe(false)
    expect((await payload.findByID({ collection: 'tutoring-checks', id: result.docs[0].id })).verdict).toBe('pending')
    await payload.update({ collection: 'tutoring-streams', id: stream.id, data: { status: 'archived' } })
    const after = await claimTutoringProject(payload)
    expect(after.job).toMatchObject({ id: project.id, revoke: true, gitlabProjectId: 1234567, autoResolveUsername: true })
    if (!after.job) throw new Error('Нет отзыва проекта')
    await reportTutoringProject(payload, project.id, { lease: after.job.lease, status: 'revoked' })
    expect((await payload.findByID({ collection: 'tutoring-projects', id: project.id })).state).toBe('revoked')
  })

  it('создаёт отдельный проект React после открытия черновика, сохраняя учётку GitLab', async () => {
    const priorStudent = await createStudent(payload)
    const username = uid('known')
    await payload.create({ collection: 'tutoring-projects', data: { student: priorStudent.id, program: 'nodejs', username,
      group: 'nodejs-bootcamp/mentoring-nodejs', courseProject: 'bootcamp/course', gradingProject: 'bootcamp-staff/grading',
      state: 'revoked', gitlabUserId: 891, attempts: 0 } })
    const program = await payload.create({ collection: 'bootcamp-programs', data: {
      key: 'react-next', title: 'React', shortTitle: 'React', landingUrl: 'https://example.com/react',
      priceKopecks: 10000, paymentDueDays: 7, offerUrl: 'https://example.com/offer', offerVersion: '1', receiptItemName: 'Курс React',
      entryTaskSet: 'rental-js',
      gitlabStreamGroup: 'react-bootcamp/mass', gitlabCourseProject: 'react-bootcamp/course', gradingProject: 'react-staff/grading',
      mentoringGitlabGroup: 'react-bootcamp/mentoring', mentoringGraderUserId: gradingBot,
    } })
    const draft = await payload.create({ collection: 'tutoring-streams', data: {
      program: 'react-next', title: uid('draft'), startsAt: stream.startsAt, status: 'draft', currentMeeting: 1 } })
    try {
      const participant = await payload.create({ collection: 'tutoring-participants', data: {
        stream: draft.id, student: priorStudent.id, active: true, currentMeeting: 1 } })
      const where: Where = { and: [{ student: { equals: priorStudent.id } }, { program: { equals: 'react-next' } }] }
      expect((await payload.count({ collection: 'tutoring-projects', where })).totalDocs).toBe(0)
      expect(participant.gitlabInviteEmail).toBe(priorStudent.email)
      await payload.update({ collection: 'users', id: priorStudent.id, data: { email: uid('moved') + '@lms.test' } })
      await payload.update({ collection: 'tutoring-streams', id: draft.id, data: { status: 'active' } })
      const projects = await payload.find({ collection: 'tutoring-projects', where })
      expect(projects.totalDocs).toBe(1)
      expect(projects.docs[0]).toMatchObject({ group: 'react-bootcamp/mentoring', courseProject: 'react-bootcamp/course',
        username, gitlabUserId: 891, gitlabEmail: priorStudent.email, state: 'queued' })
      expect((await claimTutoringProject(payload)).job).toMatchObject({ id: projects.docs[0].id, username,
        email: priorStudent.email, gitlabUserId: 891, autoResolveUsername: false })
      await payload.update({ collection: 'tutoring-participants', id: participant.id, data: { active: false } })
      await payload.update({ collection: 'tutoring-participants', id: participant.id, data: { active: true } })
      expect((await payload.find({ collection: 'tutoring-projects', where })).docs.map(row => row.id)).toEqual([projects.docs[0].id])
    } finally {
      await payload.delete({ collection: 'tutoring-streams', id: draft.id })
      await payload.delete({ collection: 'bootcamp-programs', id: program.id })
      await payload.delete({ collection: 'users', id: priorStudent.id })
    }
  })

  it('два потока одного ученика получают один проект, а исполнитель подбирает пропущенную выдачу', async () => {
    const learner = await createStudent(payload)
    const streams = await Promise.all(['A', 'B'].map(suffix => payload.create({ collection: 'tutoring-streams',
      data: { program: 'nodejs', status: 'active', title: uid(suffix), startsAt: stream.startsAt, currentMeeting: 1 } })))
    try {
      await Promise.all(streams.map(row => payload.create({ collection: 'tutoring-participants',
        data: { stream: row.id, student: learner.id, active: true, currentMeeting: 1 } })))
      const where: Where = { student: { equals: learner.id }, program: { equals: 'nodejs' } }
      const queued = await payload.find({ collection: 'tutoring-projects', where })
      expect(queued.totalDocs).toBe(1)
      expect(queued.docs[0].state).toBe('queued')
      // Воспроизводим старое действующее участие, созданное до автоматической выдачи.
      await payload.delete({ collection: 'tutoring-projects', id: queued.docs[0].id })
      const claims = await Promise.all([claimTutoringProject(payload), claimTutoringProject(payload)])
      expect(claims.map(row => row.job?.username).filter(name => name === `mc-student-${learner.id}`)).toHaveLength(1)
      expect((await payload.count({ collection: 'tutoring-projects', where })).totalDocs).toBe(1)
    } finally {
      for (const row of streams) await payload.delete({ collection: 'tutoring-streams', id: row.id })
      await payload.delete({ collection: 'users', id: learner.id })
    }
  })

  it('закрытый доступ и группа массового буткемпа не запускают выдачу', async () => {
    const { docs: [program] } = await payload.find({ collection: 'bootcamp-programs', where: { key: { equals: 'nodejs' } } })
    const learner = await createStudent(payload)
    const quarantined = await payload.create({ collection: 'tutoring-streams',
      data: { program: 'nodejs', status: 'active', title: uid('isolated'), startsAt: stream.startsAt, currentMeeting: 1 } })
    const where: Where = { student: { equals: learner.id }, program: { equals: 'nodejs' } }
    try {
      await expect(payload.create({ collection: 'tutoring-participants', context: { tutoringInviteEmail: 'different@lms.test' },
        data: { stream: quarantined.id, student: learner.id, active: true, currentMeeting: 1 } })).rejects.toThrow()
      const membership = await payload.create({ collection: 'tutoring-participants', data: {
        stream: quarantined.id, student: learner.id, active: false, currentMeeting: 1 } })
      expect((await payload.count({ collection: 'tutoring-projects', where })).totalDocs).toBe(0)
      await payload.update({ collection: 'bootcamp-programs', id: program.id, data: { mentoringGitlabGroup: program.gitlabStreamGroup } })
      await payload.update({ collection: 'tutoring-participants', id: membership.id, data: { active: true } })
      await expect(queueTutoringProject(payload, teacher, quarantined.id, membership.id)).rejects.toThrow('занята буткемпом')
      expect((await payload.count({ collection: 'tutoring-projects', where })).totalDocs).toBe(0)
    } finally {
      await payload.delete({ collection: 'tutoring-streams', id: quarantined.id })
      await payload.delete({ collection: 'users', id: learner.id })
      await payload.update({ collection: 'bootcamp-programs', id: program.id, data: { mentoringGitlabGroup: program.mentoringGitlabGroup } })
    }
  })

  it('для старого участия со сменой почты ждёт подтверждения наставника', async () => {
    const learner = await createStudent(payload)
    const lesson = await payload.create({ collection: 'tutoring-streams',
      data: { program: 'nodejs', status: 'draft', title: uid('legacy'), startsAt: stream.startsAt, currentMeeting: 1 } })
    try {
      const participant = await payload.create({ collection: 'tutoring-participants', data: {
        stream: lesson.id, student: learner.id, active: true, currentMeeting: 1 } })
      // Старое участие до добавления снимка адреса.
      await payload.update({ collection: 'tutoring-participants', id: participant.id, data: { gitlabInviteEmail: null } })
      const newEmail = uid('new-mail') + '@lms.test'
      await payload.update({ collection: 'users', id: learner.id, data: { email: newEmail } })
      await payload.update({ collection: 'tutoring-streams', id: lesson.id, data: { status: 'active' } })
      await claimTutoringProject(payload)
      expect((await payload.count({ collection: 'tutoring-projects', where: { student: { equals: learner.id } } })).totalDocs).toBe(0)
      await expect(queueTutoringProject(payload, teacher, lesson.id, participant.id, learner.email)).rejects.toThrow('должна совпадать')
      await expect(queueTutoringProject(payload, learner, lesson.id, participant.id, newEmail)).rejects.toThrow('Проект открывает наставник')
      const project = await queueTutoringProject(payload, teacher, lesson.id, participant.id, newEmail)
      expect(project).toMatchObject({ gitlabEmail: newEmail, state: 'queued' })
      expect((await claimTutoringProject(payload)).job).toMatchObject({ id: project.id, email: newEmail })
    } finally {
      await payload.delete({ collection: 'tutoring-streams', id: lesson.id })
      await payload.delete({ collection: 'users', id: learner.id })
    }
  })
})
