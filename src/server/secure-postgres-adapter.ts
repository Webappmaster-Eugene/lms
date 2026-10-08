import { postgresAdapter, sql } from '@payloadcms/db-postgres'
import { APIError } from 'payload'

type StoredSession = { id: string; expiresAt: string | Date; [key: string]: unknown }
function activeSessions(value: unknown): StoredSession[] {
  if (!Array.isArray(value)) return []
  return value.filter((session): session is StoredSession => session !== null && typeof session === 'object' && typeof session.id === 'string' && Date.parse(String(session.expiresAt)) > Date.now())
}

/** Keep the upstream adapter, with a narrow projection for the SDK's whole-user session writes. */
export function securePostgresAdapter(args: Parameters<typeof postgresAdapter>[0]): ReturnType<typeof postgresAdapter> {
  const base = postgresAdapter(args)
  return {
    ...base,
    init: (context) => {
      const adapter = base.init(context)
      const updateOne = adapter.updateOne.bind(adapter)
      adapter.updateOne = async (options) => {
        const data = options.data
        const sdkFailedLoginSnapshot = !options.req && data.collection === 'users' && data._strategy === 'local-jwt'
        if (options.collection === 'users' && Object.hasOwn(data, 'sessions') && (data.updatedAt === null || sdkFailedLoginSnapshot)) {
          let sessions = data.sessions
          if (options.req && data.collection === 'users' && data._strategy === 'local-jwt') {
            const transactionID = await options.req.transactionID
            const db = transactionID === undefined ? undefined : adapter.sessions[transactionID]?.db
            if (!db) throw new APIError('Запись сессии требует транзакции', 500)
            await db.execute(sql`select id from users where id = ${options.id} for update`)
            const current = await adapter.findOne({ collection: 'users', where: { id: { equals: options.id } }, req: options.req, select: { sessions: true } })
            const merged = new Map<string, StoredSession>()
            for (const session of [...activeSessions(current && 'sessions' in current ? current.sessions : []), ...activeSessions(sessions)]) {
              const previous = merged.get(session.id)
              if (!previous || Date.parse(String(previous.expiresAt)) < Date.parse(String(session.expiresAt))) merged.set(session.id, session)
            }
            sessions = [...merged.values()]
          }
          // SDK lockout already updated counters atomically; its full snapshot contains obsolete counters/credentials.
          return updateOne({ ...options, data: { sessions, updatedAt: data.updatedAt } })
        }
        return updateOne(options)
      }
      return adapter
    },
  }
}
