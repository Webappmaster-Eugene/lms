import { parseEnrollmentInput } from '@/lib/bootcamp-enrollment'
import { leadEnrollmentState, startEnrollment } from '@/server/bootcamp-enrollment'
import { adminRequest, handleRoute, routeId, routeResponse } from '@/server/bootcamp-enrollment-routes'
import { readRequestJson } from '@/server/read-json-body'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/** GET - состояние зачисления по заявке и подсказки для формы. */
export async function GET(request: Request, { params }: Props) {
  return handleRoute('Bootcamp enrollment state failed', async () => {
    const { payload } = await adminRequest(request, false)
    return routeResponse(await leadEnrollmentState(payload, routeId((await params).id)))
  })
}

/** POST - «Зачислить»: учётка и курс в LMS сразу, GitLab - в очередь исполнителю. */
export async function POST(request: Request, { params }: Props) {
  return handleRoute('Bootcamp enrollment start failed', async () => {
    const { payload, user } = await adminRequest(request, true)
    const leadId = routeId((await params).id)
    const input = parseEnrollmentInput(await readRequestJson(request, 4096))
    await startEnrollment(payload, user, leadId, input)
    return routeResponse(await leadEnrollmentState(payload, leadId), 201)
  })
}
