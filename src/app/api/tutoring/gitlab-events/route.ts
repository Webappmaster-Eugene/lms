import { getPayload } from '@/lib/payload'
import { handleRoute, routeId, routeResponse } from '@/server/bootcamp-enrollment-routes'
import { validTutoringWebhookToken } from '@/server/bootcamp-worker-auth'
import { readRequestJson } from '@/server/read-json-body'
import { recordTutoringGitlabEvent } from '@/server/tutoring-projects'

export async function POST(request: Request) {
  return handleRoute('Tutoring GitLab event failed', async () => {
    const project = routeId(new URL(request.url).searchParams.get('project') ?? '')
    if (!validTutoringWebhookToken(project, request.headers.get('x-gitlab-token'))) return routeResponse({ error: 'Доступ запрещён' }, 403)
    const recorded = await recordTutoringGitlabEvent(await getPayload(), project, request.headers.get('x-gitlab-event'), await readRequestJson(request, 512 * 1024))
    return routeResponse({ recorded })
  })
}
