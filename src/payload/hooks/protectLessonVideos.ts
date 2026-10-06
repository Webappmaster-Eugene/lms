import type { CollectionAfterReadHook } from 'payload'

import type { Lesson } from '@/payload-types'
import { protectLessonVideoSources } from '@/lib/lesson-video-source'

export const protectLessonVideos: CollectionAfterReadHook<Lesson> = ({ doc, req, overrideAccess }) => {
  // overrideAccess принадлежит серверному Local API; REST не принимает его от ученика.
  if (overrideAccess || req.user?.role === 'admin') return doc
  return protectLessonVideoSources(doc)
}
