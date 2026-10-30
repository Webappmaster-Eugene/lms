import { retryEnrollment } from '@/server/bootcamp-enrollment'
import { adminRequest, handleRoute, routeId, routeResponse } from '@/server/bootcamp-enrollment-routes'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/** POST - упавшее зачисление снова в очередь исполнителю. */
export async function POST(request: Request, { params }: Props) {
  return handleRoute('Bootcamp enrollment retry failed', async () => {
    const { payload, user } = await adminRequest(request, true)
    return routeResponse({ enrollment: await retryEnrollment(payload, user, routeId((await params).id)) })
  })
}
