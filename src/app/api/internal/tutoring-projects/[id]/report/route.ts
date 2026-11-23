import { handleRoute, routeId, routeResponse, workerRequest } from '@/server/bootcamp-enrollment-routes'
import { readRequestJson } from '@/server/read-json-body'
import { reportTutoringProject } from '@/server/tutoring-projects'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute('Tutoring project report failed', async () => {
    const payload = await workerRequest(request)
    return routeResponse(await reportTutoringProject(payload, routeId((await params).id), await readRequestJson(request, 32 * 1024)))
  })
}
