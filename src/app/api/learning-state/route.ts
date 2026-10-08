import { getPayload } from '@/lib/payload'
import { accessibleLearningLesson, getLearningState, learningMutation, LearningStateError, saveLearningState } from '@/server/learning-state'
import { recordLearningAccess, withLearningSpan } from '@/lib/learning-observability'
import { readBoundedJson, RequestBodyError } from '@/server/read-json-body'

export const dynamic = 'force-dynamic'
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

async function handle(request: Request, write: boolean) {
  const payload = await getPayload()
  const headers = new Headers(request.headers)
  const authorization = headers.get('authorization')
  if (authorization !== null) {
    if (!/^(?:JWT|Bearer) \S+$/.test(authorization)) return response({ error: 'Войдите в аккаунт' }, 401)
    headers.delete('cookie')
  }
  const { user } = await payload.auth({ headers })
  if (!user) return response({ error: 'Войдите в аккаунт' }, 401)
  const origin = request.headers.get('origin')
  if (write) {
    const requestUrl = new URL(request.url)
    const origins = new Set([requestUrl.origin])
    if (process.env.NEXT_PUBLIC_SERVER_URL) origins.add(new URL(process.env.NEXT_PUBLIC_SERVER_URL).origin)
    const host = request.headers.get('host')
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
    const protocol = forwardedProtocol === 'http' || forwardedProtocol === 'https' ? `${forwardedProtocol}:` : requestUrl.protocol
    if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) origins.add(new URL(`${protocol}//${host}`).origin)
    const fetchSite = request.headers.get('sec-fetch-site')
    if ((authorization === null && !origin) || (origin && !origins.has(origin)) || fetchSite === 'cross-site' || fetchSite === 'same-site') return response({ error: 'Доступ запрещён' }, 403)
  }
  try {
    const body: unknown = write ? await readBoundedJson(request, 16 * 1024) : { lessonId: Number(new URL(request.url).searchParams.get('lessonId')), at: Date.now() }
    const expectedUserId = write && body && typeof body === 'object' && 'expectedUserId' in body ? body.expectedUserId : new URL(request.url).searchParams.get('expectedUserId')
    if (expectedUserId !== undefined && expectedUserId !== null && Number(expectedUserId) !== user.id) return response({ error: 'Аккаунт изменился. Обновите страницу' }, 403)
    const { lessonId, mutation } = learningMutation(body)
    const lesson = await accessibleLearningLesson(payload, user, lessonId)
    return response(write ? await saveLearningState(payload, user, lesson, mutation) : await getLearningState(payload, user, lesson))
  } catch (error) {
    if (error instanceof RequestBodyError) return response({ error: error.message }, error.status)
    if (error instanceof LearningStateError) return response({ error: error.message }, error.status)
    if (error instanceof SyntaxError) return response({ error: 'Некорректные данные' }, 400)
    payload.logger.error({ err: error }, 'Не удалось сохранить место остановки')
    return response({ error: 'Не удалось синхронизировать место остановки' }, 500)
  }
}

async function observedHandle(request: Request, write: boolean) {
  return withLearningSpan('lesson', 'access', async () => {
    const started = Date.now()
    const result = await handle(request, write)
    recordLearningAccess({
      resource: 'lesson',
      outcome: result.status < 400 ? 'allow' : result.status >= 500 ? 'error' : 'deny',
      reason: result.status < 400 ? 'assigned' : result.status === 401 ? 'unauthenticated' : result.status === 404 ? 'not_found' : result.status === 403 ? 'restricted' : result.status >= 500 ? 'internal_error' : 'invalid_request',
      durationMs: Date.now() - started,
    })
    return result
  })
}

export const GET = (request: Request) => observedHandle(request, false)
export const POST = (request: Request) => observedHandle(request, true)
