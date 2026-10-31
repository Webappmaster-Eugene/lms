// Хук первого входа импортирует модуль и вне серверного окружения React (CLI миграций), поэтому без 'server-only'.
import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type PayloadRequest } from 'payload'

import type { LeadEventType } from '@/lib/bootcamp-admission'
import { logger } from '@/lib/telemetry'
import { adminLink, notifyAdmins, notifyAdminsAfterCommit, type AdminEvent } from '@/server/admin-telegram'
import type { User } from '@/payload-types'

export type LeadEventInput = {
  lead: number | null
  type: LeadEventType
  message: string
  actor?: User | null
  data?: Record<string, unknown>
  /** Сообщение в Telegram: уходит после фиксации транзакции, в которой записано событие. */
  telegram?: AdminEvent | null
}

export const leadAdminLink = (id: number | null | undefined) => adminLink(id ? `/admin/collections/bootcamp-leads/${id}` : '/admin/collections/bootcamp-leads')

export function actorName(user: User | null | undefined): string {
  if (!user) return 'система'
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
}

/** Событие пишется в транзакции действия: откат действия убирает и событие, и сообщение в Telegram. */
export async function recordLeadEvent(payload: Payload, req: PayloadRequest | undefined, input: LeadEventInput): Promise<void> {
  await payload.create({
    collection: 'bootcamp-lead-events',
    data: {
      ...(input.lead ? { lead: input.lead } : {}),
      type: input.type,
      message: input.message.length > 500 ? `${input.message.slice(0, 499)}…` : input.message,
      ...(input.actor ? { actor: input.actor.id } : {}),
      ...(input.data ? { data: input.data } : {}),
    },
    overrideAccess: true,
    depth: 0,
    ...(req ? { req } : {}),
  })
  if (!input.telegram) return
  if (req) await notifyAdminsAfterCommit(req, input.telegram)
  else void notifyAdmins(input.telegram)
}

/** Для событий, которые сопровождают уже сделанное действие: сбой журнала не отменяет действие. */
export async function journal(payload: Payload, input: LeadEventInput): Promise<void> {
  try {
    await recordLeadEvent(payload, undefined, input)
  } catch (error) {
    logger.error('Bootcamp lead event was not recorded', error, { 'lead.id': input.lead ?? 0, 'lead.event': input.type })
  }
}

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
type TransactionAdapter = { drizzle: Executor, sessions?: Record<string | number, { db: Executor } | undefined> }

/** SQL в транзакции запроса: условные переходы этапа должны откатываться вместе с событием. */
export async function txDb(req: PayloadRequest): Promise<Executor> {
  const id = await req.transactionID
  const adapter = req.payload.db as unknown as TransactionAdapter
  const db = id === undefined ? undefined : adapter.sessions?.[id]?.db
  if (!db) throw new Error('Bootcamp lead path requires a PostgreSQL transaction')
  return db
}

export const rowsOf = <T>(result: unknown) => (result as { rows?: T[] }).rows ?? []

export async function inTransaction<T>(payload: Payload, user: User | null, run: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq(user ? { user } : {}, payload)
  if (!(await initTransaction(req))) throw new Error('Bootcamp lead path requires a transaction')
  try {
    const result = await run(req)
    await commitTransaction(req)
    return result
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}
