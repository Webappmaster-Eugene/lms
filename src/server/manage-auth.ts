import { getPayload } from 'payload'
import config from '@payload-config'

import { AssignmentInputError } from '@/components/learning-access/contracts'

/** Вход администратора для /api/manage: явный токен важнее cookie, неверный токен cookie не подменяет. */
export async function authenticateManager(request: Request, forbidden = 'Назначать обучение может только администратор') {
  const payload = await getPayload({ config })
  const headers = new Headers(request.headers)
  const authorization = headers.get('Authorization')
  if (authorization !== null) {
    if (!/^(?:JWT|Bearer) \S+$/.test(authorization)) throw new AssignmentInputError('Требуется авторизация', 401)
    headers.delete('Cookie')
  }
  const { user } = await payload.auth({ headers })
  if (!user) throw new AssignmentInputError('Требуется авторизация', 401)
  if (user.role !== 'admin') throw new AssignmentInputError(forbidden, 403)
  return { payload, user, authorization }
}

/** Запрос с cookie браузер мог отправить с чужого сайта, запрос с токеном - нет. */
export function assertSameOrigin(request: Request, authorization: string | null) {
  if (authorization !== null) return
  const url = new URL(request.url)
  const origins = new Set([url.origin])
  if (process.env.NEXT_PUBLIC_SERVER_URL) origins.add(new URL(process.env.NEXT_PUBLIC_SERVER_URL).origin)
  const host = request.headers.get('Host')
  const forwarded = request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim()
  const protocol = forwarded === 'https' || forwarded === 'http' ? `${forwarded}:` : url.protocol
  if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) origins.add(new URL(`${protocol}//${host}`).origin)
  const site = request.headers.get('Sec-Fetch-Site')
  if (!origins.has(request.headers.get('Origin') ?? '') || site === 'cross-site' || site === 'same-site') throw new AssignmentInputError('Сохранение доступно только со страницы платформы', 403)
}
