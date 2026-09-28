import type { PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'

/** Пространство advisory-блокировок: начисления баллов пользователю */
const POINTS_LOCK_NAMESPACE = 7201

interface Executor {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>
}

interface AdapterWithSessions {
  drizzle: Executor
  sessions?: Record<string | number, { db: Executor } | undefined>
}

/**
 * Сериализует запись прогресса одного пользователя до конца текущей транзакции.
 * Параллельные отметки уроков вставляли прогресс, транзакции и серию и пересчитывали
 * users.totalPoints в разном порядке - Postgres отвечал deadlock, и одна отметка терялась.
 * Блокировка берётся первым действием в транзакции, поэтому порядок один на всех.
 */
export async function lockUserPoints(req: PayloadRequest, userId: number): Promise<void> {
  const adapter = req.payload.db as unknown as AdapterWithSessions
  const transactionID = await req.transactionID
  const db = (transactionID !== undefined && adapter.sessions?.[transactionID]?.db) || adapter.drizzle
  await db.execute(sql`select pg_advisory_xact_lock(${POINTS_LOCK_NAMESPACE}, ${userId})`)
}
