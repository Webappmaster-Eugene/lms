import 'server-only'

import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { readBoundedJson, RequestBodyError } from '@/server/read-json-body'
import { BroadcastError } from '@/server/broadcasts/service'

export const broadcastResponse = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } })

function sameOriginWrite(request: Request): boolean {
  const url = new URL(request.url)
  const origins = new Set([url.origin])
  if (process.env.NEXT_PUBLIC_SERVER_URL) origins.add(new URL(process.env.NEXT_PUBLIC_SERVER_URL).origin)
  const host = request.headers.get('Host')
  const forwarded = request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim()
  const protocol = forwarded === 'https' || forwarded === 'http' ? `${forwarded}:` : url.protocol
  // Next может видеть localhost за прокси; Host — настоящий адрес браузера, X-Forwarded-Host клиенту не доверяем.
  if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) origins.add(new URL(`${protocol}//${host}`).origin)
  const site = request.headers.get('Sec-Fetch-Site')
  return origins.has(request.headers.get('Origin') ?? '') && site !== 'cross-site' && site !== 'same-site'
}

/** Рассылкой управляет только администратор и только со страницы платформы. */
export async function broadcastAdmin(request: Request, write: boolean) {
  const payload = await getPayload()
  const headers = new Headers(request.headers)
  const authorization = headers.get('Authorization')
  if (authorization !== null) {
    if (!/^(?:JWT|Bearer) \S+$/.test(authorization)) throw new BroadcastError('Требуется авторизация', 401)
    // Неверный явный токен не должен откатываться к сессионной куке.
    headers.delete('Cookie')
  }
  const { user } = await payload.auth({ headers })
  if (!user) throw new BroadcastError('Требуется авторизация', 401)
  if (user.role !== 'admin') throw new BroadcastError('Рассылки доступны только администратору', 403)
  if (write && authorization === null && !sameOriginWrite(request)) throw new BroadcastError('Действие доступно только со страницы платформы', 403)
  return { payload, user }
}

export async function broadcastBody(request: Request): Promise<unknown> {
  return readBoundedJson(request, 128_000)
}

export function broadcastIdParam(raw: string): number {
  const id = Number(raw)
  // id — integer Postgres: больший номер дал бы ошибку БД и 500 вместо «не найдено».
  if (!/^[1-9]\d{0,9}$/.test(raw) || id > 2_147_483_647) throw new BroadcastError('Рассылка не найдена', 404)
  return id
}

export function broadcastFailure(error: unknown): Response {
  if (error instanceof BroadcastError || error instanceof RequestBodyError) return broadcastResponse({ error: error.message }, error.status)
  logger.error('Email broadcast API failed', error)
  return broadcastResponse({ error: 'Не удалось выполнить действие с рассылкой. Попробуйте ещё раз' }, 500)
}
