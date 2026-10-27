import 'server-only'

import { ValidationError, type Payload } from 'payload'

import { BOOTCAMP_PROGRAMS, describeLeadSource, type BootcampLeadInput } from '@/lib/bootcamp-leads'
import { collectAllPages } from '@/lib/paginate'
import { logger } from '@/lib/telemetry'
import { bootcampLeadEmail } from '@/payload/emails/templates'
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
      return { outcome: 'created', notification: Promise.all([sendEntryTask(payload, lead), notifyTeam(payload, lead)]).then(() => undefined) }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      lead = await findLead(payload, input)
      if (!lead) throw error
    }
  }
  await markLeadResubmitted(payload, lead.id, now)
  // Повтор — обычно «письмо не пришло»: присылаем ту же ссылку ещё раз, но не чаще раза в 15 минут.
  return { outcome: 'repeat', notification: entryTaskResendDue(lead) ? sendEntryTask(payload, lead) : Promise.resolve() }
}

async function notifyTeam(payload: Payload, lead: BootcampLead): Promise<void> {
  if (!teamMail.take('all')) {
    logger.warn('Bootcamp lead saved without team email: hourly mail limit reached', { 'lead.id': lead.id })
    return
  }
  try {
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
    const recipients = admins.filter((admin) => admin.isActive !== false && admin.email && !admin.email.endsWith('.invalid')).map((admin) => admin.email)
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
  }
}
