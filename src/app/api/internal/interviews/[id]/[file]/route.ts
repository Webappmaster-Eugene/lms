import { getPayload } from '@/lib/payload'
import { relationId } from '@/lib/relation-id'
import { validInterviewSource } from '@/server/interviews/capability'
import { streamRecordingMedia } from '@/server/interviews/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const denied = () => Response.json({ error: 'Запись недоступна' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
export async function GET(request: Request, context: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await context.params
  const recordId = Number(id)
  if (!Number.isSafeInteger(recordId) || recordId <= 0) return denied()
  try {
    const payload = await getPayload()
    const found = await payload.find({ collection: 'interview-recordings', where: { id: { equals: recordId } }, limit: 1, depth: 0, overrideAccess: true })
    const doc = found.docs[0]
    if (!doc || !validInterviewSource(doc, file, new URL(request.url).searchParams)) return denied()
    const ownerId = relationId(doc.owner)
    if (!ownerId) return denied()
    return await streamRecordingMedia(request, doc, ownerId)
  } catch { return denied() }
}
export const HEAD = GET
