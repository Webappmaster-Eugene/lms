import { createLocalReq, type Where } from 'payload'
import { getPayload } from '@/lib/payload'
import { StudentAnalyticsError } from '@/lib/student-analytics'
import { logger } from '@/lib/telemetry'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { studentAnalyticsSnapshot } from '@/server/student-analytics'

export const dynamic = 'force-dynamic'
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } })
function positive(raw: string | null, fallback?: number) {
  const value = raw === null && fallback !== undefined ? fallback : Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) throw new StudentAnalyticsError('Некорректный номер')
  return value
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
    const req = await createLocalReq({ user }, payload)
    if (url.searchParams.get('kind') === 'students') {
      const search = (url.searchParams.get('search') ?? '').trim()
      if (search.length > 100) throw new StudentAnalyticsError('Поиск слишком длинный')
      const page = positive(url.searchParams.get('page'), 1)
      const where: Where = search ? { or: [{ firstName: { contains: search } }, { lastName: { contains: search } }, { email: { contains: search } }] } : {}
      const result = await payload.find({ collection: 'users', where, page, limit: 25, sort: 'id', select: { firstName: true, lastName: true, email: true, isActive: true, role: true }, depth: 0, overrideAccess: false, req })
      return response({ docs: result.docs.map(student => ({ id: student.id, title: `${student.firstName} ${student.lastName}`, email: student.email, isActive: student.isActive !== false, role: student.role })), page, hasNextPage: result.hasNextPage })
    }
    return response(await studentAnalyticsSnapshot(payload, user, positive(url.searchParams.get('user')), positive(url.searchParams.get('sessionsPage'), 1), positive(url.searchParams.get('eventsPage'), 1)))
  } catch (error) {
    if (error instanceof StudentAnalyticsError) return response({ error: error.message }, error.status)
    const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500
    if (status < 500) return response({ error: 'Ученик не найден' }, status)
    logger.error('Student analytics read failed', error)
    return response({ error: 'Не удалось загрузить аналитику' }, 500)
  }
}
