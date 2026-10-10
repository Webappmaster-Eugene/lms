import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { readBoundedJson, RequestBodyError } from '@/server/read-json-body'
import { recordWebVitals, WebVitalsError } from '@/server/web-vitals'

export const dynamic = 'force-dynamic'
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } })

async function metricBody(request: Request) {
  try {
    return await readBoundedJson(request, 4096)
  } catch (error) {
    if (error instanceof RequestBodyError) throw error
    // Offline transitions and page teardown can interrupt a beacon's request stream.
    if (request.signal.aborted || error instanceof Error && (error.name === 'AbortError' || error.message === 'aborted')) {
      throw new RequestBodyError('Передача показателей страницы прервана')
    }
    throw error
  }
}

export async function POST(request: Request) {
  try {
    const payload = await getPayload()
    const headers = new Headers(request.headers)
    const authorization = headers.get('authorization')
    if (authorization !== null) {
      if (!/^(?:JWT|Bearer) \S+$/.test(authorization)) return response({ error: 'Войдите в аккаунт' }, 401)
      headers.delete('cookie')
    }
    const { user } = await payload.auth({ headers })
    if (!user) return response({ error: 'Войдите в аккаунт' }, 401)
    const origin = headers.get('origin')
    const canonical = payload.config.serverURL ? new URL(payload.config.serverURL).origin : new URL(request.url).origin
    if ((!authorization && !origin) || (origin && origin !== canonical) || ['same-site', 'cross-site'].includes(headers.get('sec-fetch-site') ?? '')) return response({ error: 'Доступ запрещён' }, 403)
    return response(await recordWebVitals(payload, user, await metricBody(request)))
  } catch (error) {
    if (error instanceof WebVitalsError || error instanceof RequestBodyError) return response({ error: error.message }, error.status)
    logger.error('Web vitals recording failed', error)
    return response({ error: 'Не удалось сохранить показатели страницы' }, 500)
  }
}
