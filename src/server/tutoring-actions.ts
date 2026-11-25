'use server'

import { randomUUID } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'

import { relationId } from '@/lib/content-management/pages'
import { logger } from '@/lib/telemetry'
import { isMoscowTuesday, isTutoringMeeting, isTutoringStatus, parseMoscowMeetingTime, tutoringHttpsUrl, type TutoringProgram } from '@/lib/tutoring'
import { introductionScheduleError, parseMoscowScheduleInput } from '@/lib/tutoring-schedule'
import { getLearningRequest } from '@/server/learning-request'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { tutoringPath } from '@/server/tutoring-bootcamps'
import { tutoringBootcamps } from '@/server/tutoring-curriculum'
import { setTutoringStreamCalendar } from '@/server/tutoring-calendar-account'
import { tutoringGoogleConfig } from '@/server/tutoring-google'
import { queueTutoringProject, retryTutoringRevocation } from '@/server/tutoring-projects'
import { parseTutoringRate, saveTutoringCharge } from '@/server/tutoring-payments'
import { finishTutoringMeeting } from '@/server/tutoring-attendance'
import { addTutoringInvite, removeWaitingTutoringInvite, repeatTutoringInvitations, saveNewTutoringStream, saveTutoringStreamSettings } from '@/server/tutoring-invitations'
import { tutoringMemberships } from '@/server/tutoring-access'
import { saveIntroductionSubmission } from '@/server/tutoring-intro-practice'
import { changeTutoringEnrollment } from '@/server/tutoring-graduation'
import { TutoringProblem, writeTutoringReview } from '@/server/tutoring'
import { changeTutoringSchedule, moveTutoringMeeting, openFirstTutoringLecture, scheduleTutoringIntroduction, writeTutoringStream } from '@/server/tutoring-schedule'

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

function introductionDate(form: FormData) {
  const raw = value(form, 'introductionStartsAt')
  if (!raw) return null
  const iso = parseMoscowScheduleInput(raw)
  if (!iso || Date.parse(iso) <= Date.now()) throw new TutoringProblem('Укажите будущую дату и время вводной встречи по Москве')
  return iso
}

function streamDetails(form: FormData) {
  const title = value(form, 'title')
  const meetingUrl = value(form, 'meetingUrl')
  if (!title || title.length > 120) throw new TutoringProblem('Введите название до 120 символов')
  if (meetingUrl && !tutoringHttpsUrl(meetingUrl)) throw new TutoringProblem('Введите HTTPS-ссылку на созвон')
  return { title, meetingUrl }
}

type CreationError = { failureId: string; message: string; fields: Record<string, string> }

export async function createTutoringStream(program: TutoringProgram, _previous: CreationError | null, form: FormData): Promise<CreationError | null> {
  const { payload, user, req } = await actor(true)
  const course = (await tutoringBootcamps(payload, req)).find(item => item.program === program)
  if (!course) notFound()
  const base = `${tutoringPath(course.program)}/streams`
  const open = value(form, 'intent') === 'open'
  let id: number
  try {
    const templateId = value(form, 'calendar')
    const template = /^[1-9]\d*$/.test(templateId) ? await payload.findByID({
      collection: 'bootcamp-streams', id: Number(templateId), req, depth: 0, overrideAccess: false, disableErrors: true,
    }) : null
    if (templateId && (!template || template.program !== program || !isMoscowTuesday(template.startsAt))) {
      throw new TutoringProblem('Выберите календарь этого буткемпа с первым занятием во вторник')
    }
    const startsAt = template?.startsAt ?? moscowDate(form)
    const introductionStartsAt = introductionDate(form)
    if (introductionStartsAt) {
      const error = introductionScheduleError(introductionStartsAt, [Date.parse(startsAt)])
      if (error) throw new TutoringProblem(error)
    }
    const rawRate = value(form, 'rate')
    const hourlyKopecks = rawRate ? parseTutoringRate(rawRate) : null
    if (rawRate && hourlyKopecks === null) throw new TutoringProblem('Укажите стоимость часа в рублях')
    id = await saveNewTutoringStream(payload, user, {
      ...streamDetails(form), program, startsAt, introductionStartsAt, hourlyKopecks,
    }, value(form, 'creationKey'), value(form, 'inviteEmails'), open)
  } catch (error) {
    if (!(error instanceof TutoringProblem)) logger.error('Tutoring stream creation failed', error)
    const fields = Object.fromEntries(['title', 'calendar', 'date', 'time', 'introductionStartsAt', 'meetingUrl', 'rate', 'inviteEmails']
      .map(key => [key, value(form, key)]))
    return { failureId: randomUUID(), fields, message: error instanceof TutoringProblem ? error.message : 'Не удалось создать поток. Проверьте данные и попробуйте снова.' }
  }
  revalidatePath(base)
  return finish(`${base}/${id}`, 'saved', open ? 'Поток открыт' : 'Черновик сохранен')
}

export async function rescheduleTutoringIntroduction(streamId: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(`${href}?schedule=1#schedule`, 'Время вводной встречи сохранено', async () => {
    const date = introductionDate(form)
    if (!date) throw new TutoringProblem('Укажите дату и время вводной встречи по Москве')
    await scheduleTutoringIntroduction(payload, user, streamId, value(form, 'expectedStart'), date)
  })
}

export async function releaseFirstLecture(streamId: number, revision: string) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(href, 'Первая лекция открыта ученикам', async () => {
    await openFirstTutoringLecture(payload, user, streamId, revision)
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
  const { href } = await managedStream(payload, req, streamId)
  await run(href, 'Настройки потока сохранены', async () => {
    await writeTutoringStream(payload, user, streamId, async (req, stream) => {
      if (stream.updatedAt !== value(form, 'updatedAt')) throw new TutoringProblem('Настройки уже изменились. Обновите страницу')
      const status = value(form, 'status')
      const currentMeeting = Number(value(form, 'current'))
      const submittedRate = value(form, 'rate')
      const hourlyKopecks = submittedRate ? parseTutoringRate(submittedRate) : stream.hourlyKopecks
      if (submittedRate && hourlyKopecks == null) throw new TutoringProblem('Укажите стоимость часа в рублях')
      if (status !== 'active' && status !== 'draft' && status !== 'archived') throw new TutoringProblem('Выберите доступ к потоку')
      if (!isTutoringMeeting(currentMeeting, stream.program)) throw new TutoringProblem('Выберите встречу потока')
      if (stream.awaitingFirstLecture && currentMeeting !== 1) throw new TutoringProblem('Сначала откройте первую лекцию потоку')
      await saveTutoringStreamSettings(req, stream, { ...streamDetails(form), status, currentMeeting, hourlyKopecks },
        form.has('pendingInviteEmails') ? value(form, 'pendingInviteEmails') : undefined)
    }, true)
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
  const { stream, href } = await managedStream(payload, req, streamId)
  await run(href, stream.status === 'draft' ? 'Адрес сохранен для приглашения' : 'Приглашение обработано', async () => {
    const member = await addTutoringInvite(payload, user, streamId, value(form, 'email'))
    return member ? `${href}?participant=${member}#project` : (stream.status === 'active' ? href + '#pending-invitations' : href)
  })
}

export async function retryTutoringInvitations(streamId: number) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(href + '#pending-invitations', 'Приглашения проверены', async () => {
    const result = await repeatTutoringInvitations(payload, user, streamId)
    return href + (result.waiting.length ? '#pending-invitations' : '#students')
  })
}

export async function cancelWaitingTutoringInvite(streamId: number, studentId: number, email: string) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(href, 'Приглашение отменено', async () => {
    await removeWaitingTutoringInvite(payload, user, streamId, studentId, email)
  })
}

export async function updateTutoringParticipant(streamId: number, memberId: number, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(`${href}?participant=${memberId}`, 'Отметка сохранена', async () => {
    await changeTutoringEnrollment(payload, user, streamId, memberId, value(form, 'revision'), {
      kind: 'update', currentMeeting: Number(value(form, 'current')), active: value(form, 'active') === 'yes',
    })
  })
}

export async function closeTutoringEnrollment(streamId: number, memberId: number, revision: string, action: 'graduate' | 'revoke') {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  if (action !== 'graduate' && action !== 'revoke') notFound()
  await run(`${href}?participant=${memberId}#student`, action === 'graduate' ? 'Обучение завершено' : 'Доступ к материалам закрыт', async () => {
    await changeTutoringEnrollment(payload, user, streamId, memberId, revision, { kind: action })
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

export async function submitIntroductionWork(streamId: number, form: FormData) {
  const { payload, req, user } = await actor(false)
  const membership = (await tutoringMemberships(payload, req, user.id)).find(({ stream }) => stream.id === streamId)
  if (!membership) notFound()
  await run(`${tutoringPath(membership.stream.program)}/introduction#intro-practice-${streamId}`, 'Пробная работа отправлена', async () => {
    await saveIntroductionSubmission(payload, user, streamId, value(form, 'submission'), value(form, 'previous'))
  })
}

export async function submitTutoringHomework(streamId: number, meeting: number, form: FormData) {
  const { payload, user, req } = await actor(false)
  const membership = (await tutoringMemberships(payload, req, user.id)).find(({ stream }) => stream.id === streamId)
  if (!membership || relationId(membership.member.student) !== user.id) notFound()
  const href = await streamHref(payload, req, membership.stream.program, streamId)
  await run(`${href}?meeting=${meeting}#homework`, 'Работа отправлена на проверку', async () => {
    await writeTutoringReview(payload, streamId, membership.member.id, meeting, { kind: 'submit', actor: user, url: value(form, 'submission') })
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

export async function completeTutoringMeeting(streamId: number, meeting: number, streamRevision: string, form: FormData) {
  const { payload, user, req } = await actor(true)
  const { href } = await managedStream(payload, req, streamId)
  await run(`${href}?preview=${meeting}#attendance`, 'Встреча завершена', async () => {
    await finishTutoringMeeting(payload, user, streamId, {
      meeting, streamRevision, minutes: Number(value(form, 'minutes')),
      present: form.getAll('participant').map(id => Number(id)),
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
