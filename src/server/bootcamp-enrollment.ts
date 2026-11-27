import 'server-only'

import { randomBytes } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type PayloadRequest } from 'payload'

import {
  DEFAULT_COURSE_PROJECT,
  DEFAULT_GRADING_PROJECT,
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
import { ownedProjectLink } from '@/lib/bootcamp-defense'
import { relationId } from '@/lib/relation-id'
import { adminLink, notifyAdmins } from '@/server/admin-telegram'
import { actorName, inTransaction, journal, recordLeadEvent, txDb } from '@/server/bootcamp-lead-events'
import { lockLearningAccess } from '@/payload/hooks/learningAccessLock'
import { advanceWaitingAccounts, reserveGitlabIdentity, verifiedGitlabIds } from '@/server/bootcamp-gitlab-account'
import { hasEnrollmentIdentity } from '@/server/enrollment-identity'
import { admissionStreams, assertKnownStreamGroup, requireProgram } from '@/server/bootcamp-programs'
import { gitlabWebhookToken } from '@/server/bootcamp-worker-auth'
import type { BootcampEnrollment, BootcampLead, User } from '@/payload-types'
import { getAccountFreeze } from '@/server/account-freeze'

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
  revokeRequestedAt: string | null
  revokedAt: string | null
  revokeError: string | null
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
    revokeRequestedAt: doc.revokeRequestedAt ?? null,
    revokedAt: doc.revokedAt ?? null,
    revokeError: doc.revokeError ?? null,
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
  defaults: { firstName: string, lastName: string, username: string, group: string, streams: { group: string, title: string }[] }
}

/** Что показывает панель «Зачисление» в заявке: само зачисление или подсказки для формы. */
export async function leadEnrollmentState(payload: Payload, leadId: number): Promise<LeadEnrollmentState> {
  const lead = await findLead(payload, leadId)
  if (!lead) throw new EnrollmentInputError('Заявка не найдена', 404)
  const enrollment = await enrollmentOfLead(payload, leadId)
  const program = await requireProgram(payload, lead.program)
  const [streams, accounts] = await Promise.all([
    admissionStreams(payload, program),
    db(payload).execute(sql`
      select e.gitlab_username from bootcamp_enrollments e join users u on u.id=e.lms_user_id
      where u.email=${lead.email.toLowerCase()} and e.status='done' and e.gitlab_user_id>0 order by e.finished_at desc nulls last, e.id desc limit 1`),
  ])
  const prior = rows<{ gitlab_username: string }>(accounts)[0]
  return {
    lead: { id: lead.id, email: lead.email, name: lead.name ?? null, status: lead.status, statusLabel: BOOTCAMP_LEAD_STATUSES.find((item) => item.value === lead.status)?.label ?? lead.status },
    enrollment: enrollment ? enrollmentView(enrollment) : null,
    defaults: { ...splitName(lead.name), username: prior?.gitlab_username ?? suggestUsername(lead.email), group: streams[0]?.group ?? '', streams },
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
  if (lead.status === 'refunded') throw new EnrollmentInputError('Деньги по заявке возвращены: зачислять нельзя', 409)
  if (await enrollmentOfLead(payload, leadId)) throw new EnrollmentInputError('По этой заявке уже есть зачисление, его ход виден в панели', 409)
  const program = await requireProgram(payload, lead.program)
  const course = program.manualsCourseId === null ? null : await payload.findByID({ collection: 'courses', id: program.manualsCourseId, depth: 0, overrideAccess: true, disableErrors: true })
  if (!course) throw new EnrollmentInputError(`У программы «${program.shortTitle}» не выбран курс методичек или его нет: CMS, Буткемпы, Программы буткемпов`, 409)
  // Оплата зачисляет с группой, которую проверил допуск; кнопка «Зачислить» вводит её заново.
  if (!options.byPayment) await assertKnownStreamGroup(payload, program, input.group)

  const req = await createLocalReq({ user: admin }, payload)
  if (!(await initTransaction(req))) throw new Error('Enrollment requires a transaction')
  const now = new Date().toISOString()
  let steps = initialSteps()
  let enrollment: BootcampEnrollment
  let accountNote: string
  try {
    const tx = await txDb(req)
    const locked = rows(await tx.execute(sql`select id from bootcamp_leads where id = ${leadId} and paid_at is not null and status <> 'refunded' for update`))
    if (!locked.length) throw new EnrollmentInputError('Оплата больше не действует. Обновите заявку.', 409)
    const duplicate = rows(await tx.execute(sql`select id from bootcamp_enrollments where lead_id = ${leadId}`))
    if (duplicate.length) throw new EnrollmentInputError('Зачисление уже запущено. Обновите заявку.', 409)
    const identity = await reserveGitlabIdentity(req, lead, input.username, input.group)
    const existing = (await payload.find({ collection: 'users', where: { email: { equals: lead.email } }, limit: 1, depth: 0, overrideAccess: true, req })).docs[0]
    let user: User
    if (existing) {
      if (existing.isActive === false) throw new EnrollmentInputError('Учётка LMS с этой почтой отключена: включите её или разберитесь вручную', 409)
      await lockLearningAccess(req, existing.id)
      if (!await hasEnrollmentIdentity(req, existing.id, lead.email)) {
        throw new EnrollmentInputError('Оплата сохранена. В разделе «Ученики и доступы» один раз сверьте почту ученика, затем вернитесь в заявку и нажмите «Зачислить».', 409)
      }
      if ((await getAccountFreeze(payload, existing.id, req)).active) throw new EnrollmentInputError('Учётка LMS с этой почтой заморожена: разморозьте её на экране «Ученики и доступы» и зачислите снова', 409)
      user = existing
      accountNote = existing.role === 'admin' ? 'учётка уже была, это администратор' : 'учётка уже была, приглашение не отправлялось'
    } else {
      // Пароль никто не узнаёт: ученик задаёт свой по ссылке из приглашения.
      user = await payload.create({
        collection: 'users',
        // Учётка по тестовой заявке - тестовый ученик: правило «заморозка через 6 месяцев» её не касается.
        data: { email: lead.email, firstName: input.firstName, lastName: input.lastName, role: 'student', password: randomBytes(24).toString('base64url'), isTestStudent: lead.isTest === true },
        overrideAccess: false,
        req,
      })
      accountNote = 'создана, приглашение ушло на почту (ссылка действует 7 дней)'
    }
    steps = setStep(steps, 'lms_account', 'done', accountNote, now)

    if (user.role === 'admin') {
      steps = setStep(steps, 'lms_course', 'skipped', 'администратор видит курс без назначения', now)
    } else {
      await lockLearningAccess(req, user.id)
      const note = `Буткемп: поток ${input.group}, логин GitLab ${input.username}`
      const grant = (await payload.find({ collection: 'learning-access-grants', where: { ruleKey: { equals: `${user.id}:courses:${course.id}` } }, limit: 1, depth: 0, overrideAccess: true, req })).docs[0]
      if (grant) {
        if (grant.effect === 'allow' && grant.note?.startsWith('Буткемп: поток ') && grant.expiresAt &&
          (!input.accessUntil || Date.parse(input.accessUntil) > Date.parse(grant.expiresAt))) {
          await payload.update({ collection: 'learning-access-grants', id: grant.id, data: { expiresAt: input.accessUntil, note }, req, overrideAccess: false })
        }
        steps = setStep(steps, 'lms_course', grant.effect === 'allow' ? 'done' : 'skipped', grant.effect === 'allow' ? 'курс уже был назначен' : 'на курс стоит запрет, его поставил наставник: не трогаю', now)
      } else {
        await payload.create({
          collection: 'learning-access-grants',
          data: {
            user: user.id, target: { relationTo: 'courses', value: course.id }, effect: 'allow',
            ...(input.accessUntil ? { expiresAt: input.accessUntil } : {}),
            note,
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
        needsVerifiedGitlabAccount: identity.needsVerification, gitlabUserId: identity.gitlabUserId,
        ...(identity.needsVerification && !identity.gitlabUserId ? { error: 'Ждем подтверждения учетной записи GitLab по предыдущей выдаче проекта.' } : {}),
        program: program.key, manualsCourse: course.id, courseProject: program.gitlabCourseProject, gradingProject: program.gradingProject,
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

  await notifyAdmins(payload, {
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
  // После возврата денег зачисление не повторяется: исполнитель заново выдал бы доступ.
  const result = await db(payload).execute(sql`update bootcamp_enrollments set status = 'queued', error = null, queued_at = now(), started_at = coalesce(started_at, finished_at, now()), finished_at = null, attempts = 0, updated_at = now() where id = ${id} and status = 'failed' and revoke_requested_at is null returning id`)
  if (rows(result).length === 0) {
    const exists = await payload.findByID({ collection: 'bootcamp-enrollments', id, depth: 0, overrideAccess: true, disableErrors: true })
    if (!exists) throw new EnrollmentInputError('Зачисление не найдено', 404)
    throw new EnrollmentInputError(exists.revokeRequestedAt ? 'Деньги по заявке возвращены: повторять зачисление нельзя' : 'Повторить можно только зачисление с ошибкой', 409)
  }
  const doc = await payload.findByID({ collection: 'bootcamp-enrollments', id, depth: 0, overrideAccess: true })
  const actor = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.email
  await notifyAdmins(payload, { title: `Зачисление: повтор шагов GitLab для ${doc.email}`, lines: [`Запустил: ${actor}`], link: leadLink(doc.lead) })
  return enrollmentView(doc)
}

export type WorkerJob = {
  id: number
  email: string
  firstName: string
  lastName: string
  username: string
  group: string
  gitlabUserId?: number
  gitlabProjectId?: number
  courseProject: string
  /** Проект проверки сдач: в его GRADER_GROUPS должна быть группа потока. */
  gradingProject: string
  steps: EnrollmentStep[]
}

export type ClaimResult = {
  job: WorkerJob | null
  watch: { id: number, gitlabUserId: number }[]
  webhook: { url: string, token: string } | null
  /** После возврата денег: проекты GitLab, к которым исполнитель закрывает доступ. Старый исполнитель поле не читает. */
  revoke: { id: number, gitlabUserId: number | null, gitlabProjectId: number | null, username: string, group?: string, email?: string, revision?: string }[]
}

/** Исполнитель берёт одно задание. Взятое и брошенное (исполнитель упал) через 10 минут можно взять снова. */
export async function claimEnrollment(payload: Payload, verifiedAccounts = false): Promise<ClaimResult> {
  await db(payload).execute(sql`update bootcamp_enrollments set status = 'failed', error = 'После возврата проверяем доступ к проекту', finished_at = now(), updated_at = now()
    where status = 'running' and revoke_requested_at is not null and (started_at is null or started_at < now() - make_interval(mins => ${LEASE_MINUTES}))`)
  const abandoned = rows<{ id: number }>(await db(payload).execute(sql`update bootcamp_enrollments set status = 'failed', error = ${`Исполнитель в VM GitLab не закончил работу за ${MAX_ATTEMPTS} попыток`}, finished_at = now(), updated_at = now() where status = 'running' and revoke_requested_at is null and started_at < now() - make_interval(mins => ${LEASE_MINUTES}) and coalesce(attempts, 0) >= ${MAX_ATTEMPTS} returning id`))
  for (const { id } of abandoned) await notifyFailure(payload, id)

  if (verifiedAccounts) {
    await advanceWaitingAccounts(payload)
    // При двух оплатах первая выдача подтверждает учетку; вторая получает только ID того же ученика.
    await db(payload).execute(sql`
      with known as (
        select c.id, a.gid from bootcamp_enrollments c
        cross join lateral (select min(gid) as gid from (${verifiedGitlabIds(sql`c.lms_user_id`)}) ids having count(*) = 1) a
        where c.needs_verified_gitlab_account and c.status = 'queued' and c.gitlab_user_id is null
          and c.revoke_requested_at is null and c.lms_user_id is not null
      )
      update bootcamp_enrollments e set gitlab_user_id = known.gid, error = null, updated_at = now()
      from known where e.id = known.id and e.gitlab_user_id is null and e.status = 'queued' and e.revoke_requested_at is null`)
  }
  const claimed = rows<{ id: number }>(await db(payload).execute(sql`
    update bootcamp_enrollments set status = 'running', started_at = now(), attempts = coalesce(attempts, 0) + 1, updated_at = now()
    where id = (
      select id from bootcamp_enrollments
      where (status = 'queued' or (status = 'running' and started_at < now() - make_interval(mins => ${LEASE_MINUTES})))
        and revoke_requested_at is null and revoked_at is null
        and (needs_verified_gitlab_account is not true or (${verifiedAccounts} and gitlab_user_id > 0))
      order by queued_at nulls first, id
      limit 1
      for update skip locked
    )
    returning id`))
  let job: WorkerJob | null = null
  if (claimed[0]) {
    const doc = await payload.findByID({ collection: 'bootcamp-enrollments', id: claimed[0].id, depth: 0, overrideAccess: true })
    job = {
      id: doc.id, email: doc.email, firstName: doc.firstName, lastName: doc.lastName, username: doc.gitlabUsername, group: doc.streamGroup,
      ...(verifiedAccounts && doc.gitlabUserId ? { gitlabUserId: doc.gitlabUserId } : {}),
      ...(verifiedAccounts && doc.gitlabProjectId ? { gitlabProjectId: doc.gitlabProjectId } : {}),
      courseProject: doc.courseProject || DEFAULT_COURSE_PROJECT, gradingProject: doc.gradingProject || DEFAULT_GRADING_PROJECT, steps: readSteps(doc.steps),
    }
  }
  const since = new Date(Date.now() - WATCH_DAYS * 86_400_000).toISOString()
  const watching = await payload.find({
    collection: 'bootcamp-enrollments',
    where: { and: [{ status: { equals: 'done' } }, { gitlabUserId: { exists: true } }, { gitlabSignedInAt: { exists: false } }, { finishedAt: { greater_than: since } }, { revokeRequestedAt: { exists: false } }] },
    limit: 50,
    depth: 0,
    overrideAccess: true,
  })
  const token = gitlabWebhookToken()
  const revoking = rows<{ id: number, gitlab_user_id: number | null, gitlab_project_id: number | string | null, gitlab_username: string, stream_group: string, email: string, revoke_requested_at: Date | string }>(await db(payload).execute(sql`
    select id, gitlab_user_id, gitlab_project_id, gitlab_username, stream_group, email, revoke_requested_at from bootcamp_enrollments
    where revoke_requested_at is not null and revoked_at is null and revoke_error is null and status <> 'running'
      and (${verifiedAccounts} or (needs_verified_gitlab_account is not true and gitlab_user_id > 0 and gitlab_project_id > 0))
    order by revoke_requested_at, id limit 20`))
  return {
    job,
    watch: watching.docs.flatMap((doc) => typeof doc.gitlabUserId === 'number' ? [{ id: doc.id, gitlabUserId: doc.gitlabUserId }] : []),
    webhook: token ? { url: adminLink('/api/bootcamp/gitlab-events'), token } : null,
    revoke: revoking.map((row) => ({ id: Number(row.id), gitlabUserId: row.gitlab_user_id === null ? null : Number(row.gitlab_user_id), username: row.gitlab_username, gitlabProjectId: row.gitlab_project_id === null ? null : Number(row.gitlab_project_id), ...(verifiedAccounts ? { group: row.stream_group, email: row.email, revision: new Date(row.revoke_requested_at).toISOString() } : {}) })),
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

async function saveWorkerReport(req: PayloadRequest, id: number, report: WorkerReport) {
  const payload = req.payload
  const tx = await txDb(req)
  await tx.execute(sql`select l.id from bootcamp_leads l join bootcamp_enrollments e on e.lead_id = l.id where e.id = ${id} for update of l`)
  await tx.execute(sql`select id from bootcamp_enrollments where id = ${id} for update`)
  const doc = await payload.findByID({ collection: 'bootcamp-enrollments', id, depth: 0, overrideAccess: true, disableErrors: true, req })
  if (!doc) throw new EnrollmentInputError('Зачисление не найдено', 404)
  if (doc.status !== 'running' && !doc.revokeRequestedAt) throw new EnrollmentInputError(`Зачисление не у исполнителя (${statusLabel(doc.status)}): отчёт не принят`, 409)
  if ((doc.gitlabUserId && report.gitlabUserId && doc.gitlabUserId !== report.gitlabUserId) ||
      (doc.gitlabProjectId && report.gitlabProjectId && doc.gitlabProjectId !== report.gitlabProjectId)) {
    throw new EnrollmentInputError('Исполнитель сообщил другой ID ученика или проекта GitLab', 409)
  }
  if (!doc.revokeRequestedAt && doc.needsVerifiedGitlabAccount && report.status === 'done' &&
    (!doc.gitlabUserId || report.gitlabUserId !== doc.gitlabUserId || !(report.gitlabProjectId ?? doc.gitlabProjectId)
      || !ownedProjectLink(report.gitlabProjectUrl ?? doc.gitlabProjectUrl, doc.streamGroup, doc.gitlabUsername))) {
    throw new EnrollmentInputError('Для второй покупки подтвердите ID ученика и отдельный проект этого потока', 409)
  }
  if (doc.needsVerifiedGitlabAccount && report.gitlabProjectId) {
    const collision = rows(await tx.execute(sql`
      select id from bootcamp_enrollments where id <> ${id} and gitlab_project_id = ${report.gitlabProjectId}
      union all select id from tutoring_projects where project_id = ${report.gitlabProjectId} limit 1`))
    if (collision.length) throw new EnrollmentInputError('Этот проект GitLab уже выдан в другом зачислении', 409)
  }
  const finished = report.status !== 'running'
  const updated = await payload.update({
    collection: 'bootcamp-enrollments',
    id,
    data: {
      status: doc.revokeRequestedAt ? 'failed' : report.status,
      steps: mergeSteps(readSteps(doc.steps), report.steps),
      ...(report.gitlabUserId ? { gitlabUserId: report.gitlabUserId } : {}),
      ...(report.gitlabProjectId ? { gitlabProjectId: report.gitlabProjectId } : {}),
      ...(report.gitlabProjectUrl ? { gitlabProjectUrl: report.gitlabProjectUrl } : {}),
      ...(finished ? { finishedAt: new Date().toISOString() } : {}),
      error: doc.revokeRequestedAt ? 'После возврата проверяем доступ к проекту' : report.status === 'failed' ? report.error ?? 'Исполнитель не указал причину' : null,
      // Запоздалый отчет мог прийти уже после отзыва: новую проверку завершает исполнитель v2.
      ...(doc.revokeRequestedAt ? { revokeRequestedAt: new Date(Math.max(Date.now(), Date.parse(doc.revokeRequestedAt) + 1)).toISOString(),
        needsVerifiedGitlabAccount: true, revokedAt: null, revokeError: null } : {}),
    },
    overrideAccess: true,
    req,
    depth: 0,
  })
  if (!updated.revokeRequestedAt && report.status === 'done') {
    await tx.execute(sql`update bootcamp_leads set status = 'enrolled', updated_at = now() where id = ${relationId(updated.lead)} and status <> 'refunded'`)
    await recordLeadEvent(payload, req, { lead: relationId(updated.lead), type: 'enrolled', message: `Зачислен: проект ${updated.gitlabProjectUrl ?? updated.gitlabUsername}` })
  }
  return updated
}

export async function reportEnrollment(payload: Payload, id: number, report: WorkerReport): Promise<EnrollmentView> {
  const updated = await inTransaction(payload, null, req => saveWorkerReport(req, id, report))
  if (updated.revokeRequestedAt) throw new EnrollmentInputError('Выдача остановлена после возврата. Доступ поставлен на проверку.', 409)
  if (report.status === 'done') {
    await notifyAdmins(payload, {
      title: `Зачислен: ${updated.email}`,
      lines: [
        `${fullName(updated)}, логин GitLab ${updated.gitlabUsername}, поток ${updated.streamGroup}`,
        updated.gitlabProjectUrl ? `Проект: ${updated.gitlabProjectUrl}` : null,
        'Ученик зачислен. Ссылка на проект доступна в его кабинете.',
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
  await notifyAdmins(payload, {
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
  await notifyAdmins(payload, { title: `Ученик впервые вошёл в GitLab: ${doc.gitlabUsername}`, lines: [fullName(doc), doc.email], link: doc.gitlabProjectUrl ?? leadLink(doc.lead) })
}
