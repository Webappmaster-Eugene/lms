import { broadcastAdmin, broadcastBody, broadcastFailure, broadcastIdParam, broadcastResponse } from '@/server/broadcasts/api'
import { deleteBroadcastDraft, updateBroadcastDraft, validateBroadcastInput } from '@/server/broadcasts/service'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { payload } = await broadcastAdmin(request, true)
    const id = broadcastIdParam((await params).id)
    const doc = await updateBroadcastDraft(payload, id, validateBroadcastInput(await broadcastBody(request)))
    return broadcastResponse({ doc: { id: doc.id } })
  } catch (error) { return broadcastFailure(error) }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { payload } = await broadcastAdmin(request, true)
    await deleteBroadcastDraft(payload, broadcastIdParam((await params).id))
    return broadcastResponse({ ok: true })
  } catch (error) { return broadcastFailure(error) }
}
