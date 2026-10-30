import 'server-only'

import type { Payload } from 'payload'

import { ENTRY_TASKS, entryTaskSpec, findEntryTask, type EntryTask } from '@/data/bootcamp-entry/tasks'
import { ENTRY_TASK_MAX_SUBMISSIONS, ENTRY_TASK_REVIEW_DAYS } from '@/lib/bootcamp-entry-task'
import { logger } from '@/lib/telemetry'
import { TRAINER_LIMITS } from '@/lib/trainer/constants'
import type { TrainerRunResult } from '@/lib/trainer/types'
import { pluralize } from '@/lib/utils'
import { bootcampEntrySubmissionEmail } from '@/payload/emails/templates'
import { markLeadEntrySubmitted } from '@/server/bootcamp-lead-marks'
import { adminEmails } from '@/server/bootcamp-leads'
import { createRateLimiter } from '@/server/trainer/rate-limit'
import { runSolution } from '@/server/trainer/sandbox'
import type { BootcampLead } from '@/payload-types'

export class EntrySubmissionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'EntrySubmissionError'
  }
}

export type EntryTaskOutcome = {
  slug: string
  title: string
  attempted: boolean
  passed: number
  total: number
  status: TrainerRunResult['status'] | 'not_started'
}

export type EntrySubmissionSummary = {
  passed: number
  total: number
  tasks: EntryTaskOutcome[]
}

export type EntrySubmissionResult = EntrySubmissionSummary & { submissionsLeft: number }

export const ENTRY_SUBMISSIONS_EXHAUSTED = `Решение уже отправлено ${pluralize(ENTRY_TASK_MAX_SUBMISSIONS, 'раз', 'раза', 'раз')}, больше отправок нет. Мы посмотрим последнюю отправку и ответим на почту из заявки.`

// Письма команде по отправкам: страница открыта по ссылке, предел не даёт превратить её в рассылку.
const teamMail = createRateLimiter('bootcamp-entry-submission-mail', 30, 60 * 60_000)

function readCode(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new EntrySubmissionError('Решение должно быть текстом', 400)
  if (value.length > TRAINER_LIMITS.maxCodeLength) throw new EntrySubmissionError(`Решение одной задачи не длиннее ${TRAINER_LIMITS.maxCodeLength} символов`, 400)
  return value
}

/** Тело «Проверить»: одна задача и её код. */
export function parseEntryCheck(body: unknown): { task: EntryTask, code: string } {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const task = typeof input.task === 'string' ? findEntryTask(input.task) : undefined
  if (!task) throw new EntrySubmissionError('Неизвестная задача', 400)
  const code = readCode(input.code)
  if (!code.trim()) throw new EntrySubmissionError('Напишите решение, потом проверяйте', 400)
  return { task, code }
}

/** Тело «Отправить решение»: код по задачам, нерешённые можно не присылать. */
export function parseEntrySolutions(body: unknown): Record<string, string> {
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>).solutions : undefined
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new EntrySubmissionError('Нет решений', 400)
  const solutions: Record<string, string> = {}
  for (const task of ENTRY_TASKS) {
    const code = readCode((input as Record<string, unknown>)[task.slug])
    if (code.trim()) solutions[task.slug] = code
  }
  if (Object.keys(solutions).length === 0) throw new EntrySubmissionError('Решите хотя бы одну задачу, потом отправляйте', 400)
  return solutions
}

export function checkEntryTask(task: EntryTask, code: string): Promise<TrainerRunResult> {
  return runSolution(entryTaskSpec(task), 'js', code)
}

function describe(outcome: EntryTaskOutcome): string {
  return `${outcome.title}: ${outcome.attempted ? `${outcome.passed} из ${outcome.total}` : 'не решалась'}`
}

/**
 * Прогоняет все задачи на сервере и записывает последнюю отправку в заявку.
 * Результат браузера сюда не приходит: как и в тренажёре, верят только серверному прогону.
 */
export async function submitEntrySolutions(payload: Payload, lead: BootcampLead, solutions: Record<string, string>): Promise<EntrySubmissionResult> {
  // Ранний отказ бережёт песочницы; окончательно предел держит запись в базе.
  if ((lead.entrySubmissionCount ?? 0) >= ENTRY_TASK_MAX_SUBMISSIONS) throw new EntrySubmissionError(ENTRY_SUBMISSIONS_EXHAUSTED, 409)
  const tasks: EntryTaskOutcome[] = []
  // По очереди: пул песочниц общий с тренажёром, три прогона разом заняли бы его целиком.
  for (const task of ENTRY_TASKS) {
    const code = solutions[task.slug]
    if (!code) {
      tasks.push({ slug: task.slug, title: task.title, attempted: false, passed: 0, total: task.cases.length, status: 'not_started' })
      continue
    }
    const result = await checkEntryTask(task, code)
    tasks.push({ slug: task.slug, title: task.title, attempted: true, passed: result.passedCount, total: task.cases.length, status: result.status })
  }
  const summary = {
    passed: tasks.reduce((sum, task) => sum + task.passed, 0),
    total: tasks.reduce((sum, task) => sum + task.total, 0),
    tasks,
  }
  const solution = tasks
    .map((outcome, index) => `// ${index + 1}. ${describe(outcome)}\n${solutions[outcome.slug]?.trimEnd() ?? '// решения нет'}`)
    .join('\n\n')
  const count = await markLeadEntrySubmitted(payload, lead.id, {
    passed: summary.passed,
    total: summary.total,
    result: tasks.map(describe).join('\n'),
    solution,
    solutions,
  }, ENTRY_TASK_MAX_SUBMISSIONS)
  if (count === null) throw new EntrySubmissionError(ENTRY_SUBMISSIONS_EXHAUSTED, 409)
  void notifyTeam(payload, lead, summary)
  return { ...summary, submissionsLeft: Math.max(0, ENTRY_TASK_MAX_SUBMISSIONS - count) }
}

async function notifyTeam(payload: Payload, lead: BootcampLead, summary: EntrySubmissionSummary): Promise<void> {
  if (!teamMail.take('all')) {
    logger.warn('Entry task solution saved without team email: hourly mail limit reached', { 'lead.id': lead.id })
    return
  }
  try {
    const recipients = await adminEmails(payload)
    if (recipients.length === 0) {
      logger.warn('Entry task solution saved, but no admin address to notify', { 'lead.id': lead.id })
      return
    }
    const content = bootcampEntrySubmissionEmail({
      id: lead.id,
      address: lead.email,
      name: lead.name ?? null,
      passed: summary.passed,
      total: summary.total,
      tasks: summary.tasks,
      reviewDays: ENTRY_TASK_REVIEW_DAYS,
    })
    for (const to of recipients) await payload.sendEmail({ to, ...content })
  } catch (error) {
    logger.error('Entry task solution notification failed', error, { 'lead.id': lead.id })
  }
}
