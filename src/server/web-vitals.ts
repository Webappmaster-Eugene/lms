import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload, type PayloadRequest, type Where } from 'payload'
import type { User } from '@/payload-types'
import { childReq } from '@/lib/payload-req'
import { relationId } from '@/lib/relation-id'
import { authSessionHash } from '@/payload/hooks/authSessionRevocations'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

const DAY = 86_400_000
export const WEB_VITAL_NAMES = ['LCP', 'INP', 'CLS'] as const
export type WebVitalName = typeof WEB_VITAL_NAMES[number]
const navigationTypes = ['navigate', 'reload', 'back-forward', 'back-forward-cache', 'prerender', 'restore', 'soft-navigation'] as const
type NavigationType = typeof navigationTypes[number]
type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
type Adapter = { drizzle: Executor; sessions?: Record<string | number, { db: Executor } | undefined> }
export type UserWebVitals = { windowDays: 30; metrics: { name: WebVitalName; sampleCount: number; p75: number | null }[] }
export type WebVitalsInput = { expectedUserId: number; routeTemplate: string; metric: { name: WebVitalName; value: number; id: string; navigationType?: NavigationType } }

export class WebVitalsError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WebVitalsError('Некорректные показатели страницы')
  return value as Record<string, unknown>
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new WebVitalsError('Лишние поля показателей страницы')
}

const staticRoutes = new Set(['/', '/courses', '/roadmaps', '/trainer', '/trainer/interview', '/profile', '/profile/edit', '/achievements', '/certificates', '/notifications', '/settings/notifications', '/settings/app', '/notes', '/saved', '/leaderboard', '/help', '/contacts', '/questions', '/manage'])

export function webVitalRoute(path: unknown): string {
  if (path === undefined) return 'other'
  if (typeof path !== 'string' || path.length > 240 || !/^\/[A-Za-z0-9_/-]*$/.test(path) || path.includes('//')) throw new WebVitalsError('Передайте путь без параметров и полного адреса')
  if (staticRoutes.has(path)) return path
  if (/^\/(lessons|courses|roadmaps)\/[A-Za-z0-9_-]+$/.test(path)) return `/${path.split('/')[1]}/[slug]`
  if (/^\/trainer\/[A-Za-z0-9_-]+$/.test(path)) return '/trainer/[topic]'
  if (/^\/trainer\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(path)) return '/trainer/[topic]/[task]'
  if (/^\/certificates\/\d+$/.test(path)) return '/certificates/[id]'
  return 'other'
}

export function webVitalsInput(raw: unknown): WebVitalsInput {
  const input = object(raw)
  onlyKeys(input, ['expectedUserId', 'path', 'metric'])
  if (typeof input.expectedUserId !== 'number' || !Number.isSafeInteger(input.expectedUserId) || input.expectedUserId < 1) throw new WebVitalsError('Укажите текущий аккаунт')
  const metric = object(input.metric)
  onlyKeys(metric, ['name', 'value', 'id', 'navigationType'])
  if (metric.name !== 'LCP' && metric.name !== 'INP' && metric.name !== 'CLS') throw new WebVitalsError('Показатель страницы не поддерживается')
  if (typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0 || metric.value > (metric.name === 'CLS' ? 100 : 600000)) throw new WebVitalsError('Некорректное значение показателя')
  if (typeof metric.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(metric.id)) throw new WebVitalsError('Некорректный идентификатор измерения')
  const navigation = metric.navigationType
  if (navigation !== undefined && !navigationTypes.some((type) => type === navigation)) throw new WebVitalsError('Некорректный тип перехода')
  return {
    expectedUserId: input.expectedUserId, routeTemplate: webVitalRoute(input.path),
    metric: { name: metric.name, value: metric.value, id: metric.id, ...(navigation === undefined ? {} : { navigationType: navigation as NavigationType }) },
  }
}

export function webVitalReportKey(userId: number, sid: string, name: WebVitalName, metricId: string): string {
  return createHash('sha256').update(JSON.stringify(['web-vitals', userId, sid, name, metricId])).digest('hex')
}

async function executor(req: PayloadRequest, transactionRequired = false): Promise<Executor> {
  const adapter = req.payload.db as unknown as Adapter
  const transactionID = await req.transactionID
  const db = transactionID === undefined ? undefined : adapter.sessions?.[transactionID]?.db
  if (transactionRequired && !db) throw new Error('Web vitals require a database transaction')
  return db ?? adapter.drizzle
}

const writableReq = (req: PayloadRequest) => childReq(req, { syncWebVitals: true })

export async function recordWebVitals(payload: Payload, user: User, raw: unknown) {
  const input = webVitalsInput(raw)
  if (input.expectedUserId !== user.id) throw new WebVitalsError('Аккаунт изменился. Обновите страницу', 403)
  const sid = '_sid' in user && typeof user._sid === 'string' ? user._sid : null
  if (!sid) throw new WebVitalsError('Войдите в аккаунт', 401)
  const req = await createLocalReq({ user }, payload)
  await initTransaction(req)
  try {
    const db = await executor(req, true)
    // Same first lock as auth, analytics and rewards; no advisory lock inversion.
    await db.execute(sql`select id from users where id = ${user.id} for update`)
    const current = await payload.findByID({ collection: 'users', id: user.id, select: { sessions: true, isActive: true }, req, depth: 0, overrideAccess: true })
    if (current.isActive === false || !current.sessions?.some((session) => session.id === sid && Date.parse(session.expiresAt) > Date.now())) throw new WebVitalsError('Сессия завершена', 401)
    const sessionHash = authSessionHash(sid)
    const reportKey = webVitalReportKey(user.id, sid, input.metric.name, input.metric.id)
    const [existing, anchor] = await Promise.all([
      payload.find({ collection: 'web-vitals-reports', where: { reportKey: { equals: reportKey } }, limit: 1, depth: 0, overrideAccess: true, req }),
      payload.find({ collection: 'web-vitals-reports', where: { and: [{ user: { equals: user.id } }, { sessionHash: { equals: sessionHash } }] }, sort: ['createdAt', 'id'], limit: 1, depth: 0, overrideAccess: true, req }),
    ])
    const prior = existing.docs[0]
    if (prior && (prior.user !== user.id || prior.sessionHash !== sessionHash)) throw new WebVitalsError('Доступ запрещён', 403)
    const first = anchor.docs[0]
    const now = Date.now()
    const at = new Date(now).toISOString()
    const sameWindow = first?.quotaWindowStartedAt && Date.parse(first.quotaWindowStartedAt) > now - 60000
    const quota = { quotaWindowStartedAt: sameWindow ? first.quotaWindowStartedAt : at, quotaReportCount: (sameWindow ? first.quotaReportCount ?? 0 : 0) + 1 }
    if (quota.quotaReportCount > 120) throw new WebVitalsError('Слишком много измерений. Попробуйте позже', 429)
    if (!prior) {
      const scope: Where[] = [{ user: { equals: user.id } }, { sessionHash: { equals: sessionHash } }]
      const [minute, daily] = await Promise.all([
        payload.count({ collection: 'web-vitals-reports', where: { and: [...scope, { createdAt: { greater_than: new Date(now - 60000).toISOString() } }] }, overrideAccess: true, req }),
        payload.count({ collection: 'web-vitals-reports', where: { and: [...scope, { createdAt: { greater_than: new Date(now - DAY).toISOString() } }] }, overrideAccess: true, req }),
      ])
      if (minute.totalDocs >= 60 || daily.totalDocs >= 500) throw new WebVitalsError('Лимит новых измерений достигнут', 429)
    }
    if (first && first.id !== prior?.id) await payload.update({ collection: 'web-vitals-reports', id: first.id, data: quota, req: writableReq(req), overrideAccess: true, depth: 0 })
    const data = {
      user: user.id, sessionHash, reportKey, name: input.metric.name, value: input.metric.value,
      routeTemplate: prior?.routeTemplate ?? input.routeTemplate, navigationType: input.metric.navigationType ?? prior?.navigationType ?? null,
      reportedAt: at, ...(!first || first.id === prior?.id ? quota : {}),
    }
    if (prior) await payload.update({ collection: 'web-vitals-reports', id: prior.id, data, req: writableReq(req), depth: 0, overrideAccess: true })
    else await payload.create({ collection: 'web-vitals-reports', data, req: writableReq(req), depth: 0, overrideAccess: true })
    await commitTransaction(req)
    return { recorded: true }
  } catch (error) { await killTransaction(req); throw error }
}

export async function getUserWebVitals(req: PayloadRequest, userId: number): Promise<UserWebVitals> {
  if (!req.user || !Number.isSafeInteger(userId) || userId < 1) throw new WebVitalsError('Доступ запрещён', 403)
  if (req.user.id !== userId && (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role !== 'admin') throw new WebVitalsError('Доступ запрещён', 403)
  const db = await executor(req)
  const result = await db.execute(sql`select name, count(*) as "sampleCount", percentile_cont(0.75) within group (order by value) as p75
    from web_vitals_reports where user_id = ${userId} and reported_at >= ${new Date(Date.now() - 30 * DAY).toISOString()}::timestamptz group by name`)
  const rows = result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows) ? result.rows : []
  return { windowDays: 30, metrics: WEB_VITAL_NAMES.map((name) => {
    const row: unknown = rows.find((item: unknown) => item && typeof item === 'object' && 'name' in item && item.name === name)
    const sampleCount = row && typeof row === 'object' && 'sampleCount' in row ? Number(row.sampleCount) : 0
    const value = row && typeof row === 'object' && 'p75' in row ? Number(row.p75) : Number.NaN
    return { name, sampleCount: Number.isSafeInteger(sampleCount) && sampleCount >= 0 ? sampleCount : 0, p75: Number.isFinite(value) ? value : null }
  }) }
}

/** Bounded retention sweep for the server scheduler; no learning activity side effects. */
export async function cleanupWebVitals(payload: Payload, limit = 1000): Promise<number> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new WebVitalsError('Некорректный лимит очистки')
  const cutoff = new Date(Date.now() - 90 * DAY).toISOString()
  const quotaCutoff = new Date(Date.now() - 60000).toISOString()
  const inactiveQuota: Where = { or: [{ quotaWindowStartedAt: { exists: false } }, { quotaWindowStartedAt: { less_than: quotaCutoff } }] }
  const expired = await payload.find({ collection: 'web-vitals-reports', where: { and: [{ reportedAt: { less_than: cutoff } }, inactiveQuota] }, limit, sort: 'id', depth: 0, overrideAccess: true, select: { user: true } })
  if (!expired.docs.length) return 0
  const owners = [...new Set(expired.docs.map((doc) => relationId(doc.user)))].sort((a, b) => a - b)
  let removed = 0
  for (const owner of owners) {
    const req = await createLocalReq({ context: { syncWebVitals: true } }, payload)
    await initTransaction(req)
    try {
      const db = await executor(req, true)
      // One owner per transaction: no opposite lock order with live report/auth writes.
      await db.execute(sql`select id from users where id = ${owner} for update`)
      const result = await payload.delete({ collection: 'web-vitals-reports', where: { and: [
        { user: { equals: owner } }, { id: { in: expired.docs.map((doc) => doc.id) } }, { reportedAt: { less_than: cutoff } }, inactiveQuota,
      ] }, req, overrideAccess: true })
      removed += result.docs.length
      await commitTransaction(req)
    } catch (error) { await killTransaction(req); throw error }
  }
  return removed
}
