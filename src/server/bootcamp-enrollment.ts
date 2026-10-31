import 'server-only'

import { randomBytes } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from 'payload'

import {
  BOOTCAMP_COURSE_PROJECT,
  BOOTCAMP_MANUALS_COURSE_SLUG,
  DEFAULT_STREAM_GROUP,
  EnrollmentInputError,
  initialSteps,
  mergeSteps,
  readSteps,
  splitName,
  statusLabel,
  stepLabel,
  suggestUsername,
  type EnrollmentInput,
  type EnrollmentStep,
  type EnrollmentStepState,
  type EnrollmentStatus,
} from '@/lib/bootcamp-enrollment'
import { BOOTCAMP_LEAD_STATUSES } from '@/lib/bootcamp-leads'
import { relationId } from '@/lib/relation-id'
import { adminLink, notifyAdmins } from '@/server/admin-telegram'
import { actorName, journal } from '@/server/bootcamp-lead-events'
import { gitlabWebhookToken } from '@/server/bootcamp-worker-auth'
import type { BootcampEnrollment, BootcampLead, User } from '@/payload-types'

// Исполнитель, пропавший посреди задания, отдаёт его через 10 минут; после пяти попыток задание считается упавшим.
const LEASE_MINUTES = 10
const MAX_ATTEMPTS = 5
// Первый вход в GitLab ждём месяц: дальше спрашивать GitLab про эту учётку незачем.
const WATCH_DAYS = 30

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
const db = (payload: Payload) => (payload.db as unknown as { drizzle: Db }).drizzle
const rows = <T>(result: unknown) => (result as { rows?: T[] }).rows ?? []

export type EnrollmentView = {
  id: number
  status: EnrollmentStatus
  statusLabel: string
  steps: (EnrollmentStep & { label: string })[]
  error: string | null
  firstName: string
  lastName: string
  gitlabUsername: string
  streamGroup: string
  accessUntil: string | null
  gitlabProjectUrl: string | null
  lmsUserId: number | null
  attempts: number
  queuedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  lmsSignedInAt: string | null
  gitlabSignedInAt: string | null
}

export function enrollmentView(doc: BootcampEnrollment): EnrollmentView {
  return {
    id: doc.id,
    status: doc.status,
    statusLabel: statusLabel(doc.status),
    steps: readSteps(doc.steps).map((step) => ({ ...step, label: stepLabel(step.key) })),
    error: doc.error ?? null,
    firstName: doc.firstName,
    lastName: doc.lastName,
    gitlabUsername: doc.gitlabUsername,
    streamGroup: doc.streamGroup,
    accessUntil: doc.accessUntil ?? null,
    gitlabProjectUrl: doc.gitlabProjectUrl ?? null,
    lmsUserId: doc.lmsUser ? relationId(doc.lmsUser) : null,
    attempts: doc.attempts ?? 0,
    queuedAt: doc.queuedAt ?? null,
    startedAt: doc.startedAt ?? null,
    finishedAt: doc.finishedAt ?? null,
    lmsSignedInAt: doc.lmsSignedInAt ?? null,
    gitlabSignedInAt: doc.gitlabSignedInAt ?? null,
  }
}

const leadLink = (id: number | BootcampLead | null | undefined) => adminLink(`/admin/collections/bootcamp-leads/${relationId(id)}`)
const fullName = (doc: { firstName: string, lastName: string }) => `${doc.firstName} ${doc.lastName}`

async function findLead(payload: Payload, id: number): Promise<BootcampLead | null> {
  return payload.findByID({ collection: 'bootcamp-leads', id, depth: 0, overrideAccess: true, disableErrors: true })
}

async function enrollmentOfLead(payload: Payload, leadId: number): Promise<BootcampEnrollment | null> {
  const found = await payload.find({ collection: 'bootcamp-enrollments', where: { lead: { equals: leadId } }, limit: 1, depth: 0, overrideAccess: true })
  return found.docs[0] ?? null
}

export type LeadEnrollmentState = {
  lead: { id: number, email: string, name: string | null, status: string, statusLabel: string }
  enrollment: EnrollmentView | null
  defaults: { firstName: string, lastName: string, username: string, group: string }
}

/** Что показывает панель «Зачисление» в заявке: само зачисление или подсказки для формы. */
export async function leadEnrollmentState(payload: Payload, leadId: number): Promise<LeadEnrollmentState> {
  const lead = await findLead(payload, leadId)
  if (!lead) throw new EnrollmentInputError('Заявка не найдена', 404)
  const enrollment = await enrollmentOfLead(payload, leadId)
  // Обычно поток один на всех, кого зачисляют в эти недели: берём группу последнего зачисления.
  const last = await payload.find({ collection: 'bootcamp-enrollments', sort: '-createdAt', limit: 1, depth: 0, overrideAccess: true })
  return {
    lead: { id: lead.id, email: lead.email, name: lead.name ?? null, status: lead.status, statusLabel: BOOTCAMP_LEAD_STATUSES.find((item) => item.value === lead.status)?.label ?? lead.status },
    enrollment: enrollment ? enrollmentView(enrollment) : null,
    defaults: { ...splitName(lead.name), username: suggestUsername(lead.email), group: last.docs[0]?.streamGroup ?? DEFAULT_STREAM_GROUP },
  }
}

const setStep = (steps: EnrollmentStep[], key: EnrollmentStep['key'], state: EnrollmentStepState, detail: string, at: string) =>
  steps.map((step) => step.key === key ? { key, state, detail, at } : step)

/**
 * Зачисление: учётка LMS и курс методичек ставятся сразу, в одной транзакции с самим
 * зачислением; приглашение уходит после фиксации. GitLab ждёт исполнителя. Запускает его
 * оплата (от имени администратора, который допустил кандидата) или кнопка «Зачислить».
 */
export async function startEnrollment(payload: Payload, admin: User, leadId: number, input: EnrollmentInput, options: { byPayment?: boolean } = {}): Promise<EnrollmentView> {
  const lead = await findLead(payload, leadId)
  if (!lead) throw new EnrollmentInputError('Заявка не найдена', 404)
  if (!lead.paidAt) throw new EnrollmentInputError('Зачислить можно только после оплаты: её подтверждает Робокасса или кнопка «Отметить оплату вручную»', 409)
  if (await enrollmentOfLead(payload, leadId)) throw new EnrollmentInputError('По этой заявке уже есть зачисление, его ход виден в панели', 409)
  const taken = await payload.find({ collection: 'bootcamp-enrollments', where: { gitlabUsername: { equals: input.username } }, limit: 1, depth: 0, overrideAccess: true })
  if (taken.docs[0]) throw new EnrollmentInputError(`Логин ${input.username} уже у другого зачисления (${taken.docs[0].email})`, 409)
  const course = (await payload.find({ collection: 'courses', where: { slug: { equals: BOOTCAMP_MANUALS_COURSE_SLUG } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  if (!course) throw new EnrollmentInputError(`В LMS нет курса методичек «${BOOTCAMP_MANUALS_COURSE_SLUG}»: сначала импортируйте методички`, 409)

  const req = await createLocalReq({ user: admin }, payload)
  if (!(await initTransaction(req))) throw new Error('Enrollment requires a transaction')
  const now = new Date().toISOString()
  let steps = initialSteps()
  let enrollment: BootcampEnrollment
  let accountNote: string
  try {
    const existing = (await payload.find({ collection: 'users', where: { email: { equals: lead.email } }, limit: 1, depth: 0, overrideAccess: true, req })).docs[0]
    let user: User
    if (existing) {
      if (existing.isActive === false) throw new EnrollmentInputError('Учётка LMS с этой почтой отключена: включите её или разберитесь вручную', 409)
      user = existing
      accountNote = existing.role === 'admin' ? 'учётка уже была, это администратор' : 'учётка уже была, приглашение не отправлялось'
    } else {
      // Пароль никто не узнаёт: ученик задаёт свой по ссылке из приглашения.
      user = await payload.create({
        collection: 'users',
        data: { email: lead.email, firstName: input.firstName, lastName: input.lastName, role: 'student', password: randomBytes(24).toString('base64url') },
        overrideAccess: false,
        req,
      })
      accountNote = 'создана, приглашение ушло на почту (ссылка действует 7 дней)'
    }
    steps = setStep(steps, 'lms_account', 'done', accountNote, now)

    if (user.role === 'admin') {
      steps = setStep(steps, 'lms_course', 'skipped', 'администратор видит курс без назначения', now)
    } else {
      const grant = (await payload.find({ collection: 'learning-access-grants', where: { ruleKey: { equals: `${user.id}:courses:${course.id}` } }, limit: 1, depth: 0, overrideAccess: true, req })).docs[0]
      if (grant) {
        steps = setStep(steps, 'lms_course', grant.effect === 'allow' ? 'done' : 'skipped', grant.effect === 'allow' ? 'курс уже был назначен' : 'на курс стоит запрет, его поставил наставник: не трогаю', now)
      } else {
        await payload.create({
          collection: 'learning-access-grants',
          data: {
            user: user.id, target: { relationTo: 'courses', value: course.id }, effect: 'allow',
            ...(input.accessUntil ? { expiresAt: input.accessUntil } : {}),
            note: `Буткемп: поток ${input.group}, логин GitLab ${input.username}`,
            ruleKey: `${user.id}:courses:${course.id}`,
          },
          overrideAccess: false,
          req,
        })
        steps = setStep(steps, 'lms_course', 'done', input.accessUntil ? `открыт до ${input.accessUntil.slice(0, 10)}` : 'открыт без срока', now)
      }
    }

    enrollment = await payload.create({
      collection: 'bootcamp-enrollments',
      data: {
        lead: lead.id, email: lead.email, firstName: input.firstName, lastName: input.lastName,
        gitlabUsername: input.username, streamGroup: input.group, accessUntil: input.accessUntil,
        status: 'queued', steps, attempts: 0, lmsUser: user.id, requestedBy: admin.id, queuedAt: now,
      },
      overrideAccess: true,
      depth: 0,
      req,
    })
    await commitTransaction(req)
  } catch (error) {
    await killTransaction(req)
    throw error
  }

  void notifyAdmins({
    title: `Зачисление начато: ${lead.email}`,
    lines: [
      `${fullName(input)}, логин GitLab ${input.username}, поток ${input.group}`,
      `LMS: учётка ${accountNote}, курс методичек ${steps.find((step) => step.key === 'lms_course')?.detail ?? ''}`,
      'GitLab: ждёт исполнителя в VM GitLab',
      options.byPayment ? 'Запущено оплатой' : `Запустил: ${actorName(admin)}`,
    ],
    link: leadLink(lead.id),
  })
  await journal(payload, { lead: lead.id, type: 'enrollment_started', actor: options.byPayment ? null : admin, message: `Зачисление начато: логин GitLab ${input.username}, поток ${input.group}${options.byPayment ? ', запущено оплатой' : ''}` })
  return enrollmentView(enrollment)
}

/** Упавшее зачисление снова в очередь: исполнитель повторит только шаги GitLab, сделанные пропустит. */
export async function retryEnrollment(payload: Payload, admin: User, id: number): Promise<EnrollmentView> {
  const result = await db(payload).execute(sql`update bootcamp_enrollments set status = 'queued', error = null, queued_at = now(), started_at = null, finished_at = null, attempts = 0, updated_at = now() where id = ${id} and status = 'failed' returning id`)
  if (rows(result).length === 0) {
    const exists = await payload.findByID({ collection: 'bootcamp-enrollments', id, depth: 0, overrideAccess: true, disableErrors: true })
    throw new EnrollmentInputError(exists ? 'Повторить можно только зачисление с ошибкой' : 'Зачисление не найдено', exists ? 409 : 404)
  }
  const doc = await payload.findByID({ collection: 'bootcamp-enrollments', id, depth: 0, overrideAccess: true })
  const actor = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email
  void notifyAdmins({ title: `Зачисление: повтор шагов GitLab для ${doc.email}`, lines: [`Запустил: ${actor}`], link: leadLink(doc.lead) })
  return enrollmentView(doc)
}

export type WorkerJob = {
  id: number
  email: string
  firstName: string
  lastName: string
  username: string
  group: string
  courseProject: string
  steps: EnrollmentStep[]
}

export type ClaimResult = {
  job: WorkerJob | null
  watch: { id: number, gitlabUserId: number }[]
  webhook: { url: string, token: string } | null
}

/** Исполнитель берёт одно задание. Взятое и брошенное (исполнитель упал) через 10 минут можно взять снова. */
export async function claimEnrollment(payload: Payload): Promise<ClaimResult> {
  const abandoned = rows<{ id: number }>(await db(payload).execute(sql`update bootcamp_enrollments set status = 'failed', error = ${`Исполнитель в VM GitLab не закончил работу за ${MAX_ATTEMPTS} попыток`}, finished_at = now(), updated_at = now() where status = 'running' and started_at < now() - make_interval(mins => ${LEASE_MINUTES}) and coalesce(attempts, 0) >= ${MAX_ATTEMPTS} returning id`))
  for (const { id } of abandoned) await notifyFailure(payload, id)

  const claimed = rows<{ id: number }>(await db(payload).execute(sql`
    update bootcamp_enrollments set status = 'running', started_at = now(), attempts = coalesce(attempts, 0) + 1, updated_at = now()
    where id = (
      select id from bootcamp_enrollments
      where status = 'queued' or (status = 'running' and started_at < now() - make_interval(mins => ${LEASE_MINUTES}))
      order by queued_at nulls first, id
      limit 1
      for update skip locked
    )
    returning id`))
  let job: WorkerJob | null = null
  if (claimed[0]) {
    const doc = await payload.findByID({ collection: 'bootcamp-enrollments', id: claimed[0].id, depth: 0, overrideAccess: true })
    job = { id: doc.id, email: doc.email, firstName: doc.firstName, lastName: doc.lastName, username: doc.gitlabUsername, group: doc.streamGroup, courseProject: BOOTCAMP_COURSE_PROJECT, steps: readSteps(doc.steps) }
  }
  const since = new Date(Date.now() - WATCH_DAYS * 86_400_000).toISOString()
  const watching = await payload.find({
    collection: 'bootcamp-enrollments',
    where: { and: [{ status: { equals: 'done' } }, { gitlabUserId: { exists: true } }, { gitlabSignedInAt: { exists: false } }, { finishedAt: { greater_than: since } }] },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  const token = gitlabWebhookToken()
  return {
    job,
    watch: watching.docs.flatMap((doc) => typeof doc.gitlabUserId === 'number' ? [{ id: doc.id, gitlabUserId: doc.gitlabUserId }] : []),
    webhook: token ? { url: adminLink('/api/bootcamp/gitlab-events'), token } : null,
  }
}

export type WorkerReport = {
  status: 'running' | 'done' | 'failed'
  steps: EnrollmentStep[]
  gitlabUserId?: number
  gitlabProjectId?: number
  gitlabProjectUrl?: string
  error?: string
}

export function parseWorkerReport(body: unknown): WorkerReport {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new EnrollmentInputError('Ожидается объект JSON')
  const input = body as Record<string, unknown>
  if (!['running', 'done', 'failed'].includes(String(input.status))) throw new EnrollmentInputError('status: running, done или failed')
  const id = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
  const url = typeof input.gitlabProjectUrl === 'string' && /^https:\/\/[^\s]{1,290}$/.test(input.gitlabProjectUrl) ? input.gitlabProjectUrl : undefined
  return {
    status: input.status as WorkerReport['status'],
    steps: readSteps(input.steps).filter((step) => step.state !== 'pending'),
    gitlabUserId: id(input.gitlabUserId),
    gitlabProjectId: id(input.gitlabProjectId),
    gitlabProjectUrl: url,
    error: typeof input.error === 'string' && input.error.trim() ? input.error.trim().slice(0, 2000) : undefined,
  }
}

/** Отчёт исполнителя о ходе задания. Принимается, только пока задание у исполнителя. */
export async function reportEnrollment(payload: Payload, id: number, report: WorkerReport): Promise<EnrollmentView> {
  const doc = await payload.findByID({ collection: 'bootcamp-enrollments', id, depth: 0, overrideAccess: true, disableErrors: true })
  if (!doc) throw new EnrollmentInputError('Зачисление не найдено', 404)
  if (doc.status !== 'running') throw new EnrollmentInputError(`Зачисление не у исполнителя (${statusLabel(doc.status)}): отчёт не принят`, 409)
  const finished = report.status !== 'running'
  const updated = await payload.update({
    collection: 'bootcamp-enrollments',
    id,
    data: {
      status: report.status,
      steps: mergeSteps(readSteps(doc.steps), report.steps),
      ...(report.gitlabUserId ? { gitlabUserId: report.gitlabUserId } : {}),
      ...(report.gitlabProjectId ? { gitlabProjectId: report.gitlabProjectId } : {}),
      ...(report.gitlabProjectUrl ? { gitlabProjectUrl: report.gitlabProjectUrl } : {}),
      ...(finished ? { finishedAt: new Date().toISOString() } : {}),
      error: report.status === 'failed' ? report.error ?? 'Исполнитель не указал причину' : null,
    },
    overrideAccess: true,
    depth: 0,
  })
  if (report.status === 'done') {
    // Точечно: сохранение заявки целиком затёрло бы отметки оплаты, которые пишутся параллельно.
    await db(payload).execute(sql`update bootcamp_leads set status = 'enrolled', updated_at = now() where id = ${relationId(updated.lead)}`)
    await journal(payload, { lead: relationId(updated.lead), type: 'enrolled', message: `Зачислен: проект ${updated.gitlabProjectUrl ?? updated.gitlabUsername}` })
    void notifyAdmins({
      title: `Зачислен: ${updated.email}`,
      lines: [
        `${fullName(updated)}, логин GitLab ${updated.gitlabUsername}, поток ${updated.streamGroup}`,
        updated.gitlabProjectUrl ? `Проект: ${updated.gitlabProjectUrl}` : null,
        'Ученику ушли два письма: приглашение в LMS и ссылка для пароля GitLab. Этап заявки: Зачислен',
      ],
      link: leadLink(updated.lead),
    })
  }
  if (report.status === 'failed') await notifyFailure(payload, id)
  return enrollmentView(updated)
}

async function notifyFailure(payload: Payload, id: number): Promise<void> {
  const doc = await payload.findByID({ collection: 'bootcamp-enrollments', id, depth: 0, overrideAccess: true })
  const failed = readSteps(doc.steps).find((step) => step.state === 'failed')
  await journal(payload, { lead: relationId(doc.lead), type: 'enrollment_failed', message: `Зачисление не удалось${failed ? ` на шаге «${stepLabel(failed.key)}»` : ''}: ${doc.error ?? 'причина не указана'}` })
  void notifyAdmins({
    title: `Зачисление не удалось: ${doc.email}`,
    lines: [failed ? `Шаг: ${stepLabel(failed.key)}` : null, doc.error, 'Исправьте причину и нажмите «Повторить» в заявке'],
    link: leadLink(doc.lead),
  })
}

/** Исполнитель увидел первый вход ученика в GitLab. */
export async function reportGitlabSignIn(payload: Payload, id: number, at: string): Promise<void> {
  const when = Number.isFinite(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString()
  const updated = rows<{ id: number }>(await db(payload).execute(sql`update bootcamp_enrollments set gitlab_signed_in_at = ${when}, updated_at = now() where id = ${id} and gitlab_signed_in_at is null returning id`))
  if (updated.length === 0) return
  const doc = await payload.findByID({ collection: 'bootcamp-enrollments', id, depth: 0, overrideAccess: true })
  await journal(payload, { lead: relationId(doc.lead), type: 'gitlab_signed_in', message: `Первый вход в GitLab: ${doc.gitlabUsername}` })
  void notifyAdmins({ title: `Ученик впервые вошёл в GitLab: ${doc.gitlabUsername}`, lines: [fullName(doc), doc.email], link: doc.gitlabProjectUrl ?? leadLink(doc.lead) })
}
