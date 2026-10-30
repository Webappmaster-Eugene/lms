import { getPayload } from '@/lib/payload'
import { logger } from '@/lib/telemetry'
import { handleGitlabEvent } from '@/server/bootcamp-gitlab-events'
import { validGitlabWebhookToken } from '@/server/bootcamp-worker-auth'
import { readRequestJson, RequestBodyError } from '@/server/read-json-body'

export const dynamic = 'force-dynamic'

const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST - вебхук проекта ученика в GitLab. Токен ставит исполнитель при зачислении.
 * Сбой разбора отвечает 200: GitLab после череды ошибок отключает вебхук, а потерять
 * одно уведомление дешевле, чем все следующие.
 */
export async function POST(request: Request) {
  if (!validGitlabWebhookToken(request.headers.get('x-gitlab-token'))) return response({ error: 'Доступ запрещён' }, 403)
  try {
    const body = await readRequestJson(request, 2 * 1024 * 1024)
    return response({ result: await handleGitlabEvent(await getPayload(), request.headers.get('x-gitlab-event'), body) })
  } catch (error) {
    if (error instanceof RequestBodyError) return response({ error: error.message }, error.status)
    logger.error('GitLab event handling failed', error)
    return response({ result: 'failed' })
  }
}
