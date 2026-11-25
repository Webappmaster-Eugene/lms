import { confirmLegacyCourse } from '@/server/bootcamp-course-confirmation'
import { adminRequest, handleRoute, routeId, routeResponse } from '@/server/bootcamp-enrollment-routes'
import { readRequestJson } from '@/server/read-json-body'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute('Bootcamp course confirmation failed', async () => {
    const { payload, user } = await adminRequest(request, true)
    return routeResponse(await confirmLegacyCourse(payload, user, routeId((await params).id), await readRequestJson(request, 1024)))
  })
}
