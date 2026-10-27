import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

interface Executor {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>
}

/**
 * Отметки заявки пишутся точечно, по своим колонкам. Payload сохраняет документ целиком:
 * повтор заявки и фоновые письма, идущие одновременно, затирали бы поля друг друга
 * (терялся счётчик отправок, срок задания, отметка о письме).
 */
function db(payload: Payload): Executor {
  return (payload.db as unknown as { drizzle: Executor }).drizzle
}

export async function markLeadResubmitted(payload: Payload, id: number, at: string): Promise<void> {
  await db(payload).execute(sql`update bootcamp_leads set submission_count = submission_count + 1, last_submitted_at = ${at}, updated_at = now() where id = ${id}`)
}

export async function markLeadTeamNotified(payload: Payload, id: number): Promise<void> {
  await db(payload).execute(sql`update bootcamp_leads set notified_at = now(), updated_at = now() where id = ${id}`)
}

/** Токен ставится, только если его ещё нет; возвращается тот, что лежит в базе. */
export async function ensureLeadEntryTaskToken(payload: Payload, id: number, candidate: string): Promise<string> {
  const result = await db(payload).execute(sql`update bootcamp_leads set entry_task_token = coalesce(entry_task_token, ${candidate}), updated_at = now() where id = ${id} returning entry_task_token`)
  const token = (result as { rows?: { entry_task_token?: string | null }[] }).rows?.[0]?.entry_task_token
  if (!token) throw new Error(`Bootcamp lead ${id} not found`)
  return token
}

export async function markLeadEntryTaskSent(payload: Payload, id: number, dueAt: string): Promise<void> {
  await db(payload).execute(sql`update bootcamp_leads set entry_task_sent_at = now(), entry_task_due_at = ${dueAt}, updated_at = now() where id = ${id}`)
}
