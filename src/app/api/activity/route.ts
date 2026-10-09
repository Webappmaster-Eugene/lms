import { getPayload } from '@/lib/payload'
import { StudentAnalyticsError } from '@/lib/student-analytics'
import { logger } from '@/lib/telemetry'
import { readBoundedJson, RequestBodyError } from '@/server/read-json-body'
import { recordStudentActivity } from '@/server/student-analytics'

export const dynamic = 'force-dynamic'
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } })

export async function POST(request: Request) {
  try {
    const payload = await getPayload()
    const headers = new Headers(request.headers)
    const authorization = headers.get('authorization')
    if (authorization !== null) {
      if (!/^(JWT|Bearer) \S+$/.test(authorization)) return response({ error: 'Войдите в аккаунт' }, 401)
      headers.delete('cookie')
    }
    const { user } = await payload.auth({ headers })
    if (!user) return response({ error: 'Войдите в аккаунт' }, 401)
    const origin = headers.get('origin')
    const canonical = payload.config.serverURL ? new URL(payload.config.serverURL).origin : new URL(request.url).origin
    const permittedOrigins = new Set([canonical, new URL(request.url).origin])
    if ((!authorization && !origin) || (origin && !permittedOrigins.has(origin)) || ['cross-site', 'same-site'].includes(headers.get('sec-fetch-site') ?? '')) return response({ error: 'Доступ запрещён' }, 403)
    const body = await readBoundedJson(request, 2048)
    if (body && typeof body === 'object' && 'expectedUserId' in body && body.expectedUserId !== user.id) return response({ error: 'Аккаунт изменился. Обновите страницу' }, 403)
    return response(await recordStudentActivity(payload, user, headers, body))
  } catch (error) {
    if (error instanceof StudentAnalyticsError || error instanceof RequestBodyError) return response({ error: error.message }, error.status)
    const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500
    if (status < 500) return response({ error: 'Материал недоступен' }, status)
    logger.error('Student activity recording failed', error)
    return response({ error: 'Не удалось обновить активность' }, 500)
  }
}
