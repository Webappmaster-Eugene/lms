import { sql } from '@payloadcms/db-postgres'
import { APIError, Forbidden, type CollectionBeforeOperationHook } from 'payload'

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
type SessionsAdapter = { sessions?: Record<string | number, { db: Executor } | undefined> }

/** Reset/refresh already own a transaction before this hook. Login starts later and must not lock here. */
export const lockSdkAuthOperation: CollectionBeforeOperationHook = async ({ operation, req, args }) => {
  if (operation !== 'resetPassword' && operation !== 'refresh') return
  const transactionID = await req.transactionID
  const adapter = req.payload.db as unknown as SessionsAdapter
  const db = transactionID === undefined ? undefined : adapter.sessions?.[transactionID]?.db
  if (!db) throw new APIError('Операция авторизации требует транзакции', 500)
  if (operation === 'refresh') {
    const sid = req.user && '_sid' in req.user && typeof req.user._sid === 'string' ? req.user._sid : null
    if (!req.user || !sid) throw new Forbidden(req.t)
    await db.execute(sql`select id from users where id = ${req.user.id} for update`)
    const current = await req.payload.findByID({ collection: 'users', id: req.user.id, depth: 0, overrideAccess: true, req, select: { sessions: true, isActive: true } })
    if (current.isActive === false || !current.sessions?.some((session) => session.id === sid && Date.parse(session.expiresAt) > Date.now())) throw new Forbidden(req.t)
    return
  }
  const data = 'data' in args ? args.data as Record<string, unknown> : undefined
  const token = typeof data?.token === 'string' ? data.token : null
  if (token) await db.execute(sql`select id from users where reset_password_token = ${token} and reset_password_expiration > now() for update`)
}
