import { getPayload } from 'payload'
import config from '@payload-config'
import { recordLearningAccess, withLearningSpan } from '@/lib/learning-observability'
import { localLearningMedia, mediaError } from '@/server/learning-media-response'
import { LearningStreamLimitError } from '@/server/learning-stream-limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(request: Request, context: { params: Promise<{ filename: string }> }): Promise<Response> {
  return withLearningSpan('media', 'stream', async () => {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: request.headers })
    try {
      const { filename } = await context.params
      return await localLearningMedia(request, payload, user, filename)
    } catch (error) {
      if (error instanceof LearningStreamLimitError) {
        recordLearningAccess({ resource: 'media', outcome: 'deny', reason: 'rate_limited', userId: user?.id })
        const response = mediaError(error.message, 429)
        response.headers.set('Retry-After', '60')
        return response
      }
      recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'internal_error', userId: user?.id })
      return mediaError('Не удалось открыть файл', 500)
    }
  }).catch(() => {
    recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'internal_error' })
    return mediaError('Сервис файлов временно недоступен', 503)
  })
}

export const GET = handle
export const HEAD = handle
