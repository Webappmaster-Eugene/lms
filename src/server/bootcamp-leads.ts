import 'server-only'

import { randomUUID } from 'node:crypto'

import { ValidationError, type Payload } from 'payload'

import { formatEntryTaskDate } from '@/lib/bootcamp-entry-task'
import {
  BOOTCAMP_LEAD_HOURS, BOOTCAMP_LEAD_REASONS, BOOTCAMP_LEAD_URGENCIES, BootcampLeadError, describeLeadSource, LEAD_RESUME_MAX_BYTES, LEAD_RESUMES_MAX_TOTAL_BYTES, leadOptionLabel, leadResumeKind, leadResumeName,
  type BootcampLeadInput, type LeadResumeKind,
} from '@/lib/bootcamp-leads'
import type { BootcampProgramConfig } from '@/lib/bootcamp-programs'
import { collectAllPages } from '@/lib/paginate'
import { logger } from '@/lib/telemetry'
import { bootcampLeadEmail } from '@/payload/emails/templates'
import { adminLink, excerpt, notifyAdmins } from '@/server/admin-telegram'
import { entryTaskResendDue, newEntryTaskToken, sendEntryTask } from '@/server/bootcamp-entry-task'
import { journal } from '@/server/bootcamp-lead-events'
import { fillLeadAnswers, leadResumesTotalBytes, markLeadResubmitted, markLeadTeamNotified } from '@/server/bootcamp-lead-marks'
import { findProgram } from '@/server/bootcamp-programs'
import { createRateLimiter } from '@/server/trainer/rate-limit'
import type { BootcampLead } from '@/payload-types'

export type SavedBootcampLead = {
  outcome: 'created' | 'repeat'
  /** Письма команде и кандидату уходят после ответа форме; их сбой заявку не теряет. */
  notification: Promise<void>
}

// Поток спама не должен превращаться в поток писем: сверх предела заявка сохраняется без письма.
const teamMail = createRateLimiter('bootcamp-leads-mail', 30, 60 * 60_000)
// Поток спама не должен забить диск: сверх предела заявка сохраняется без файла.
const resumeStorage = createRateLimiter('bootcamp-lead-resumes', 30, 60 * 60_000)

export type LeadResumeFile = LeadResumeKind & { data: Buffer, originalName: string }

/** Файл из формы; пустое поле - браузер шлёт его, когда файл не выбран. */
export async function readLeadResume(value: FormDataEntryValue | null): Promise<LeadResumeFile | null> {
  if (!(value instanceof File) || (value.size === 0 && value.name === '')) return null
  if (value.size === 0) throw new BootcampLeadError('Файл резюме пустой. Приложите другой файл.', 'resume')
  if (value.size > LEAD_RESUME_MAX_BYTES) throw new BootcampLeadError('Файл резюме больше 5 МБ. Приложите файл поменьше или дайте ссылку на него.', 'resume')
  const data = Buffer.from(await value.arrayBuffer())
  const kind = leadResumeKind(data)
  if (!kind) throw new BootcampLeadError('Резюме принимается в PDF или DOCX. Сохраните файл в одном из них или дайте ссылку на него.', 'resume')
  return { ...kind, data, originalName: leadResumeName(value.name) }
}

/** Сбой файла заявку не теряет: человек уже написал анкету, а резюме сможет прислать в Telegram. */
async function storeResume(payload: Payload, resume: LeadResumeFile): Promise<number | null> {
  if (!resumeStorage.take('all')) {
    logger.warn('Bootcamp lead resume dropped: hourly limit reached')
    return null
  }
  try {
    if (await leadResumesTotalBytes(payload) + resume.data.length > LEAD_RESUMES_MAX_TOTAL_BYTES) {
      logger.error('Bootcamp lead resume dropped: total size limit reached')
      return null
    }
    const doc = await payload.create({
      collection: 'bootcamp-lead-resumes',
      overrideAccess: true,
      depth: 0,
      data: { originalName: resume.originalName },
      // Имя файла на диске своё: чужое могло бы совпасть или подсказать, чьё это резюме.
      file: { data: resume.data, mimetype: resume.mimetype, name: `resume-${randomUUID()}.${resume.extension}`, size: resume.data.length },
    })
    return doc.id
  } catch (error) {
    logger.error('Bootcamp lead resume was not saved', error)
    return null
  }
}

async function dropResume(payload: Payload, id: number | null): Promise<void> {
  if (id === null) return
  await payload.delete({ collection: 'bootcamp-lead-resumes', id, overrideAccess: true }).catch((error: unknown) => {
    logger.error('Orphan bootcamp lead resume was not deleted', error, { 'resume.id': id })
  })
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    if ((current as { code?: unknown }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  // Payload переводит нарушение уникального индекса в ValidationError.
  return error instanceof ValidationError
}

async function findLead(payload: Payload, input: BootcampLeadInput): Promise<BootcampLead | undefined> {
  const found = await payload.find({
    collection: 'bootcamp-leads',
    where: { and: [{ program: { equals: input.program } }, { email: { equals: input.email } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs[0]
}

/**
 * Сохраняет заявку. Повтор того же адреса — в том числе параллельный — не создаёт
 * вторую запись и не подменяет первую: растёт только счётчик отправок.
 */
export async function saveBootcampLead(payload: Payload, input: BootcampLeadInput, resume: LeadResumeFile | null = null): Promise<SavedBootcampLead> {
  // Программа - запись в CMS: форма лендинга присылает только её ключ.
  const program = await findProgram(payload, input.program)
  if (!program) throw new BootcampLeadError('Такой программы нет. Обновите страницу и отправьте заявку ещё раз.')
  const now = new Date().toISOString()
  let lead = await findLead(payload, input)
  // Закрытый набор не принимает новые заявки, а повтор старой (письмо не дошло) обрабатывается как обычно.
  if (!lead && !program.isActive) throw new BootcampLeadError(`Набор на буткемп ${program.shortTitle} сейчас закрыт. Следите за новостями на странице буткемпа.`)
  if (!lead) {
    const resumeId = resume ? await storeResume(payload, resume) : null
    try {
      lead = await payload.create({
        collection: 'bootcamp-leads',
        overrideAccess: true,
        depth: 0,
        data: {
          program: input.program, email: input.email, name: input.name, status: 'new', source: input.source,
          telegram: input.telegram, reason: input.reason, problem: input.problem, story: input.story, goal: input.goal,
          urgency: input.urgency, hoursPerWeek: input.hoursPerWeek, links: input.links, fillSeconds: input.fillSeconds, resume: resumeId,
          consentVersion: input.consentVersion, consentAt: now, submissionCount: 1, lastSubmittedAt: now,
          entryTaskToken: newEntryTaskToken(),
        },
      })
      const created = lead
      const resumeLost = resume !== null && resumeId === null
      return {
        outcome: 'created',
        // Задание не уходит само: сначала анкету читает владелец (решение от 05.11.2026).
        notification: notifyTeam(payload, created, program, resumeLost).then(async () => {
          await journal(payload, { lead: created.id, type: 'lead_created', message: 'Заявка с лендинга, ждёт проверки анкеты' })
          await notifyAdmins(leadEvent(created, program, 1, 'not-sent', true, resumeLost))
        }),
      }
    } catch (error) {
      await dropResume(payload, resumeId)
      if (!isUniqueViolation(error)) throw error
      lead = await findLead(payload, input)
      if (!lead) throw error
    }
  }
  await markLeadResubmitted(payload, lead.id, now)
  // Заявка со старой формы: анкеты в ней нет, и первая заполненная становится её анкетой, иначе ответы пропали бы.
  let answered = false
  let resumeLost = false
  if (!lead.problem && lead.status === 'new') {
    const resumeId = resume ? await storeResume(payload, resume) : null
    answered = await fillLeadAnswers(payload, lead.id, input, resumeId)
    if (!answered) await dropResume(payload, resumeId)
    resumeLost = answered && resume !== null && resumeId === null
  }
  const repeated: BootcampLead = answered ? await payload.findByID({ collection: 'bootcamp-leads', id: lead.id, depth: 0, overrideAccess: true }) : lead
  const count = (lead.submissionCount ?? 1) + 1
  // Если задание уже отправляли, повтор - обычно «письмо не пришло»: присылаем ту же ссылку ещё раз, но не чаще раза в 15 минут.
  // Пока владелец его не отправил, повтор заявки выдать задание не может.
  const sent = Boolean(lead.entryTaskSentAt)
  const notification = sent && entryTaskResendDue(lead)
    ? sendEntryTask(payload, lead).then((dueAt) => notifyAdmins(leadEvent(repeated, program, count, dueAt === null ? 'failed' : dueAt, answered, resumeLost)))
    : notifyAdmins(leadEvent(repeated, program, count, sent ? 'not-due' : 'not-sent', answered, resumeLost))
  return { outcome: 'repeat', notification }
}

function fillTime(seconds: number | null | undefined): string | null {
  if (!seconds) return null
  return `Время заполнения: ${seconds < 60 ? `${seconds} с` : `${Math.round(seconds / 60)} мин`}`
}

/** Сообщение в Telegram о заявке: кто, что написал в анкете и ушло ли письмо с заданием. Файл резюме в Telegram не уходит. */
function leadEvent(lead: BootcampLead, config: BootcampProgramConfig, submission: number, entryTask: string | 'failed' | 'not-due' | 'not-sent', withAnswers: boolean, resumeLost = false) {
  const program = config.shortTitle
  const who = [lead.name?.trim(), lead.email].filter(Boolean).join(', ')
  const task = entryTask === 'failed'
    ? 'Письмо с входным заданием не ушло, подробности в журнале приложения'
    : entryTask === 'not-due'
      ? 'Письмо с заданием повторно не отправлялось: с прошлого прошло меньше 15 минут'
      : entryTask === 'not-sent'
        ? 'Входное задание ещё не отправлено: кнопка в карточке заявки'
        : `Письмо с входным заданием ушло, срок до ${formatEntryTaskDate(entryTask)}`
  const answers = withAnswers ? [
    lead.telegram ? `Telegram: ${lead.telegram}` : null,
    leadOptionLabel(BOOTCAMP_LEAD_REASONS, lead.reason) ? `Тема: ${leadOptionLabel(BOOTCAMP_LEAD_REASONS, lead.reason)}` : null,
    leadOptionLabel(BOOTCAMP_LEAD_URGENCIES, lead.urgency) ? `Срочность: ${leadOptionLabel(BOOTCAMP_LEAD_URGENCIES, lead.urgency)}` : null,
    leadOptionLabel(BOOTCAMP_LEAD_HOURS, lead.hoursPerWeek) ? `Часов в неделю: ${leadOptionLabel(BOOTCAMP_LEAD_HOURS, lead.hoursPerWeek)}` : null,
    // Предел Telegram 4096 знаков: целиком ответы лежат в карточке и в письме.
    lead.problem ? `Проблема: ${excerpt(lead.problem, 900)}` : null,
    lead.story ? `История: ${excerpt(lead.story, 900)}` : null,
    lead.goal ? `Результат: ${excerpt(lead.goal, 400)}` : null,
    lead.links ? `Ссылки: ${excerpt(lead.links.split('\n').join(' '))}` : null,
    resumeLost ? 'Резюме приложено, но файл не сохранился: подробности в журнале приложения' : lead.resume ? 'Резюме приложено, файл в карточке' : null,
    fillTime(lead.fillSeconds),
  ] : []
  return {
    title: submission === 1 ? `Новая заявка на буткемп ${program}` : `Повторная заявка на буткемп ${program} (${submission}-я отправка формы)`,
    lines: [who, ...answers, `Откуда: ${describeLeadSource(lead.source)}`, task],
    link: adminLink(`/admin/collections/bootcamp-leads/${lead.id}`),
  }
}

/** Адреса действующих администраторов: им уходят письма о заявках и решениях входного задания. */
export async function adminEmails(payload: Payload): Promise<string[]> {
  const admins = await collectAllPages(
    ({ page, limit }) => payload.find({
      collection: 'users',
      where: { role: { equals: 'admin' } },
      select: { email: true, isActive: true },
      depth: 0,
      sort: 'id',
      page,
      limit,
      overrideAccess: true,
    }),
    { label: 'администраторы' },
  )
  // .invalid по RFC 2606 не доставляется: временные учётки проверок дали бы отказы почты.
  return admins.filter((admin) => admin.isActive !== false && admin.email && !admin.email.endsWith('.invalid')).map((admin) => admin.email)
}

async function notifyTeam(payload: Payload, lead: BootcampLead, program: BootcampProgramConfig, resumeLost: boolean): Promise<void> {
  if (!teamMail.take('all')) {
    logger.warn('Bootcamp lead saved without team email: hourly mail limit reached', { 'lead.id': lead.id })
    return
  }
  try {
    const recipients = await adminEmails(payload)
    if (recipients.length === 0) {
      logger.warn('Bootcamp lead saved, but no admin address to notify', { 'lead.id': lead.id })
      return
    }
    const content = bootcampLeadEmail({
      id: lead.id,
      address: lead.email,
      name: lead.name ?? null,
      program: program.title,
      source: describeLeadSource(lead.source),
      telegram: lead.telegram ?? null,
      reason: leadOptionLabel(BOOTCAMP_LEAD_REASONS, lead.reason),
      problem: lead.problem ?? null,
      story: lead.story ?? null,
      goal: lead.goal ?? null,
      urgency: leadOptionLabel(BOOTCAMP_LEAD_URGENCIES, lead.urgency),
      hoursPerWeek: leadOptionLabel(BOOTCAMP_LEAD_HOURS, lead.hoursPerWeek),
      links: lead.links ?? null,
      resume: resumeLost ? 'приложено, но файл не сохранился' : lead.resume ? 'файл в карточке заявки' : 'нет',
    })
    for (const to of recipients) await payload.sendEmail({ to, ...content })
    await markLeadTeamNotified(payload, lead.id)
  } catch (error) {
    logger.error('Bootcamp lead notification failed', error, { 'lead.id': lead.id })
    await notifyAdmins({ title: 'Письмо команде о заявке на буткемп не ушло', lines: [lead.email, 'Заявка сохранена, подробности в журнале приложения'], link: adminLink(`/admin/collections/bootcamp-leads/${lead.id}`) })
  }
}
