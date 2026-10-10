import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { APIError, Forbidden, type CollectionBeforeChangeHook, type CollectionBeforeOperationHook, type PayloadRequest } from 'payload'

import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { authSessionHash } from '@/payload/hooks/authSessionRevocations'
import { passwordPolicyError } from '@/lib/profile'

type Challenge = { userId: number; password: string }
const challenges = new WeakMap<PayloadRequest, Challenge>()
const sensitivePatches = new WeakMap<PayloadRequest, { email?: unknown; password?: unknown; trusted: boolean }>()

/** Not expressible through JSON/GraphQL context supplied by an API caller. */
export function authorizeProfileCredentialChange(req: PayloadRequest, userId: number, password: string): void {
  challenges.set(req, { userId, password })
}

export const captureProfileCredentials: CollectionBeforeOperationHook = ({ operation, args, overrideAccess, req }) => {
  if (operation !== 'update' || !('data' in args) || !args.data || typeof args.data !== 'object') return
  const data = args.data as Record<string, unknown>
  sensitivePatches.set(req, { email: data.email, password: data.password, trusted: Boolean(overrideAccess) })
}

/** Resolve from the runtime app root: bundlers embed a build-host path in import.meta.url. */
async function verifyPassword(doc: Record<string, unknown> & { id: number | string }, password: string): Promise<boolean> {
  // Native import prevents Webpack from replacing require.resolve with a numeric module ID.
  const { createRequire } = await import(/* webpackIgnore: true */ 'node:module')
  const sdkURL = new URL('./auth/strategies/local/authenticate.js', pathToFileURL(createRequire(join(process.cwd(), 'package.json')).resolve('payload')))
  const sdk = await import(/* webpackIgnore: true */ sdkURL.href) as { authenticateLocalStrategy: (args: { doc: Record<string, unknown> & { id: number | string }; password: string }) => Promise<unknown> }
  return Boolean(await sdk.authenticateLocalStrategy({ doc, password }))
}

/** Runs after the learning-policy hook acquires the user row and refreshes originalDoc. */
export const protectProfileCredentials: CollectionBeforeChangeHook = async ({ operation, data, originalDoc, req }) => {
  if (operation !== 'update' || !originalDoc) return data
  const patch = sensitivePatches.get(req)
  // Keep the raw patch for every document in a REST bulk operation. The request is weakly held.
  const challenge = challenges.get(req)
  challenges.delete(req)
  if (!patch) return data
  const changingEmail = typeof patch.email === 'string' && patch.email.trim().toLowerCase() !== originalDoc.email
  const changingPassword = patch.password !== undefined
  if (!changingEmail && !changingPassword) return data
  if (patch.trusted) return data
  const actorRole = req.user ? (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role : null
  // Administrators can still manage other accounts through the CMS.
  if (actorRole === 'admin' && req.user?.id !== originalDoc.id) return data
  if (!req.user || req.user.id !== originalDoc.id || !challenge || challenge.userId !== originalDoc.id) throw new APIError('Меняйте email и пароль в настройках профиля с подтверждением текущего пароля', 403)
  const sid = '_sid' in req.user && typeof req.user._sid === 'string' ? req.user._sid : null
  const sessions = Array.isArray(originalDoc.sessions) ? originalDoc.sessions as { id: string; expiresAt: string }[] : []
  const revokedCurrent = sid ? await req.payload.find({ collection: 'auth-session-revocations', req, overrideAccess: true, limit: 1, depth: 0, where: { and: [{ user: { equals: originalDoc.id } }, { sessionHash: { equals: authSessionHash(sid) } }, { expiresAt: { greater_than: new Date().toISOString() } }] } }) : null
  if (originalDoc.isActive === false || !sid || !sessions.some((session) => session.id === sid && Date.parse(session.expiresAt) > Date.now()) || revokedCurrent?.docs.length) throw new Forbidden(req.t)
  if (!(await verifyPassword(originalDoc, challenge.password))) throw new APIError('Текущий пароль указан неверно', 403)
  if (changingPassword) {
    const error = passwordPolicyError(patch.password)
    if (error) throw new APIError(error, 400)
  }
  const previousCapability = req.context.syncAuthSessionRevocations
  req.context.syncAuthSessionRevocations = true
  try {
    for (const session of sessions) {
      if (session.id === sid) continue
      const sessionHash = authSessionHash(session.id)
      const existing = await req.payload.find({ collection: 'auth-session-revocations', req, overrideAccess: true, limit: 1, depth: 0, where: { and: [{ user: { equals: originalDoc.id } }, { sessionHash: { equals: sessionHash } }] } })
      if (!existing.docs.length) await req.payload.create({ collection: 'auth-session-revocations', req, overrideAccess: true, data: { user: originalDoc.id, sessionHash, expiresAt: new Date(Date.now() + 31 * 86400000).toISOString() } })
    }
  } finally {
    if (previousCapability === undefined) delete req.context.syncAuthSessionRevocations
    else req.context.syncAuthSessionRevocations = previousCapability
  }
  return { ...data, sessions: sessions.filter((session) => session.id === sid), resetPasswordToken: null, resetPasswordExpiration: null }
}
