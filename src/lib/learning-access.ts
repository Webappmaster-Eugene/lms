import type { Where } from 'payload'

export const learningTargetCollections = ['roadmaps', 'roadmap-nodes', 'courses', 'sections', 'lessons'] as const
export type LearningTargetCollection = (typeof learningTargetCollections)[number]
export type LearningEffect = 'allow' | 'deny'
export type LearningAccessUser = { id: number; role?: string | null; learningAccessMode?: 'all' | 'assigned' | null }
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
  const canBrowseLessonMetadata = (lesson: LearningLessonMetadata) => {
    if (admin) return true
    if (!user || !lesson.isPublished) return false
    const courseId = learningRelationId(lesson.course)
    if (courseId === null || !courses.has(courseId)) return false
    const sectionId = learningRelationId(lesson.section)
    const section = sectionId === null ? null : sections.get(sectionId)
    if (lesson.section != null && (!section || learningRelationId(section.course) !== courseId)) return false
    return true
  }
  const canAccessLessonMetadata = (lesson: LearningLessonMetadata) => {
    if (admin) return true
    if (!canBrowseLessonMetadata(lesson)) return false
    const courseId = learningRelationId(lesson.course) ?? -1
    const sectionId = learningRelationId(lesson.section)
    const section = sectionId === null ? null : sections.get(sectionId)
    const decision = effect('lessons', lesson.id)
    if (decision) return decision === 'allow'
    return section ? sectionAllowed(section) : Boolean(courseEffects.get(courseId))
  }
  const arms: Where[] = []
  const accessible = new Set<number>()
  for (const course of courses.values()) {
    const allowedSections = (sectionsByCourse.get(course.id) ?? []).filter(sectionAllowed).map((section) => section.id)
    const allowedBase = Boolean(courseEffects.get(course.id))
    if (!allowedBase && allowedSections.length === 0) continue
    const sectionArms: Where[] = []
    if (allowedBase) sectionArms.push({ section: { exists: false } })
    if (allowedSections.length) sectionArms.push({ section: { in: allowedSections } })
    arms.push({ and: [{ course: { equals: course.id } }, { or: sectionArms }] })
    accessible.add(course.id)
  }
  const allowedLessons: number[] = []
  const deniedLessons: number[] = []
  for (const lesson of metadata.lessons) {
    if (effect('lessons', lesson.id) === undefined) continue
    if (canAccessLessonMetadata(lesson)) {
      allowedLessons.push(lesson.id)
      const courseId = learningRelationId(lesson.course)
      if (courseId !== null) accessible.add(courseId)
    } else deniedLessons.push(lesson.id)
  }
  if (allowedLessons.length) arms.push({ id: { in: allowedLessons } })
  const lessonWhere: Where = admin ? {} : {
    and: [
      { isPublished: { equals: true } },
      arms.length ? { or: arms } : { id: { equals: -1 } },
      ...(deniedLessons.length ? [{ id: { not_in: deniedLessons } }] : []),
    ],
  }
  return { admin, mode, lessonWhere, accessibleCourseIds: [...accessible], browseCourseIds: user ? [...courses.keys()] : [], canBrowseCourse: (id) => admin || (Boolean(user) && courses.has(id)), canBrowseLessonMetadata, canAccessCourse: (id) => admin || accessible.has(id), canAccessLessonMetadata }
}
