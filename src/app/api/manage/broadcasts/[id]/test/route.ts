import { broadcastAdmin, broadcastFailure, broadcastIdParam, broadcastResponse } from '@/server/broadcasts/api'
import { sendBroadcastTest } from '@/server/broadcasts/service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { payload, user } = await broadcastAdmin(request, true)
    await sendBroadcastTest(payload, broadcastIdParam((await params).id), user)
    return broadcastResponse({ ok: true, to: user.email })
  } catch (error) { return broadcastFailure(error) }
}
