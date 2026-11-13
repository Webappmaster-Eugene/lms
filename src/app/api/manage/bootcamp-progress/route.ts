import { createLocalReq } from 'payload'

import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { bootcampProgress } from '@/server/bootcamp-progress'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

export const dynamic = 'force-dynamic'
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } })

export async function GET(request: Request) {
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
    if ((await getAuthoritativeLearningPolicy(payload, user.id)).role !== 'admin') return response({ error: 'Просмотр доступен только администратору' }, 403)
    const url = new URL(request.url)
    const raw = url.searchParams.get('stream')
    const stream = raw === null || raw === '' ? null : Number(raw)
    if (stream !== null && (!Number.isSafeInteger(stream) || stream <= 0)) return response({ error: 'Некорректный номер потока' }, 400)
    const req = await createLocalReq({ user }, payload)
    return response(await bootcampProgress(payload, req, { stream, withTest: url.searchParams.get('test') === '1' }))
  } catch (error) {
    logger.error('Bootcamp progress read failed', error)
    return response({ error: 'Не удалось загрузить учёбу буткемпа' }, 500)
  }
}
