import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { reportGitlabSignIn } from '@/server/bootcamp-enrollment'
import { handleRoute, routeId, routeResponse, workerRequest } from '@/server/bootcamp-enrollment-routes'
import { readRequestJson } from '@/server/read-json-body'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/** POST - исполнитель увидел первый вход ученика в GitLab ({ at: время входа }). */
export async function POST(request: Request, { params }: Props) {
  return handleRoute('Bootcamp GitLab sign-in report failed', async () => {
    const payload = await workerRequest(request)
    const id = routeId((await params).id)
    const body = await readRequestJson(request, 1024)
    const at = body && typeof body === 'object' ? (body as { at?: unknown }).at : undefined
    if (typeof at !== 'string') throw new EnrollmentInputError('Нужно время входа: { at }')
    await reportGitlabSignIn(payload, id, at)
    return routeResponse({ ok: true })
  })
}
