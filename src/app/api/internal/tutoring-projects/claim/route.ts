import { handleRoute, routeResponse, workerRequest } from '@/server/bootcamp-enrollment-routes'
import { claimTutoringProject } from '@/server/tutoring-projects'

export async function POST(request: Request) {
  return handleRoute('Tutoring project claim failed', async () => routeResponse(await claimTutoringProject(await workerRequest(request))))
}
