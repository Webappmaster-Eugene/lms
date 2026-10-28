import 'server-only'

import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'

import { ENTRY_TASK_MINUTES } from '@/data/bootcamp-entry/tasks'
import { entryTaskDueAt, entryTaskPath, ENTRY_TASK_REVIEW_DAYS, formatEntryTaskDate, isEntryTaskToken } from '@/lib/bootcamp-entry-task'
import { BOOTCAMP_PROGRAMS } from '@/lib/bootcamp-leads'
import { logger } from '@/lib/telemetry'
import { bootcampEntryTaskEmail, emailBaseUrl } from '@/payload/emails/templates'
import { ensureLeadEntryTaskToken, markLeadEntryTaskSent } from '@/server/bootcamp-lead-marks'
import { contactReplyTo } from '@/server/contact-reply-to'
import { createRateLimiter } from '@/server/trainer/rate-limit'
import type { BootcampEntryTask, BootcampLead } from '@/payload-types'

// Форма открыта всем: без предела её можно превратить в рассылку писем на чужие адреса.
const candidateMail = createRateLimiter('bootcamp-entry-task-mail', 30, 60 * 60_000)

/** Повтор заявки пришлёт письмо снова не раньше этого срока: письмо могло уйти в спам. */
export const ENTRY_TASK_RESEND_AFTER_MS = 15 * 60_000

/** Письма, которые уже уходят: параллельные повторы одной заявки не шлют второе. */
const sending = new Set<number>()

export function newEntryTaskToken(): string {
  return randomBytes(24).toString('base64url')
}

export async function findLeadByEntryTaskToken(payload: Payload, token: string): Promise<BootcampLead | null> {
  if (!isEntryTaskToken(token)) return null
  const found = await payload.find({
    collection: 'bootcamp-leads',
    where: { entryTaskToken: { equals: token } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs[0] ?? null
}

export async function currentEntryTask(payload: Payload, program: BootcampLead['program']): Promise<BootcampEntryTask | null> {
  const found = await payload.find({
    collection: 'bootcamp-entry-tasks',
    where: { and: [{ program: { equals: program } }, { active: { equals: true } }] },
    sort: '-updatedAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs[0] ?? null
}

export async function readEntryTaskArchive(payload: Payload, task: BootcampEntryTask): Promise<Buffer | null> {
  const upload = payload.collections['bootcamp-entry-tasks'].config.upload
  if (!task.filename || !upload?.staticDir) return null
  const directory = path.resolve(upload.staticDir)
  const file = path.resolve(directory, task.filename)
  // Имя файла приходит из базы, но выйти из каталога заданий оно не должно.
  if (path.dirname(file) !== directory) return null
  try {
    return await readFile(file)
  } catch (error) {
    logger.error('Bootcamp entry task archive is unavailable', error, { 'entry_task.id': task.id })
    return null
  }
}

/** Повтор заявки: письмо не дошло или ушло в спам. Сразу после первого письма повтор его не дублирует. */
export function entryTaskResendDue(lead: Pick<BootcampLead, 'createdAt' | 'entryTaskSentAt'>, now = Date.now()): boolean {
  const last = Date.parse(lead.entryTaskSentAt ?? lead.createdAt)
  return Number.isFinite(last) && now - last >= ENTRY_TASK_RESEND_AFTER_MS
}

/**
 * Письмо кандидату с личной ссылкой. Ссылка не меняется при повторной отправке,
 * срок считается от первого ушедшего письма. Сбой пишется в журнал и не мешает заявке.
 */
export async function sendEntryTask(payload: Payload, lead: BootcampLead): Promise<void> {
  if (sending.has(lead.id)) return
  sending.add(lead.id)
  try {
    if (!candidateMail.take('all')) {
      logger.warn('Bootcamp entry task was not emailed: hourly mail limit reached', { 'lead.id': lead.id })
      return
    }
    // Новая заявка создаётся с токеном. Старой, без него, токен пишем до письма: ссылка должна открыться сразу.
    const token = lead.entryTaskToken ?? await ensureLeadEntryTaskToken(payload, lead.id, newEntryTaskToken())
    const dueAt = lead.entryTaskSentAt && lead.entryTaskDueAt ? lead.entryTaskDueAt : entryTaskDueAt(new Date()).toISOString()
    const program = BOOTCAMP_PROGRAMS.find((item) => item.value === lead.program)?.short ?? lead.program
    const replyTo = await contactReplyTo(payload)
    const content = bootcampEntryTaskEmail({
      name: lead.name ?? null,
      program,
      url: `${emailBaseUrl()}${entryTaskPath(token)}`,
      dueDate: formatEntryTaskDate(dueAt),
      reviewDays: ENTRY_TASK_REVIEW_DAYS,
      minutes: ENTRY_TASK_MINUTES,
      replyable: Boolean(replyTo),
    })
    await payload.sendEmail({ to: lead.email, ...content, ...(replyTo ? { replyTo } : {}) })
    await markLeadEntryTaskSent(payload, lead.id, dueAt)
  } catch (error) {
    logger.error('Bootcamp entry task email failed', error, { 'lead.id': lead.id })
  } finally {
    sending.delete(lead.id)
  }
}
