import { broadcastAdmin, broadcastFailure, broadcastIdParam, broadcastResponse } from '@/server/broadcasts/api'
import { cancelBroadcast } from '@/server/broadcasts/service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { payload } = await broadcastAdmin(request, true)
    const doc = await cancelBroadcast(payload, broadcastIdParam((await params).id))
    return broadcastResponse({ doc: { id: doc.id, status: doc.status } })
  } catch (error) { return broadcastFailure(error) }
}
