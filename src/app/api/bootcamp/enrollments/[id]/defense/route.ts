import { recordDefense } from '@/server/bootcamp-defense'
import { adminRequest, handleRoute, routeId, routeResponse } from '@/server/bootcamp-enrollment-routes'
import { readRequestJson } from '@/server/read-json-body'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute('Bootcamp defense failed', async () => {
    const { payload, user } = await adminRequest(request, true)
    return routeResponse(await recordDefense(payload, user, routeId((await params).id), await readRequestJson(request, 8192)))
  })
}
