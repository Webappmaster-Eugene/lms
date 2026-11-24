'use server'

import type { Payload, PayloadRequest } from 'payload'
import { notFound, redirect } from 'next/navigation'

import { relationId } from '@/lib/content-management/pages'
import { logger } from '@/lib/telemetry'
import { isMoscowTuesday, isTutoringMeeting, isTutoringStatus, parseMoscowMeetingTime, tutoringHttpsUrl, tutoringPrograms, type TutoringProgram } from '@/lib/tutoring'
import { getLearningRequest } from '@/server/learning-request'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { tutoringPath } from '@/server/tutoring-bootcamps'
import { tutoringBootcamps } from '@/server/tutoring-curriculum'
import { setTutoringStreamCalendar } from '@/server/tutoring-calendar-account'
import { tutoringGoogleConfig } from '@/server/tutoring-google'
import { queueTutoringProject, retryTutoringRevocation, tutoringMergeRequest, tutoringProject } from '@/server/tutoring-projects'
import { saveTutoringCharge } from '@/server/tutoring-payments'
import { tutoringMemberships } from '@/server/tutoring-access'
import { tutoringMeetings, TutoringProblem, writeTutoringReview } from '@/server/tutoring'
import { changeTutoringSchedule, moveTutoringMeeting } from '@/server/tutoring-schedule'

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

async function streamHref(payload: Payload, req: PayloadRequest, program: TutoringProgram, id: number) {
  const course = (await tutoringBootcamps(payload, req)).find(item => item.program === program)
  if (!course) notFound()
  return `${tutoringPath(course.program)}/streams/${id}`
}

async function managedStream(payload: Payload, req: PayloadRequest, streamId: number) {
  const stream = await payload.findByID({ collection: 'tutoring-streams', id: streamId, req, overrideAccess: false, depth: 0, disableErrors: true })
  if (!stream) notFound()
  return { stream, href: await streamHref(payload, req, stream.program, streamId) }
}

async function actor(admin: boolean) {
  const info = await getLearningRequest()
  if (!info.user) redirect('/login')
  if (admin && (await getAuthoritativeLearningPolicy(info.payload, info.user.id, info.req)).role !== 'admin') notFound()
  return { ...info, user: info.user }
}

function finish(path: string, key: 'saved' | 'error', message: string): never {
  const [href, anchor] = path.split('#')
  const separator = href?.includes('?') ? '&' : '?'
  redirect(`${href}${separator}${new URLSearchParams({ [key]: message })}${anchor ? `#${anchor}` : ''}`)
}

async function run(path: string, success: string, job: () => Promise<string | void>) {
  let destination: string | void
  try {
    destination = await job()
  } catch (error) {
    if (error instanceof TutoringProblem) finish(path, 'error', error.message)
    logger.error('Tutoring write failed', error)
    finish(path, 'error', 'Не удалось сохранить. Обновите страницу и повторите попытку')
  }
  finish(destination || path, 'saved', success)
}

function moscowDate(form: FormData) {
  const iso = parseMoscowMeetingTime(value(form, 'date'), value(form, 'time'))
  if (!iso) throw new TutoringProblem('Укажите дату и время первой встречи по Москве')
  if (!isMoscowTuesday(iso)) throw new TutoringProblem('Выберите вторник для первой встречи')
  return iso
}

function streamDetails(form: FormData) {
  const title = value(form, 'title')
  const meetingUrl = value(form, 'meetingUrl')
  if (!title || title.length > 120) throw new TutoringProblem('Введите название до 120 символов')
  if (meetingUrl && !tutoringHttpsUrl(meetingUrl)) throw new TutoringProblem('Введите HTTPS-ссылку на созвон')
  return { title, meetingUrl }
}

export async function createTutoringStream(program: TutoringProgram, form: FormData) {
  const { payload, user, req } = await actor(true)
  const course = (await tutoringBootcamps(payload, req)).find(item => item.program === program)
  if (!course) notFound()
  const base = `${tutoringPath(course.program)}/streams`
  await run(base, 'Поток создан', async () => {
    const templateId = value(form, 'calendar')
    const template = /^[1-9]\d*$/.test(templateId) ? await payload.findByID({
      collection: 'bootcamp-streams', id: Number(templateId), req, depth: 0, overrideAccess: false, disableErrors: true,
    }) : null
    if (templateId && (!template || template.program !== program || !isMoscowTuesday(template.startsAt))) {
      throw new TutoringProblem('Выберите календарь этого буткемпа с первым занятием во вторник')
    }
    const document = await payload.create({
      collection: 'tutoring-streams', req, user, overrideAccess: false,
      data: { ...streamDetails(form), startsAt: template?.startsAt ?? moscowDate(form), program, status: 'draft', currentMeeting: 1 },
    })
    return `${base}/${document.id}`
  })
}

export async function rescheduleTutoringSeries(streamId: number, expectedRevision: string, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(`${href}?schedule=1#schedule`, 'Расписание будущих встреч сохранено', async () => {
    await changeTutoringSchedule(payload, user, streamId, expectedRevision, {
      fromMeeting: Number(value(form, 'fromMeeting')),
      firstStart: value(form, 'firstStart'),
      secondStart: value(form, 'secondStart'),
      keepOverrides: value(form, 'keepOverrides') === 'yes',
    })
  })
}

export async function updateTutoringStream(streamId: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { stream, href } = await managedStream(payload, req, streamId)
  await run(href, 'Настройки потока сохранены', async () => {
    const status = value(form, 'status')
    const currentMeeting = Number(value(form, 'current'))
    if (status !== 'active' && status !== 'draft' && status !== 'archived') throw new TutoringProblem('Выберите доступ к потоку')
    if (!isTutoringMeeting(currentMeeting, stream.program)) throw new TutoringProblem('Выберите встречу потока')
    if (status === 'active') {
      const meetings = await tutoringMeetings(payload, req, stream.program)
      if (meetings.length !== tutoringPrograms[stream.program].meetings || meetings.some(meeting => !meeting.filename && !meeting.deckPdf)) {
        throw new TutoringProblem('Сначала загрузите полный комплект презентаций и домашних заданий программы')
      }
    }
    await payload.update({ collection: 'tutoring-streams', id: stream.id, req, user, overrideAccess: false,
      data: { ...streamDetails(form), status, currentMeeting } })
  })
}

export async function rescheduleTutoringMeeting(streamId: number, meeting: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(`${href}?schedule=1#schedule`, 'Расписание встречи сохранено', async () => {
    const reset = value(form, 'intent') === 'reset'
    const newStart = reset ? null : parseMoscowMeetingTime(value(form, 'date'), value(form, 'time'))
    if (!reset && !newStart) throw new TutoringProblem('Укажите дату и время встречи по Москве')
    await moveTutoringMeeting(payload, user, streamId, meeting, { expectedStart: value(form, 'expectedStart'), newStart })
  })
}

export async function toggleTutoringStreamCalendar(streamId: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(`${href}?schedule=1#schedule`, 'Настройки календаря сохранены', async () => {
    if (!tutoringGoogleConfig()) throw new TutoringProblem('Google Calendar ещё не настроен для LMS')
    const enable = value(form, 'enable')
    if (enable !== 'yes' && enable !== 'no') throw new TutoringProblem('Выберите действие для календаря')
    await setTutoringStreamCalendar(payload, user, streamId, enable === 'yes')
  })
}

export async function addTutoringParticipant(streamId: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(href, 'Ученик добавлен', async () => {
    const email = value(form, 'email').toLowerCase()
    if (!email || email.length > 254 || !email.includes('@')) throw new TutoringProblem('Введите почту ученика')
    const { docs: [student] } = await payload.find({
      collection: 'users', req, user, overrideAccess: false, depth: 0, limit: 1, where: { email: { equals: email } },
    })
    if (!student || student.isActive === false || (await getAuthoritativeLearningPolicy(payload, student.id, req)).role !== 'student') {
      throw new TutoringProblem('Активный ученик с таким адресом не найден')
    }
    const { docs: [existing] } = await payload.find({
      collection: 'tutoring-participants', req, user, overrideAccess: false, depth: 0, limit: 1,
      where: { and: [{ student: { equals: student.id } }, { stream: { equals: streamId } }] },
    })
    if (existing) throw new TutoringProblem('Ученик уже в списке потока. Его доступ можно открыть в журнале')
    const member = await payload.create({ collection: 'tutoring-participants', req, user, overrideAccess: false,
      context: { tutoringInviteEmail: email },
      data: { stream: streamId, student: student.id, active: true, currentMeeting: 1 } })
    return `${href}?participant=${member.id}`
  })
}

export async function updateTutoringParticipant(streamId: number, memberId: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(`${href}?participant=${memberId}`, 'Отметка сохранена', async () => {
    const member = await payload.findByID({ collection: 'tutoring-participants', id: memberId, req, user, overrideAccess: false, depth: 1 })
    const stream = member.stream
    if (!stream || typeof stream === 'number' || stream.id !== streamId) throw new TutoringProblem('Ученик не найден в потоке')
    const currentMeeting = Number(value(form, 'current'))
    if (!isTutoringMeeting(currentMeeting, stream.program)) throw new TutoringProblem('Выберите встречу ученика')
    await payload.update({ collection: 'tutoring-participants', id: member.id, req, user, overrideAccess: false,
      data: { currentMeeting, active: value(form, 'active') === 'yes' } })
  })
}

export async function gradeTutoringHomework(streamId: number, memberId: number, meeting: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(`${href}?participant=${memberId}&review=${meeting}#homework`, 'Результат проверки сохранён', async () => {
    const status = value(form, 'status')
    const feedback = value(form, 'feedback')
    if (!isTutoringStatus(status) || feedback.length > 3000) throw new TutoringProblem('Проверьте статус и длину комментария')
    await writeTutoringReview(payload, streamId, memberId, meeting, {
      kind: 'grade', actor: user, status, feedback, expectedUpdatedAt: value(form, 'updatedAt'),
    })
  })
}

export async function submitTutoringHomework(streamId: number, meeting: number, form: FormData) {
  const { payload, user, req } = await actor(false)
  const membership = (await tutoringMemberships(payload, req, user.id)).find(({ stream }) => stream.id === streamId)
  if (!membership || relationId(membership.member.student) !== user.id) notFound()
  const href = await streamHref(payload, req, membership.stream.program, streamId)
  await run(`${href}?meeting=${meeting}#homework`, 'Работа отправлена на проверку', async () => {
    const submission = value(form, 'submission')
    if (!tutoringHttpsUrl(submission)) throw new TutoringProblem('Введите HTTPS-ссылку на работу')
    const project = await tutoringProject(payload, req, user.id, membership.stream.program)
    if (project?.state === 'ready' && project.projectUrl && !tutoringMergeRequest(project.projectUrl, submission)) {
      throw new TutoringProblem('Вставьте ссылку на merge request своего учебного проекта')
    }
    await writeTutoringReview(payload, streamId, membership.member.id, meeting, { kind: 'submit', actor: user, url: submission })
  })
}

export async function recordTutoringCharge(streamId: number, memberId: number, meeting: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(`${href}?participant=${memberId}&review=${meeting}#payment`, 'Оплата встречи сохранена', async () => {
    await saveTutoringCharge(payload, user, streamId, memberId, meeting, {
      minutes: value(form, 'minutes'), rate: value(form, 'rate'), action: value(form, 'intent'), revision: value(form, 'revision'),
    })
  })
}

export async function provisionTutoringProject(streamId: number, memberId: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(`${href}?participant=${memberId}#project`, 'Запрос на проект сохранён', async () => {
    await queueTutoringProject(payload, user, streamId, memberId, value(form, 'inviteEmail'))
  })
}

export async function retryTutoringProjectRevocation(streamId: number, memberId: number) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(`${href}?participant=${memberId}#project`, 'Отзыв доступа поставлен в очередь', async () => {
    await retryTutoringRevocation(payload, user, streamId, memberId)
  })
}
