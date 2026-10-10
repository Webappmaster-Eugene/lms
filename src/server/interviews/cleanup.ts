import 'server-only'
import type { Payload } from 'payload'
import { relationId } from '@/lib/relation-id'
import { interviewTransaction } from '@/server/interviews/service'
import { removePrivateFile } from '@/server/interviews/disk'

/** Interrupted preparation can end before the browser receives its reserved ID. */
export async function cleanupInterviewUploads(payload: Payload): Promise<number> {
  if (!process.env.YANDEX_DISK_TOKEN) return 0
  const before = Date.now() - 24 * 60 * 60 * 1000
  const candidates = await payload.find({ collection: 'interview-recordings', where: { and: [{ category: { equals: 'personal' } }, { status: { equals: 'uploading' } }, { createdAt: { less_than: new Date(before).toISOString() } }] }, sort: 'createdAt', depth: 0, limit: 5, overrideAccess: true })
  let removed = 0
  for (const candidate of candidates.docs) {
    const owner = relationId(candidate.owner)
    if (!owner) continue
    try {
      const deleted = await interviewTransaction(payload, owner, async (req) => {
        const found = await payload.find({ collection: 'interview-recordings', where: { id: { equals: candidate.id } }, limit: 1, depth: 0, overrideAccess: true, req })
        const doc = found.docs[0]
        if (!doc || doc.category !== 'personal' || relationId(doc.owner) !== owner || doc.status !== 'uploading' || Date.parse(doc.createdAt) >= before || (doc.uploadLeaseUntil && Date.parse(doc.uploadLeaseUntil) > Date.now())) return false
        if (doc.diskPath) await removePrivateFile(doc.diskPath)
        await payload.delete({ collection: 'interview-recordings', id: doc.id, req, overrideAccess: true })
        return true
      })
      if (deleted) removed++
    } catch { /* Retain the reserved row until storage becomes available. */ }
  }
  return removed
}
