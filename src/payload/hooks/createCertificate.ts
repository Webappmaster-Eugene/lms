import type { CollectionAfterChangeHook } from 'payload'
import { randomBytes } from 'node:crypto'
import { withSpan, logger } from '@/lib/telemetry'

/**
 * Hook: создаёт сертификат при завершении курса/роадмапа.
 */
export const createCertificate: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc
  if (req.context?.skipHooks) return doc

  const reason = doc.reason as string
  if (reason !== 'course_completed' && reason !== 'roadmap_completed') return doc

  const userId = String(typeof doc.user === 'object' ? doc.user.id : doc.user)
  const entityId = String(doc.relatedEntity ?? '')

  if (!entityId) return doc

  return withSpan('hook.createCertificate', { 'user.id': userId, 'points.reason': reason, 'entity.id': entityId }, async () => {
    try {
      let title = ''
      let type: 'course' | 'roadmap' = 'course'

      if (reason === 'course_completed') {
        const course = await req.payload.findByID({ collection: 'courses', id: entityId })
        title = course.title
        type = 'course'
      } else {
        const roadmap = await req.payload.findByID({ collection: 'roadmaps', id: entityId })
        title = roadmap.title
        type = 'roadmap'
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (req.payload as any).find({
        collection: 'certificates',
        where: {
          user: { equals: userId },
          type: { equals: type },
          relatedEntity: { equals: entityId },
        },
        limit: 1,
      })

      if (existing.totalDocs > 0) return doc

      const certNumber = `MC-${type === 'course' ? 'C' : 'R'}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (req.payload as any).create({
        collection: 'certificates',
        data: {
          user: userId,
          type,
          title,
          relatedEntity: entityId,
          issuedAt: new Date().toISOString(),
          certificateNumber: certNumber,
        },
        context: { skipHooks: true },
      })

      logger.info('Certificate created', { 'certificate.number': certNumber, 'user.id': userId, 'certificate.type': type })
    } catch (err) {
      logger.error('Failed to create certificate', err, { 'user.id': userId, 'entity.id': entityId })
    }

    return doc
  })
}
