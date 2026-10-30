import 'server-only'

import { ValidationError, type Payload } from 'payload'

import { formatEntryTaskDate } from '@/lib/bootcamp-entry-task'
import { BOOTCAMP_PROGRAMS, describeLeadSource, type BootcampLeadInput } from '@/lib/bootcamp-leads'
import { collectAllPages } from '@/lib/paginate'
import { logger } from '@/lib/telemetry'
import { bootcampLeadEmail } from '@/payload/emails/templates'
import { adminLink, notifyAdmins } from '@/server/admin-telegram'
import { entryTaskResendDue, newEntryTaskToken, sendEntryTask } from '@/server/bootcamp-entry-task'
import { markLeadResubmitted, markLeadTeamNotified } from '@/server/bootcamp-lead-marks'
import { createRateLimiter } from '@/server/trainer/rate-limit'
import type { BootcampLead } from '@/payload-types'

export type SavedBootcampLead = {
  outcome: 'created' | 'repeat'
  /** Письма команде и кандидату уходят после ответа форме; их сбой заявку не теряет. */
  notification: Promise<void>
}

// Поток спама не должен превращаться в поток писем: сверх предела заявка сохраняется без письма.
const teamMail = createRateLimiter('bootcamp-leads-mail', 30, 60 * 60_000)

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
export async function saveBootcampLead(payload: Payload, input: BootcampLeadInput): Promise<SavedBootcampLead> {
  const now = new Date().toISOString()
  let lead = await findLead(payload, input)
  if (!lead) {
    try {
      lead = await payload.create({
        collection: 'bootcamp-leads',
        overrideAccess: true,
        depth: 0,
        data: {
          program: input.program, email: input.email, name: input.name, status: 'new', source: input.source,
          consentVersion: input.consentVersion, consentAt: now, submissionCount: 1, lastSubmittedAt: now,
          entryTaskToken: newEntryTaskToken(),
        },
      })
      const created = lead
      return {
        outcome: 'created',
        notification: Promise.all([sendEntryTask(payload, created), notifyTeam(payload, created)]).then(([dueAt]) => notifyAdmins(leadEvent(created, 1, dueAt === null ? 'failed' : dueAt))),
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      lead = await findLead(payload, input)
      if (!lead) throw error
    }
  }
  await markLeadResubmitted(payload, lead.id, now)
  const repeated = lead
  const count = (lead.submissionCount ?? 1) + 1
  // Повтор — обычно «письмо не пришло»: присылаем ту же ссылку ещё раз, но не чаще раза в 15 минут.
  const notification = entryTaskResendDue(lead)
    ? sendEntryTask(payload, lead).then((dueAt) => notifyAdmins(leadEvent(repeated, count, dueAt === null ? 'failed' : dueAt)))
    : notifyAdmins(leadEvent(repeated, count, 'not-due'))
  return { outcome: 'repeat', notification }
}

/** Сообщение в Telegram о заявке: кто, откуда и ушло ли письмо с заданием. */
function leadEvent(lead: BootcampLead, submission: number, entryTask: string | 'failed' | 'not-due') {
  const program = BOOTCAMP_PROGRAMS.find((item) => item.value === lead.program)?.short ?? lead.program
  const who = [lead.name?.trim(), lead.email].filter(Boolean).join(', ')
  const task = entryTask === 'failed'
    ? 'Письмо с входным заданием не ушло, подробности в журнале приложения'
    : entryTask === 'not-due'
      ? 'Письмо с заданием повторно не отправлялось: с прошлого прошло меньше 15 минут'
      : `Письмо с входным заданием ушло, срок до ${formatEntryTaskDate(entryTask)}`
  return {
    title: submission === 1 ? `Новая заявка на буткемп ${program}` : `Повторная заявка на буткемп ${program} (${submission}-я отправка формы)`,
    lines: [who, `Откуда: ${describeLeadSource(lead.source)}`, task],
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

async function notifyTeam(payload: Payload, lead: BootcampLead): Promise<void> {
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
      program: BOOTCAMP_PROGRAMS.find((item) => item.value === lead.program)?.label ?? lead.program,
      source: describeLeadSource(lead.source),
    })
    for (const to of recipients) await payload.sendEmail({ to, ...content })
    await markLeadTeamNotified(payload, lead.id)
  } catch (error) {
    logger.error('Bootcamp lead notification failed', error, { 'lead.id': lead.id })
    await notifyAdmins({ title: 'Письмо команде о заявке на буткемп не ушло', lines: [lead.email, 'Заявка сохранена, подробности в журнале приложения'], link: adminLink(`/admin/collections/bootcamp-leads/${lead.id}`) })
  }
}
