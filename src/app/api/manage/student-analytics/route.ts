import { createLocalReq } from 'payload'
import { getPayload } from '@/lib/payload'
import { StudentAnalyticsError } from '@/lib/student-analytics'
import { logger } from '@/lib/telemetry'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { studentAnalyticsSnapshot } from '@/server/student-analytics'
import { studentLearning, studentsOverview } from '@/server/learning-analytics'
import { parsePeriod, parseStudentFilter, parseStudentSort } from '@/lib/learning-analytics'

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
      return response(await studentsOverview(payload, req, {
        period: parsePeriod(url.searchParams.get('period')),
        filter: parseStudentFilter(url.searchParams.get('filter')),
        search,
        showTest: url.searchParams.get('test') === '1',
        sort: parseStudentSort(url.searchParams.get('sort')),
        descending: url.searchParams.get('dir') !== 'asc',
        page: positive(url.searchParams.get('page'), 1),
      }))
    }
    const userId = positive(url.searchParams.get('user'))
    const snapshot = await studentAnalyticsSnapshot(payload, user, userId, positive(url.searchParams.get('sessionsPage'), 1), positive(url.searchParams.get('eventsPage'), 1))
    // Обучение и заморозка - только у учеников: у администратора нет назначений и сроков доступа.
    return response(snapshot.student.role === 'admin' ? snapshot : { ...snapshot, learning: await studentLearning(payload, req, userId) })
  } catch (error) {
    if (error instanceof StudentAnalyticsError) return response({ error: error.message }, error.status)
    const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500
    if (status < 500) return response({ error: 'Ученик не найден' }, status)
    logger.error('Student analytics read failed', error)
    return response({ error: 'Не удалось загрузить аналитику' }, 500)
  }
}
