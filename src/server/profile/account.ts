import 'server-only'

import { APIError, commitTransaction, createLocalReq, getPayload, initTransaction, killTransaction, refreshOperation, ValidationError } from 'payload'
import { generatePayloadCookie } from 'payload/shared'
import config from '@payload-config'

import { normalizeTelegram, passwordPolicyError } from '@/lib/profile'
import { getProfileDTO } from '@/server/profile/read'
import { authorizeProfileCredentialChange } from '@/payload/hooks/protectProfileCredentials'
import { createRateLimiter } from '@/server/trainer/rate-limit'
import { logger } from '@/lib/telemetry'

const limiter = createRateLimiter('profile-write', 20, 60000)
const PROFILE_FIELDS = ['firstName', 'lastName', 'email', 'telegram', 'bio', 'avatar', 'currentPassword']

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw new APIError('Ожидается JSON', 400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 16384) { await reader.cancel(); throw new APIError('Слишком большой запрос', 413) }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  let data: unknown
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new APIError('Некорректный JSON', 400) }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new APIError('Ожидается объект JSON', 400)
  return data as Record<string, unknown>
}

function profilePatch(body: Record<string, unknown>): Record<string, unknown> {
  if (Object.keys(body).some((key) => !PROFILE_FIELDS.includes(key))) throw new APIError('Запрос содержит недоступные поля профиля', 400)
  const patch: Record<string, unknown> = {}
  for (const key of ['firstName', 'lastName']) {
    if (body[key] === undefined) continue
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].trim().length > 100) throw new APIError('Имя и фамилия должны содержать от 1 до 100 символов', 400)
    patch[key] = body[key].trim()
  }
  if (body.email !== undefined) {
    if (typeof body.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) throw new APIError('Укажите корректный email', 400)
    patch.email = body.email.trim().toLowerCase()
  }
  if (body.telegram !== undefined) {
    try { patch.telegram = normalizeTelegram(body.telegram) } catch (error) { throw new APIError(error instanceof Error ? error.message : 'Некорректный Telegram', 400) }
  }
  if (body.bio !== undefined) {
    if (body.bio !== null && (typeof body.bio !== 'string' || body.bio.length > 500)) throw new APIError('Текст о себе должен быть не длиннее 500 символов', 400)
    patch.bio = typeof body.bio === 'string' ? body.bio.trim() : null
  }
  if (body.avatar !== undefined) {
    if (body.avatar !== null && (typeof body.avatar !== 'number' || !Number.isSafeInteger(body.avatar) || body.avatar <= 0)) throw new APIError('Некорректный аватар', 400)
    patch.avatar = body.avatar
  }
  if (!Object.keys(patch).length) throw new APIError('Нет изменений для сохранения', 400)
  return patch
}

function json(data: unknown, status = 200, cookie?: string): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } })
}

function routeError(error: unknown): Response {
  if (error instanceof APIError && error.status >= 400 && error.status < 500) {
    if (error instanceof ValidationError && error.data.errors.some((field) => field.path === 'email')) return json({ error: 'Этот email уже используется или указан неверно' }, 409)
    return json({ error: error.message }, error.status)
  }
  // Never log SDK validation data: it may contain the raw submitted password.
  logger.error('Не удалось сохранить профиль', undefined, { 'error.type': error instanceof Error ? error.name : 'UnknownError' })
  return json({ error: 'Не удалось сохранить изменения. Попробуйте ещё раз.' }, 500)
}

export async function getProfile(request: Request): Promise<Response> {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return json({ error: 'Требуется авторизация' }, 401)
    return json({ profile: await getProfileDTO(payload, user) })
  } catch (error) { return routeError(error) }
}

export async function updateProfile(request: Request, passwordOnly = false): Promise<Response> {
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) return json({ error: 'Требуется авторизация' }, 401)
    const origin = request.headers.get('origin')
    if (origin && origin !== payload.config.serverURL) return json({ error: 'Изменения доступны только на сайте платформы' }, 403)
    if (!limiter.take(String(user.id))) return json({ error: 'Слишком много попыток. Подождите минуту.' }, 429)
    const body = await readBody(request)
    if (body.currentPassword !== undefined && (typeof body.currentPassword !== 'string' || body.currentPassword.length > 1024)) throw new APIError('Некорректный текущий пароль', 400)
    let data: Record<string, unknown>
    if (passwordOnly) {
      if (Object.keys(body).some((key) => !['currentPassword', 'newPassword'].includes(key))) throw new APIError('Запрос содержит недоступные поля', 400)
      const error = passwordPolicyError(body.newPassword)
      if (error) throw new APIError(error, 400)
      data = { password: body.newPassword }
    } else data = profilePatch(body)
    const sensitive = passwordOnly || (typeof data.email === 'string' && data.email !== user.email)
    if (sensitive && (typeof body.currentPassword !== 'string' || !body.currentPassword)) throw new APIError('Введите текущий пароль для подтверждения', 400)
    const req = await createLocalReq({ user, req: { url: request.url, headers: request.headers } }, payload)
    if (!(await initTransaction(req))) throw new Error('Profile changes require a transaction')
    try {
      if (sensitive) authorizeProfileCredentialChange(req, user.id, String(body.currentPassword))
      const updated = await payload.update({ collection: 'users', id: user.id, data, req, overrideAccess: false, depth: 0 })
      let cookie: string | undefined
      let token: string | undefined
      if (sensitive) {
        req.user = { ...user, ...updated }
        const refresh = await refreshOperation({ collection: payload.collections.users, req })
        token = refresh.refreshedToken
        cookie = generatePayloadCookie({ collectionAuthConfig: payload.collections.users.config.auth, cookiePrefix: payload.config.cookiePrefix, token })
      }
      const result = passwordOnly ? { ok: true, ...(token ? { token } : {}) } : { profile: await getProfileDTO(payload, { ...user, ...updated }, req), ...(token ? { token } : {}) }
      await commitTransaction(req)
      return json(result, 200, cookie)
    } catch (error) { await killTransaction(req); throw error }
  } catch (error) { return routeError(error) }
}
