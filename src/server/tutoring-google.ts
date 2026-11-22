import 'server-only'

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'

export const googleCalendarAdminPath = '/admin/google-calendar'
export const googleCalendarApiPath = '/api/manage/tutoring/google-calendar'
export const tutoringGoogleOrigin = () => new URL(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').origin
const calendarScopes = ['calendar.app.created', 'calendar.calendarlist.readonly'].map(scope => `https://www.googleapis.com/auth/${scope}`)
const tokenUrl = 'https://oauth2.googleapis.com/token'
const calendarApi = 'https://www.googleapis.com/calendar/v3'

export function tutoringGoogleConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  const key = Buffer.from(process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY ?? '', 'base64')
  if (!clientId || !clientSecret || key.length !== 32) return null
  const origin = tutoringGoogleOrigin()
  return { clientId, clientSecret, key, origin, redirectUri: `${origin}${googleCalendarApiPath}/callback` }
}

type Config = NonNullable<ReturnType<typeof tutoringGoogleConfig>>

export const sha256 = (data: string) => createHash('sha256').update(data).digest('hex')

export function sealGoogleValue(key: Buffer, purpose: string, value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(purpose))
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

export function openGoogleValue(key: Buffer, purpose: string, value: string) {
  const data = Buffer.from(value, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12))
  decipher.setAAD(Buffer.from(purpose))
  decipher.setAuthTag(data.subarray(12, 28))
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')
}

const oauthStateSchema = z.object({ state: z.string(), verifier: z.string(), owner: z.number(), session: z.string(), expiresAt: z.number() })
export const googleStateCookie = 'lms-tutoring-google-state'
export const googleStateLifetime = 600

export function startGoogleAuthorization(config: Config, owner: number, session: string) {
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const sealedState = sealGoogleValue(config.key, 'oauth-state', JSON.stringify({
    state, verifier, owner, session: sha256(session), expiresAt: Date.now() + googleStateLifetime * 1000,
  }))
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    access_type: 'offline', client_id: config.clientId, redirect_uri: config.redirectUri, response_type: 'code',
    scope: ['openid', 'email', ...calendarScopes].join(' '), prompt: 'select_account consent', state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
  }).toString()
  return { url, sealedState }
}

export function verifyGoogleState(config: Config, sealedState: string, state: string, owner: number, session: string) {
  try {
    const data = oauthStateSchema.parse(JSON.parse(openGoogleValue(config.key, 'oauth-state', sealedState)))
    if (data.state === state && data.owner === owner && data.session === sha256(session) && data.expiresAt > Date.now()) return data.verifier
  } catch {
    // An expired, unreadable or forged cookie requires a fresh authorization.
  }
  return null
}

const googleErrorSchema = z.object({ error: z.union([z.string(), z.object({ errors: z.array(z.object({ reason: z.string() })).optional() })]) })

export class GoogleCalendarError extends Error {
  constructor(readonly status: number, readonly reason = '') {
    super(`Google Calendar API: ${status}`)
  }
}

async function googleFetch(url: string | URL, init: RequestInit = {}, accessToken?: string) {
  const headers = new Headers(init.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(url, {
    ...init, headers, cache: 'no-store', redirect: 'error',
    signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000),
  })
  if (!response.ok) {
    const failure = googleErrorSchema.safeParse(await response.json().catch(() => null))
    const error = failure.data?.error
    throw new GoogleCalendarError(response.status, typeof error === 'string' ? error : error?.errors?.[0]?.reason)
  }
  return response
}

const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), scope: z.string().optional() })
const userInfoSchema = z.object({ sub: z.string().min(1), email: z.email(), email_verified: z.literal(true) })

async function requestTokens(config: Config, fields: Record<string, string>, signal?: AbortSignal) {
  const response = await googleFetch(tokenUrl, { method: 'POST', signal, body: new URLSearchParams({
    client_id: config.clientId, client_secret: config.clientSecret, ...fields,
  }) })
  return tokenSchema.parse(await response.json())
}

export async function exchangeGoogleCode(config: Config, code: string, verifier: string) {
  const tokens = await requestTokens(config, { grant_type: 'authorization_code', redirect_uri: config.redirectUri, code, code_verifier: verifier })
  const scopes = tokens.scope?.split(/\s+/) ?? []
  if (!tokens.refresh_token || !calendarScopes.every(scope => scopes.includes(scope))) throw new GoogleCalendarError(403, 'consent')
  const response = await googleFetch('https://openidconnect.googleapis.com/v1/userinfo', {}, tokens.access_token)
  const userInfo = userInfoSchema.parse(await response.json())
  return { subject: userInfo.sub, email: userInfo.email, refreshToken: tokens.refresh_token }
}

export async function refreshGoogleAccess(config: Config, refreshToken: string, signal: AbortSignal) {
  const tokens = await requestTokens(config, { grant_type: 'refresh_token', refresh_token: refreshToken }, signal)
  return tokens.access_token
}

const calendarSchema = z.object({ id: z.string().min(1), description: z.string().optional() })
const eventSchema = z.object({
  id: z.string().min(1), status: z.string().optional(), summary: z.string().optional(), description: z.string().optional(), visibility: z.string().optional(),
  start: z.object({ dateTime: z.string().optional(), timeZone: z.string().optional() }).optional(),
  end: z.object({ dateTime: z.string().optional(), timeZone: z.string().optional() }).optional(),
  extendedProperties: z.object({ private: z.record(z.string(), z.string()).optional() }).optional(),
})

export type GoogleEvent = z.infer<typeof eventSchema>
type EventWrite = Omit<GoogleEvent, 'id' | 'status'>

export function tutoringGoogleClient(accessToken: string, signal: AbortSignal) {
  const read = async <T>(path: string | URL, schema: z.ZodType<T>, init?: RequestInit) =>
    schema.parse(await (await googleFetch(path, { ...init, signal }, accessToken)).json())
  const json = (method: string, data: unknown): RequestInit => ({
    method, body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' },
  })
  async function list<T>(url: URL, item: z.ZodType<T>) {
    const schema = z.object({ items: z.array(item).default([]), nextPageToken: z.string().optional() })
    const items: T[] = []
    let pageToken: string | undefined
    do {
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const page = await read(url, schema)
      items.push(...page.items)
      pageToken = page.nextPageToken
    } while (pageToken)
    return items
  }
  const calendarPath = (id: string) => `${calendarApi}/calendars/${encodeURIComponent(id)}`
  const eventsPath = (id: string) => `${calendarPath(id)}/events`
  const eventPath = (calendarId: string, eventId: string) => `${eventsPath(calendarId)}/${encodeURIComponent(eventId)}`
  return {
    getCalendar: (id: string) => read(calendarPath(id), calendarSchema),
    async findCalendar(marker: string) {
      const url = new URL(`${calendarApi}/users/me/calendarList`)
      url.search = new URLSearchParams({ showHidden: 'true', minAccessRole: 'owner', fields: 'items(id,description),nextPageToken' }).toString()
      return (await list(url, calendarSchema)).find(calendar => calendar.description === marker)
    },
    createCalendar: (description: string) => read(`${calendarApi}/calendars`, calendarSchema, json('POST', {
      summary: 'MentorCareer', description, timeZone: 'Europe/Moscow',
    })),
    listEvents(calendarId: string, marker: string) {
      const url = new URL(eventsPath(calendarId))
      url.search = new URLSearchParams({ privateExtendedProperty: `mentorcareer=${marker}`, maxResults: '2500' }).toString()
      return list(url, eventSchema)
    },
    getEvent: (calendarId: string, eventId: string) => read(eventPath(calendarId, eventId), eventSchema),
    createEvent: (calendarId: string, eventId: string, event: EventWrite) => read(
      `${eventsPath(calendarId)}?sendUpdates=none`, eventSchema, json('POST', { ...event, id: eventId }),
    ),
    updateEvent: (calendarId: string, eventId: string, event: EventWrite) => read(
      `${eventPath(calendarId, eventId)}?sendUpdates=none`, eventSchema, json('PATCH', event),
    ),
    async deleteEvent(calendarId: string, eventId: string) {
      await googleFetch(`${eventPath(calendarId, eventId)}?sendUpdates=none`, { method: 'DELETE', signal }, accessToken)
    },
  }
}
