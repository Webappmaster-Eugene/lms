import type { CollectionAfterReadHook } from 'payload'

import { getLearningAccess } from '@/server/learning-access'

import type { Course, Roadmap, RoadmapNode, Section } from '@/payload-types'
import { protectCourseSourceLinks, protectProgramText } from '@/lib/lesson-video-source'

export const protectCourseSources: CollectionAfterReadHook<Course> = async ({ doc, req, overrideAccess }) => {
  if (overrideAccess || req.user?.role === 'admin') return doc
  const result = protectCourseSourceLinks(doc)
  const scope = await getLearningAccess(req.payload, req.user, req)
  if (!scope.admin && scope.catalogVisibility === 'assigned') {
    if (Object.hasOwn(result, 'description') && !scope.canReadCourseDescription(doc.id)) result.description = null
    if ('estimatedHours' in result) result.estimatedHours = null
    if ('prerequisites' in result) result.prerequisites = []
  }
  return result
}

export const protectRoadmapSources: CollectionAfterReadHook<Roadmap> = async ({ doc, req, overrideAccess }) => {
  if (overrideAccess || req.user?.role === 'admin') return doc
  const result = protectCourseSourceLinks(doc)
  const scope = await getLearningAccess(req.payload, req.user, req)
  if (!scope.admin && scope.catalogVisibility === 'assigned') {
    if (Object.hasOwn(result, 'description') && !scope.canReadRoadmapDescription(doc.id)) result.description = null
    if ('estimatedHours' in result) result.estimatedHours = null
    if ('prerequisites' in result) result.prerequisites = []
  }
  return result
}

export const protectRoadmapNodeSources: CollectionAfterReadHook<RoadmapNode> = async ({ doc, req, overrideAccess }) => {
  if (overrideAccess || req.user?.role === 'admin') return doc
  const scope = await getLearningAccess(req.payload, req.user, req)
  if (!scope.canReadNodeDescription(doc.id)) return { ...doc, ...(Object.hasOwn(doc, 'description') ? { description: null } : {}), ...(Object.hasOwn(doc, 'bullets') ? { bullets: [] } : {}) }
  return {
    ...doc,
    description: doc.description ? protectProgramText(doc.description) : doc.description,
    bullets: doc.bullets?.map((bullet) => ({ ...bullet, text: protectProgramText(bullet.text) })),
  }
}

export const protectSectionMetadata: CollectionAfterReadHook<Section> = async ({ doc, req, overrideAccess }) => {
  if (overrideAccess || !req.user || !Object.hasOwn(doc, 'description')) return doc
  const scope = await getLearningAccess(req.payload, req.user, req)
  return scope.canReadSectionDescription(doc.id) ? doc : { ...doc, description: null }
}
