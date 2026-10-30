import 'server-only'

import type { Payload } from 'payload'

import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { validWorkerKey } from '@/server/bootcamp-worker-auth'
import { foreignPage } from '@/server/foreign-page'
import { RequestBodyError } from '@/server/read-json-body'
import type { User } from '@/payload-types'

export const routeResponse = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

/** Панель зачисления в CMS: только администратор; запись - только со своей страницы. */
export async function adminRequest(request: Request, write: boolean): Promise<{ payload: Payload, user: User }> {
  const payload = await getPayload()
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) throw new EnrollmentInputError('Требуется вход администратора', 401)
  if (user.role !== 'admin') throw new EnrollmentInputError('Зачислять может только администратор', 403)
  if (write && foreignPage(request.headers)) throw new EnrollmentInputError('Действие доступно только со страниц платформы', 403)
  return { payload, user }
}

/** Исполнитель в VM GitLab: ключ из PAYLOAD_SECRET в заголовке x-lms-worker-key. */
export async function workerRequest(request: Request): Promise<Payload> {
  if (!validWorkerKey(request.headers.get('x-lms-worker-key'))) throw new EnrollmentInputError('Доступ запрещён', 403)
  return getPayload()
}

export function routeId(raw: string): number {
  const id = /^\d{1,12}$/.test(raw) ? Number(raw) : NaN
  if (!Number.isSafeInteger(id) || id <= 0) throw new EnrollmentInputError('Неверный id', 404)
  return id
}

export async function handleRoute(label: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof EnrollmentInputError || error instanceof RequestBodyError) return routeResponse({ error: error.message }, error.status)
    logger.error(label, error)
    return routeResponse({ error: 'Не получилось выполнить действие из-за ошибки на сервере. Подробности в журнале приложения.' }, 500)
  }
}
