import type { Where } from 'payload'

export const learningTargetCollections = ['roadmaps', 'roadmap-nodes', 'courses', 'sections', 'lessons', 'trainer-topics', 'trainer-tasks'] as const
export type LearningTargetCollection = (typeof learningTargetCollections)[number]
export type LearningEffect = 'allow' | 'deny'
export type LearningAccessUser = { id: number; role?: string | null; learningAccessMode?: 'all' | 'assigned' | null; learningCatalogVisibility?: 'catalog' | 'assigned' | null }
export type LearningGrant = {
  target: { relationTo: LearningTargetCollection; value: unknown }
  effect: LearningEffect
  startsAt?: string | null
  expiresAt?: string | null
}
export type LearningCourseMetadata = { id: number; roadmap: unknown; roadmapNode?: unknown; isPublished?: boolean | null }
export type LearningSectionMetadata = { id: number; course: unknown; isPublished?: boolean | null }
export type LearningLessonMetadata = { id: number; course: unknown; section?: unknown; isPublished?: boolean | null }
export type LearningNodeMetadata = { id: number; roadmap: unknown; course?: unknown }
export type LearningPolicyMetadata = {
  courses: LearningCourseMetadata[]
  sections: LearningSectionMetadata[]
  roadmaps: { id: number; isPublished?: boolean | null }[]
  nodes: LearningNodeMetadata[]
  lessons: LearningLessonMetadata[]
  /** SQL returns only inconsistent parent pairs, never the complete lesson catalog. */
  invalidLessonIds?: number[]
}

export function learningRelationId(value: unknown): number | null {
  const raw = value !== null && typeof value === 'object' ? (value as { id?: unknown }).id : value
  if (raw == null || raw === '' || typeof raw === 'boolean') return null
  const id = Number(raw)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function learningGrantIsActive(grant: LearningGrant, now: number): boolean {
  const start = grant.startsAt ? Date.parse(grant.startsAt) : null
  const end = grant.expiresAt ? Date.parse(grant.expiresAt) : null
  return (start === null || (Number.isFinite(start) && start <= now)) &&
    (end === null || (Number.isFinite(end) && end > now))
}

export type LearningAccessSnapshot = {
  admin: boolean
  mode: 'all' | 'assigned'
  catalogVisibility: 'catalog' | 'assigned'
  browseLessonWhere: Where
  browseRoadmapIds: number[]
  browseNodeIds: number[]
  browseSectionIds: number[]
  canBrowseRoadmap: (id: number) => boolean
  canBrowseNode: (id: number) => boolean
  canBrowseSection: (id: number) => boolean
  lessonWhere: Where
  accessibleCourseIds: number[]
  browseCourseIds: number[]
  canBrowseCourse: (id: number) => boolean
  canBrowseLessonMetadata: (lesson: LearningLessonMetadata) => boolean
  canAccessCourse: (id: number) => boolean
  canAccessLessonMetadata: (lesson: LearningLessonMetadata) => boolean
}

/** Builds a relational filter from parent metadata; lesson content is never fetched. */
export function buildLearningAccess(
  user: LearningAccessUser | null | undefined,
  grants: LearningGrant[],
  metadata: LearningPolicyMetadata,
  now = Date.now(),
): LearningAccessSnapshot {
  const admin = user?.role === 'admin'
  const mode = user?.learningAccessMode === 'all' ? 'all' : 'assigned'
  const catalogVisibility = user?.learningCatalogVisibility === 'assigned' ? 'assigned' : 'catalog'
  const invalidLessonIds = new Set(metadata.invalidLessonIds ?? [])
  const rules = new Map<string, LearningEffect>()
  for (const grant of grants) {
    const id = learningRelationId(grant.target?.value)
    if (id === null || !learningGrantIsActive(grant, now)) continue
    const key = `${grant.target.relationTo}:${id}`
    if (grant.effect === 'deny' || !rules.has(key)) rules.set(key, grant.effect)
  }
  const effect = (collection: LearningTargetCollection, id: number) => rules.get(`${collection}:${id}`)
  const roadmaps = new Set(metadata.roadmaps.filter((roadmap) => roadmap.isPublished).map((roadmap) => roadmap.id))
  const nodes = new Map(metadata.nodes.map((node) => [node.id, node]))
  const courses = new Map(metadata.courses.filter((course) => {
    const roadmap = learningRelationId(course.roadmap)
    if (!course.isPublished || roadmap === null || !roadmaps.has(roadmap)) return false
    if (course.roadmapNode != null) {
      const node = nodes.get(learningRelationId(course.roadmapNode) ?? -1)
      if (!node || learningRelationId(node.roadmap) !== roadmap) return false
    }
    return true
  }).map((course) => [course.id, course]))
  const sections = new Map(metadata.sections.filter((section) => section.isPublished && courses.has(learningRelationId(section.course) ?? -1)).map((section) => [section.id, section]))
  const sectionsByCourse = new Map<number, LearningSectionMetadata[]>()
  for (const section of sections.values()) {
    const courseId = learningRelationId(section.course)
    if (courseId === null) continue
    const grouped = sectionsByCourse.get(courseId) ?? []
    grouped.push(section)
    sectionsByCourse.set(courseId, grouped)
  }
  const primaryTopicEffects = new Map<number, LearningEffect[]>()
  for (const node of nodes.values()) {
    const courseId = learningRelationId(node.course)
    const course = courseId === null ? undefined : courses.get(courseId)
    const decision = effect('roadmap-nodes', node.id)
    if (!course || !decision || learningRelationId(course.roadmap) !== learningRelationId(node.roadmap)) continue
    const effects = primaryTopicEffects.get(course.id) ?? []
    effects.push(decision)
    primaryTopicEffects.set(course.id, effects)
  }
  const courseEffects = new Map<number, boolean>()
  for (const course of courses.values()) {
    let decision = effect('courses', course.id)
    if (!decision) {
      const topicEffects = [...(primaryTopicEffects.get(course.id) ?? [])]
      const nodeId = learningRelationId(course.roadmapNode)
      const nodeEffect = nodeId === null ? undefined : effect('roadmap-nodes', nodeId)
      if (nodeEffect) topicEffects.push(nodeEffect)
      decision = topicEffects.includes('deny') ? 'deny' : topicEffects.includes('allow') ? 'allow' : undefined
    }
    decision ??= effect('roadmaps', learningRelationId(course.roadmap) ?? -1)
    courseEffects.set(course.id, Boolean(user) && (decision ? decision === 'allow' : mode === 'all'))
  }
  const sectionAllowed = (section: LearningSectionMetadata) => {
    const decision = effect('sections', section.id)
    return decision ? decision === 'allow' : Boolean(courseEffects.get(learningRelationId(section.course) ?? -1))
  }
  const isPublishedLesson = (lesson: LearningLessonMetadata) => {
    if (admin) return true
    if (!user || !lesson.isPublished || invalidLessonIds.has(lesson.id)) return false
    const courseId = learningRelationId(lesson.course)
    if (courseId === null || !courses.has(courseId)) return false
    const sectionId = learningRelationId(lesson.section)
    const section = sectionId === null ? null : sections.get(sectionId)
    if (lesson.section != null && (!section || learningRelationId(section.course) !== courseId)) return false
    return true
  }
  const canAccessLessonMetadata = (lesson: LearningLessonMetadata) => {
    if (admin) return true
    if (!isPublishedLesson(lesson)) return false
    const courseId = learningRelationId(lesson.course) ?? -1
    const sectionId = learningRelationId(lesson.section)
    const section = sectionId === null ? null : sections.get(sectionId)
    const decision = effect('lessons', lesson.id)
    if (decision) return decision === 'allow'
    return section ? sectionAllowed(section) : Boolean(courseEffects.get(courseId))
  }
  const arms: Where[] = []
  const accessible = new Set<number>()
  const allowedCourseIds: number[] = []
  const allowedSectionIds: number[] = []
  for (const course of courses.values()) {
    const allowedSections = (sectionsByCourse.get(course.id) ?? []).filter(sectionAllowed).map((section) => section.id)
    const allowedBase = Boolean(courseEffects.get(course.id))
    if (!allowedBase && allowedSections.length === 0) continue
    if (allowedBase) allowedCourseIds.push(course.id)
    allowedSectionIds.push(...allowedSections)
    accessible.add(course.id)
  }
  // Constant-size predicate tree: Payload creates a new relation JOIN for each nested predicate.
  // One arm per course makes notes/progress/history query planning grow with the entire catalog.
  if (allowedCourseIds.length) arms.push({ and: [{ course: { in: allowedCourseIds } }, { section: { exists: false } }] })
  if (allowedSectionIds.length) arms.push({ and: [{ course: { in: [...courses.keys()] } }, { section: { in: allowedSectionIds } }] })
  const allowedLessons: number[] = []
  const deniedLessons = new Set(invalidLessonIds)
  for (const lesson of metadata.lessons) {
    if (!isPublishedLesson(lesson)) { deniedLessons.add(lesson.id); continue }
    if (effect('lessons', lesson.id) === undefined) continue
    if (canAccessLessonMetadata(lesson)) {
      allowedLessons.push(lesson.id)
      const courseId = learningRelationId(lesson.course)
      if (courseId !== null) accessible.add(courseId)
    } else deniedLessons.add(lesson.id)
  }
  if (allowedLessons.length) arms.push({ id: { in: allowedLessons } })
  const lessonWhere: Where = admin ? {} : {
    and: [
      { isPublished: { equals: true } },
      arms.length ? { or: arms } : { id: { equals: -1 } },
      ...(deniedLessons.size ? [{ id: { not_in: [...deniedLessons] } }] : []),
    ],
  }
  const browseCourses = new Set(user ? catalogVisibility === 'catalog' ? courses.keys() : accessible : [])
  const browseSections = new Set<number>()
  for (const section of sections.values()) {
    if (user && (catalogVisibility === 'catalog' || sectionAllowed(section))) browseSections.add(section.id)
  }
  for (const lesson of metadata.lessons) {
    if (canAccessLessonMetadata(lesson)) {
      const sectionId = learningRelationId(lesson.section)
      if (sectionId !== null) browseSections.add(sectionId)
    }
  }
  const browseRoadmaps = new Set<number>(user && catalogVisibility === 'catalog' ? roadmaps : [])
  const browseNodes = new Set<number>()
  for (const courseId of browseCourses) {
    const course = courses.get(courseId)
    const roadmapId = learningRelationId(course?.roadmap)
    const nodeId = learningRelationId(course?.roadmapNode)
    if (roadmapId !== null) browseRoadmaps.add(roadmapId)
    if (nodeId !== null) browseNodes.add(nodeId)
  }
  for (const roadmapId of roadmaps) if (user && effect('roadmaps', roadmapId) === 'allow') browseRoadmaps.add(roadmapId)
  for (const node of nodes.values()) {
    const roadmapId = learningRelationId(node.roadmap)
    if (!user || roadmapId === null || !roadmaps.has(roadmapId)) continue
    const courseId = learningRelationId(node.course)
    if (catalogVisibility === 'catalog' || (courseId !== null && browseCourses.has(courseId)) || effect('roadmap-nodes', node.id) === 'allow' || (courseId === null && effect('roadmaps', roadmapId) === 'allow' && effect('roadmap-nodes', node.id) !== 'deny')) {
      browseNodes.add(node.id)
      browseRoadmaps.add(roadmapId)
    }
  }
  const publishedWhere: Where = { and: [
    { isPublished: { equals: true } }, { course: { in: [...courses.keys()] } },
    { or: [{ section: { exists: false } }, { section: { in: [...sections.keys()] } }] },
    ...(invalidLessonIds.size ? [{ id: { not_in: [...invalidLessonIds] } }] : []),
  ] }
  return { admin, mode, catalogVisibility, lessonWhere,
    browseLessonWhere: admin ? {} : catalogVisibility === 'assigned' ? lessonWhere : publishedWhere,
    accessibleCourseIds: [...accessible], browseCourseIds: [...browseCourses],
    browseSectionIds: [...browseSections], browseRoadmapIds: [...browseRoadmaps], browseNodeIds: [...browseNodes],
    canBrowseCourse: id => admin || browseCourses.has(id),
    canBrowseSection: id => admin || browseSections.has(id),
    canBrowseRoadmap: id => admin || browseRoadmaps.has(id),
    canBrowseNode: id => admin || browseNodes.has(id),
    canBrowseLessonMetadata: lesson => isPublishedLesson(lesson) && (catalogVisibility === 'catalog' || canAccessLessonMetadata(lesson)),
    canAccessCourse: id => admin || accessible.has(id), canAccessLessonMetadata }

}
