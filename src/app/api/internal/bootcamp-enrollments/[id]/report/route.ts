import { parseWorkerReport, reportEnrollment } from '@/server/bootcamp-enrollment'
import { handleRoute, routeId, routeResponse, workerRequest } from '@/server/bootcamp-enrollment-routes'
import { readRequestJson } from '@/server/read-json-body'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/** POST - ход задания: шаги GitLab, id учётки и проекта, итог. */
export async function POST(request: Request, { params }: Props) {
  return handleRoute('Bootcamp enrollment report failed', async () => {
    const payload = await workerRequest(request)
    const id = routeId((await params).id)
    return routeResponse({ enrollment: await reportEnrollment(payload, id, parseWorkerReport(await readRequestJson(request, 64 * 1024))) })
  })
}
