'use server'

import { notFound, redirect } from 'next/navigation'

import { relationId } from '@/lib/content-management/pages'
import { logger } from '@/lib/telemetry'
import { isMoscowTuesday, isTutoringMeeting, isTutoringProgram, isTutoringStatus, tutoringHttpsUrl, tutoringPrograms } from '@/lib/tutoring'
import { getLearningRequest } from '@/server/learning-request'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { tutoringMemberships } from '@/server/tutoring-access'
import { tutoringMeetings, TutoringProblem, writeTutoringReview } from '@/server/tutoring'

const manage = '/manage/tutoring'
const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

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
  const date = value(form, 'date')
  const time = value(form, 'time')
  const timestamp = Date.parse(`${date}T${time}:00+03:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !Number.isFinite(timestamp) ||
    new Date(timestamp + 3 * 3_600_000).toISOString().slice(0, 16) !== `${date}T${time}`) {
    throw new TutoringProblem('Укажите дату и время первой встречи по Москве')
  }
  const iso = new Date(timestamp).toISOString()
  if (!isMoscowTuesday(iso)) throw new TutoringProblem('Выберите вторник для первой встречи')
  return iso
}

function streamDetails(form: FormData) {
  const title = value(form, 'title')
  const meetingUrl = value(form, 'meetingUrl')
  if (!title || title.length > 120) throw new TutoringProblem('Введите название до 120 символов')
  if (meetingUrl && !tutoringHttpsUrl(meetingUrl)) throw new TutoringProblem('Введите HTTPS-ссылку на созвон')
  return { title, meetingUrl, startsAt: moscowDate(form) }
}

export async function createTutoringStream(form: FormData) {
  const { payload, user, req } = await actor(true)
  await run(manage, 'Поток создан', async () => {
    const program = value(form, 'program')
    if (!isTutoringProgram(program)) throw new TutoringProblem('Выберите программу')
    const document = await payload.create({
      collection: 'tutoring-streams', req, user, overrideAccess: false,
      data: { ...streamDetails(form), program, status: 'draft', currentMeeting: 1 },
    })
    return `${manage}/${document.id}`
  })
}

export async function updateTutoringStream(streamId: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  await run(`${manage}/${streamId}`, 'Настройки потока сохранены', async () => {
    const stream = await payload.findByID({ collection: 'tutoring-streams', id: streamId, req, user, overrideAccess: false, depth: 0 })
    const status = value(form, 'status')
    const currentMeeting = Number(value(form, 'current'))
    if (status !== 'active' && status !== 'draft' && status !== 'archived') throw new TutoringProblem('Выберите доступ к потоку')
    if (!isTutoringMeeting(currentMeeting, stream.program)) throw new TutoringProblem('Выберите встречу потока')
    if (status === 'active') {
      const meetings = await tutoringMeetings(payload, req, stream.program)
      if (meetings.length !== tutoringPrograms[stream.program].meetings || meetings.some(meeting => !meeting.filename)) {
        throw new TutoringProblem('Сначала загрузите полный комплект презентаций и домашних заданий программы')
      }
    }
    await payload.update({ collection: 'tutoring-streams', id: stream.id, req, user, overrideAccess: false,
      data: { ...streamDetails(form), status, currentMeeting } })
  })
}

export async function addTutoringParticipant(streamId: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  await run(`${manage}/${streamId}`, 'Ученик добавлен', async () => {
    const email = value(form, 'email').toLowerCase()
    if (!email || email.length > 254 || !email.includes('@')) throw new TutoringProblem('Введите почту ученика')
    if (value(form, 'paid') !== 'yes') throw new TutoringProblem('Подтвердите получение оплаты за репетиторство')
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
      data: { stream: streamId, student: student.id, paidAt: new Date().toISOString(), active: true, currentMeeting: 1 } })
    return `${manage}/${streamId}?participant=${member.id}`
  })
}

export async function updateTutoringParticipant(streamId: number, memberId: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  await run(`${manage}/${streamId}?participant=${memberId}`, 'Отметка сохранена', async () => {
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
  const { payload, user } = await actor(true)
  await run(`${manage}/${streamId}?participant=${memberId}&review=${meeting}#homework`, 'Результат проверки сохранён', async () => {
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
  await run(`/tutoring/${streamId}?meeting=${meeting}#homework`, 'Работа отправлена на проверку', async () => {
    const submission = value(form, 'submission')
    if (!tutoringHttpsUrl(submission)) throw new TutoringProblem('Введите HTTPS-ссылку на работу')
    const membership = (await tutoringMemberships(payload, req, user.id)).find(({ stream }) => stream.id === streamId)
    if (!membership || relationId(membership.member.student) !== user.id) throw new TutoringProblem('Поток недоступен')
    await writeTutoringReview(payload, streamId, membership.member.id, meeting, { kind: 'submit', actor: user, url: submission })
  })
}
