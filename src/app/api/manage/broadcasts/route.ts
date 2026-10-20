import { broadcastAdmin, broadcastBody, broadcastFailure, broadcastResponse } from '@/server/broadcasts/api'
import { createBroadcastDraft, validateBroadcastInput } from '@/server/broadcasts/service'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { payload, user } = await broadcastAdmin(request, true)
    const doc = await createBroadcastDraft(payload, user, validateBroadcastInput(await broadcastBody(request)))
    return broadcastResponse({ doc: { id: doc.id } }, 201)
  } catch (error) { return broadcastFailure(error) }
}
