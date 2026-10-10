import 'server-only'

import { APIError, type Payload, type TypedUser, type PayloadRequest } from 'payload'
import type { ProfileDTO } from '@/lib/profile'
import { learningRelationId } from '@/lib/learning-access'

export async function getProfileAvatar(payload: Payload, user: TypedUser, req?: PayloadRequest): Promise<ProfileDTO['avatar']> {
  const avatarId = learningRelationId(user.avatar)
  if (avatarId === null) return null
  try {
    const media = await payload.findByID({ collection: 'media', id: avatarId, user, req, overrideAccess: false, depth: 0 })
    return { id: media.id, url: media.url ?? null, alt: media.alt ?? null }
  } catch (error) {
    if (error instanceof APIError && [403, 404].includes(error.status)) return null
    throw error
  }
}

export async function getProfileDTO(payload: Payload, user: TypedUser, req?: PayloadRequest): Promise<ProfileDTO> {
  const profile = await payload.findByID({ collection: 'users', id: user.id, user, req, overrideAccess: false, depth: 0 })
  const avatar = await getProfileAvatar(payload, { ...user, ...profile }, req)
  return { id: profile.id, firstName: profile.firstName, lastName: profile.lastName, email: profile.email, telegram: profile.telegram ?? null, bio: profile.bio ?? null, avatar }
}
