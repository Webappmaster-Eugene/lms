import type { Payload } from 'payload'
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
    const username = uid('learner').toLowerCase()
    const project = await queueTutoringProject(payload, teacher, stream.id, member.id, username)
    expect(project).toMatchObject({ group: 'nodejs-bootcamp/mentoring-nodejs', state: 'queued', student: student.id })
    const once = await queueTutoringProject(payload, teacher, stream.id, member.id, username)
    expect(once.id).toBe(project.id)
    const { job, webhook } = await claimTutoringProject(payload)
    expect(job).toMatchObject({ id: project.id, revoke: false, username })
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
    expect(after.job).toMatchObject({ id: project.id, revoke: true, gitlabProjectId: 1234567 })
    if (!after.job) throw new Error('Нет отзыва проекта')
    await reportTutoringProject(payload, project.id, { lease: after.job.lease, status: 'revoked' })
    expect((await payload.findByID({ collection: 'tutoring-projects', id: project.id })).state).toBe('revoked')
  })
})
