import { EnrollmentInputError } from '@/lib/bootcamp-enrollment'
import { handleRoute, routeId, routeResponse, workerRequest } from '@/server/bootcamp-enrollment-routes'
import { reportGitlabRevoked } from '@/server/bootcamp-refund'
import { readRequestJson } from '@/server/read-json-body'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/** POST - исполнитель заблокировал учётку GitLab после возврата денег ({ ok: true }) или не смог ({ error }). */
export async function POST(request: Request, { params }: Props) {
  return handleRoute('Bootcamp GitLab revoke report failed', async () => {
    const payload = await workerRequest(request)
    const id = routeId((await params).id)
    const body = await readRequestJson(request, 4096)
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as { ok?: unknown, error?: unknown } : null
    if (!input || (input.ok !== true && typeof input.error !== 'string')) throw new EnrollmentInputError('Нужно { ok: true } или { error: текст }')
    await reportGitlabRevoked(payload, id, input.ok === true ? { ok: true, error: null } : { ok: false, error: String(input.error) })
    return routeResponse({ ok: true })
  })
}
