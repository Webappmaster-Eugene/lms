import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { randomBytes } from 'node:crypto'
import { withSpan, logger } from '@/lib/telemetry'
import { relationId } from '@/lib/relation-id'
import { skipHooksReq } from '@/lib/payload-req'
import { lockUserPoints } from '@/lib/user-lock'
import { isCourseCompleted, isRoadmapCompleted } from '@/lib/course-completion'

/** A bonus or a partial assignment never replaces the complete lesson programme. */
export async function ensureCertificate(req: PayloadRequest, userId: number, entityId: string, type: 'course' | 'roadmap'): Promise<void> {
  await lockUserPoints(req, userId)
  const entity = type === 'course'
    ? await req.payload.findByID({ req, collection: 'courses', id: entityId })
    : await req.payload.findByID({ req, collection: 'roadmaps', id: entityId })
  if (entity.isPublished !== true) return
  const complete = type === 'course'
    ? await isCourseCompleted(req, userId, entityId)
    : await isRoadmapCompleted(req, userId, entityId)
  if (!complete) return
  const existing = await req.payload.find({
    req, collection: 'certificates', depth: 0, limit: 1,
    where: { user: { equals: userId }, type: { equals: type }, relatedEntity: { equals: entityId } },
  })
  if (existing.totalDocs > 0) return
  const certificateNumber = `MC-${type === 'course' ? 'C' : 'R'}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`
  await req.payload.create({
    req: skipHooksReq(req), collection: 'certificates',
    data: { user: userId, type, title: entity.title, relatedEntity: entityId, issuedAt: new Date().toISOString(), certificateNumber },
  })
  logger.info('Certificate created', { 'user.id': userId, 'certificate.type': type })
}

export const createCertificate: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create' || req.context?.skipHooks) return doc
  const reason = doc.reason as string
  if (reason !== 'course_completed' && reason !== 'roadmap_completed') return doc
  const entityId = String(doc.relatedEntity ?? '')
  if (!entityId) return doc
  const userId = relationId(doc.user)
  await withSpan('hook.createCertificate', { 'user.id': userId, 'points.reason': reason, 'entity.id': entityId }, () =>
    ensureCertificate(req, userId, entityId, reason === 'course_completed' ? 'course' : 'roadmap'),
  )
  return doc
}
