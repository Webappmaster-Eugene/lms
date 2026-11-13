import { createLocalReq } from 'payload'

import { getPayload } from '@/lib/payload'
import { parsePeriod } from '@/lib/learning-analytics'
import { logger } from '@/lib/telemetry'
import { courseDetail, coursesOverview } from '@/server/course-analytics'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

export const dynamic = 'force-dynamic'
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } })

/** Необязательный положительный идентификатор: пусто - нет фильтра, мусор - ошибка запроса. */
function optionalId(raw: string | null): number | null | undefined {
  if (raw === null || raw === '') return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}

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
    const course = optionalId(url.searchParams.get('course'))
    const roadmap = optionalId(url.searchParams.get('roadmap'))
    if (course === undefined || roadmap === undefined) return response({ error: 'Некорректный номер курса или роадмапа' }, 400)
    if (course !== null) {
      const detail = await courseDetail(payload, course)
      return detail ? response(detail) : response({ error: 'Курс не найден' }, 404)
    }
    const req = await createLocalReq({ user }, payload)
    return response(await coursesOverview(payload, req, { period: parsePeriod(url.searchParams.get('period')), roadmap }))
  } catch (error) {
    logger.error('Learning analytics read failed', error)
    return response({ error: 'Не удалось загрузить аналитику курсов' }, 500)
  }
}
