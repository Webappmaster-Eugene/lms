import type { CollectionAfterReadHook } from 'payload'

import type { Course, Roadmap } from '@/payload-types'
import { protectCourseSourceLinks } from '@/lib/lesson-video-source'

export const protectCourseSources: CollectionAfterReadHook<Course> = ({ doc, req, overrideAccess }) => {
  if (overrideAccess || req.user?.role === 'admin') return doc
  return protectCourseSourceLinks(doc)
}

export const protectRoadmapSources: CollectionAfterReadHook<Roadmap> = ({ doc, req, overrideAccess }) => {
  if (overrideAccess || req.user?.role === 'admin') return doc
  return protectCourseSourceLinks(doc)
}
