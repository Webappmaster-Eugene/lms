import { APIError, Forbidden, type CollectionBeforeChangeHook } from 'payload'

import { learningRelationId } from '@/lib/learning-access'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** Publishing an avatar is allowed only for the student's own raster upload. */
export const validateStudentAvatar: CollectionBeforeChangeHook = async ({ req, data, originalDoc, operation }) => {
  if (!req.user || data.avatar === undefined) return data
  if ((await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role === 'admin') return data
  if (operation !== 'update' || originalDoc?.id !== req.user.id) throw new Forbidden(req.t)
  if (data.avatar === null) return data
  const id = learningRelationId(data.avatar)
  if (id !== null && id === learningRelationId(originalDoc.avatar)) return data
  if (id === null) throw new Forbidden(req.t)
  let media
  try {
    media = await req.payload.findByID({ collection: 'media', id, req, depth: 0, overrideAccess: true, select: { uploadedBy: true, mimeType: true, filesize: true } })
  } catch (error) {
    if (error instanceof APIError && error.status === 404) throw new Forbidden(req.t)
    throw error
  }
  if (learningRelationId(media.uploadedBy) !== req.user.id || !AVATAR_MIME_TYPES.includes(media.mimeType ?? '') || typeof media.filesize !== 'number' || !Number.isSafeInteger(media.filesize) || media.filesize <= 0 || media.filesize > 2097152) {
    throw new Forbidden(req.t)
  }
  return data
}
