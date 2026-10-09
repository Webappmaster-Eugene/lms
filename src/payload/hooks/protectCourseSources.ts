import type { CollectionAfterReadHook } from 'payload'

import type { Course, Roadmap, RoadmapNode } from '@/payload-types'
import { protectCourseSourceLinks, protectProgramText } from '@/lib/lesson-video-source'

export const protectCourseSources: CollectionAfterReadHook<Course> = ({ doc, req, overrideAccess }) => {
  if (overrideAccess || req.user?.role === 'admin') return doc
  return protectCourseSourceLinks(doc)
}

export const protectRoadmapSources: CollectionAfterReadHook<Roadmap> = ({ doc, req, overrideAccess }) => {
  if (overrideAccess || req.user?.role === 'admin') return doc
  return protectCourseSourceLinks(doc)
}

export const protectRoadmapNodeSources: CollectionAfterReadHook<RoadmapNode> = ({ doc, req, overrideAccess }) => {
  if (overrideAccess || req.user?.role === 'admin') return doc
  return {
    ...doc,
    description: doc.description ? protectProgramText(doc.description) : doc.description,
    bullets: doc.bullets?.map((bullet) => ({ ...bullet, text: protectProgramText(bullet.text) })),
  }
}
