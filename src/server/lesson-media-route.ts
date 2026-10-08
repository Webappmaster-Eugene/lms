import 'server-only'

import { getPayload } from 'payload'
import config from '@payload-config'

import { recordLearningAccess, withLearningSpan } from '@/lib/learning-observability'
import { YandexDiskError } from '@/lib/yandex-disk'
import { LessonVideoAccessError, resolveLessonVideoSource } from '@/server/lesson-video-access'
import { localLearningMedia, mediaError } from '@/server/learning-media-response'
import { LearningStreamLimitError } from '@/server/learning-stream-limits'
import { LearningUpstreamError, upstreamLearningMedia } from '@/server/learning-upstream'

export async function lessonMediaRoute(request: Request, allowMaterial = false): Promise<Response> {
  return withLearningSpan('media', 'stream', async () => {
    const started = performance.now()
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    if (!user) {
      recordLearningAccess({ resource: 'media', outcome: 'deny', reason: 'unauthenticated' })
      return mediaError('Требуется авторизация', 401)
    }
    try {
      const source = await resolveLessonVideoSource(payload, user, new URL(request.url).searchParams, allowMaterial)
      const response = source.kind === 'media'
        ? await localLearningMedia(request, payload, user, decodeURIComponent(source.path.slice('/api/media/file/'.length)))
        : await upstreamLearningMedia(request, user.id, source.ref)
      recordLearningAccess({ resource: 'media', outcome: response.ok ? 'allow' : 'error', reason: response.ok ? 'assigned' : 'upstream_error', userId: user.id, durationMs: performance.now() - started })
      return response
    } catch (error) {
      if (error instanceof LessonVideoAccessError) {
        recordLearningAccess({ resource: 'media', outcome: 'deny', reason: error.status === 400 ? 'invalid_request' : 'unassigned', userId: user.id })
        return mediaError(error.message, error.status)
      }
      if (error instanceof LearningStreamLimitError) {
        recordLearningAccess({ resource: 'media', outcome: 'deny', reason: 'rate_limited', userId: user.id })
        const response = mediaError(error.message, 429)
        response.headers.set('Retry-After', '60')
        return response
      }
      const reason = error instanceof LearningUpstreamError ? error.reason : 'upstream_error'
      recordLearningAccess({ resource: 'media', outcome: 'error', reason, userId: user.id })
      return mediaError('Не удалось открыть файл. Попробуйте ещё раз', error instanceof YandexDiskError && error.statusCode === 404 ? 404 : 502)
    }
  }).catch(() => {
    recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'internal_error' })
    return mediaError('Сервис файлов временно недоступен', 503)
  })
}
