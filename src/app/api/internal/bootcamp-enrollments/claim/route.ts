import { claimEnrollment } from '@/server/bootcamp-enrollment'
import { handleRoute, routeResponse, workerRequest } from '@/server/bootcamp-enrollment-routes'

export const dynamic = 'force-dynamic'

/** POST - исполнитель в VM GitLab берёт задание и список учёток, чей первый вход ждём. */
export async function POST(request: Request) {
  return handleRoute('Bootcamp enrollment claim failed', async () => routeResponse(await claimEnrollment(await workerRequest(request))))
}
