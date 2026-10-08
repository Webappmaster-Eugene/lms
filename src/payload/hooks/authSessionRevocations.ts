import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { APIError, Forbidden, type CollectionAfterLogoutHook, type CollectionAfterReadHook, type Payload, type PayloadRequest } from 'payload'

import { collectAllPages } from '@/lib/paginate'

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
type SessionsAdapter = { sessions?: Record<string | number, { db: Executor } | undefined> }
const DAY_MS = 24 * 60 * 60 * 1000

export function authSessionHash(sid: string): string { return createHash('sha256').update(sid).digest('hex') }

async function revokedHashes(payload: Payload, req: PayloadRequest, userId: number, sessions: string[]): Promise<Set<string>> {
  const hashes = sessions.map(authSessionHash)
  const result = new Set<string>()
  // Bound SQL parameters independently from the user's number of active devices.
  for (let start = 0; start < hashes.length; start += 500) {
    const records = await collectAllPages(({ page, limit }) => payload.find({ collection: 'auth-session-revocations', req, depth: 0, overrideAccess: true, select: { sessionHash: true }, page, limit, sort: 'id', where: { and: [
      { user: { equals: userId } }, { sessionHash: { in: hashes.slice(start, start + 500) } }, { expiresAt: { greater_than: new Date().toISOString() } },
    ] } }), { label: 'Отозванные сессии пользователя' })
    for (const record of records) result.add(record.sessionHash)
  }
  return result
}

/** Payload invokes this hook inside its logout transaction, before the SDK reads/writes sessions. */
export const revokeAuthenticatedSessions: CollectionAfterLogoutHook = async ({ req, collection }) => {
  const userId = req.user?.id
  const sid = req.user && '_sid' in req.user && typeof req.user._sid === 'string' ? req.user._sid : null
  if (!userId || !sid) throw new Forbidden(req.t)
  const transactionID = await req.transactionID
  const adapter = req.payload.db as unknown as SessionsAdapter
  const db = transactionID === undefined ? undefined : adapter.sessions?.[transactionID]?.db
  if (!db) throw new APIError('Выход требует транзакции', 500)
  // Row only: do not invert the manager's 7204 -> user-row order.
  await db.execute(sql`select id from users where id = ${userId} for update`)
  const current = await req.payload.db.findOne({ collection: 'users', where: { id: { equals: userId } }, req })
  if (!current) throw new Forbidden(req.t)
  const allSessions = req.searchParams?.get('allSessions') === 'true' || req.context?.revokeAllAuthSessions === true
  const rawSessions = 'sessions' in current && Array.isArray(current.sessions) ? current.sessions : []
  const ids = allSessions ? [sid, ...rawSessions.flatMap((session: unknown) => {
    if (!session || typeof session !== 'object' || !('id' in session) || typeof session.id !== 'string') return []
    return [session.id]
  })] : [sid]
  const lifetime = collection?.auth ? collection.auth.tokenExpiration : 30 * 24 * 60 * 60
  const expiresAt = new Date(Date.now() + Math.max(31 * DAY_MS, lifetime * 1000 + DAY_MS)).toISOString()
  const previousCapability = req.context.syncAuthSessionRevocations
  req.context.syncAuthSessionRevocations = true
  try {
    await req.payload.delete({ collection: 'auth-session-revocations', req, overrideAccess: true, where: { and: [{ user: { equals: userId } }, { expiresAt: { less_than_equal: new Date().toISOString() } }] } })
    for (const id of new Set(ids)) {
      const sessionHash = authSessionHash(id)
      const existing = await req.payload.find({ collection: 'auth-session-revocations', req, overrideAccess: true, depth: 0, limit: 1, where: { and: [{ user: { equals: userId } }, { sessionHash: { equals: sessionHash } }] } })
      if (!existing.docs[0]) await req.payload.create({ collection: 'auth-session-revocations', req, overrideAccess: true, data: { user: userId, sessionHash, expiresAt } })
    }
  } finally {
    if (previousCapability === undefined) delete req.context.syncAuthSessionRevocations
    else req.context.syncAuthSessionRevocations = previousCapability
  }
}

/** JWT Authentication checks SID only after Users.findByID has applied this hook. */
export const filterRevokedAuthSessions: CollectionAfterReadHook = async ({ doc, req }) => {
  if (doc.isActive === false) {
    if (Object.hasOwn(doc, 'sessions')) doc.sessions = []
    return doc
  }
  if (!Array.isArray(doc.sessions) || doc.sessions.length === 0) return doc
  const ids: string[] = doc.sessions.flatMap((session: { id?: unknown }) => typeof session.id === 'string' ? [session.id] : [])
  if (!ids.length) return doc
  const revoked = await revokedHashes(req.payload, req, Number(doc.id), ids)
  if (!revoked.size) return doc
  doc.sessions = doc.sessions.filter((session: { id?: unknown }) => typeof session.id === 'string' && !revoked.has(authSessionHash(session.id)))
  // A refresh already authenticated before a concurrent logout must not issue a new token for the revoked SID.
  const sid = req.user && '_sid' in req.user && typeof req.user._sid === 'string' ? req.user._sid : null
  if (sid && req.user?.id === doc.id && req.url?.includes('/refresh-token') && revoked.has(authSessionHash(sid))) throw new Forbidden(req.t)
  return doc
}
