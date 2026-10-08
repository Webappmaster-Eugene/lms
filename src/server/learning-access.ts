import { APIError, type Access, type Payload, type PayloadRequest } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import { recordLearningAccess, withLearningSpan } from '@/lib/learning-observability'
import { clearAuthoritativeLearningMode, getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import {
  buildLearningAccess, learningRelationId,
  type LearningAccessSnapshot, type LearningAccessUser, type LearningGrant, type LearningLessonMetadata,
} from '@/lib/learning-access'

const requestPolicies = new WeakMap<PayloadRequest, Map<number, Promise<LearningAccessSnapshot>>>()
const requestLessonPolicies = new WeakMap<PayloadRequest, Map<string, Promise<LearningAccessSnapshot>>>()
const requestUsers = new WeakMap<PayloadRequest, Map<number, Promise<LearningAccessUser | null>>>()

export class LearningAccessError extends APIError {
  constructor(status: 403 | 404 = 403) {
    super(status === 404 ? 'Урок не найден' : 'Доступ к учебному материалу не назначен', status)
  }
}

export function invalidateLearningAccess(req: PayloadRequest) {
  requestPolicies.delete(req)
  requestLessonPolicies.delete(req)
  requestUsers.delete(req)
  clearAuthoritativeLearningMode(req)
}

/** A partial producer DTO must not turn a missing mode into unrestricted access. */
async function resolveAccessUser(payload: Payload, user: LearningAccessUser | null | undefined, req?: Partial<PayloadRequest>): Promise<LearningAccessUser | null | undefined> {
  if (!user) return user
  const id = user.id
  const readUser = async (): Promise<LearningAccessUser | null> => {
    try {
      const actual = await getAuthoritativeLearningPolicy(payload, id, req)
      return { id, role: actual.role, learningAccessMode: actual.mode }
    } catch (error) {
      if (error instanceof APIError && error.status === 404) return null
      throw error
    }
  }
  if (!req) return readUser()
  const request = req as PayloadRequest
  let users = requestUsers.get(request)
  if (!users) { users = new Map(); requestUsers.set(request, users) }
  let promise = users.get(id)
  if (!promise) { promise = readUser(); users.set(id, promise) }
  return promise
}

async function loadLessonPolicy(payload: Payload, user: LearningAccessUser | null | undefined, lesson: LearningLessonMetadata, req?: Partial<PayloadRequest>): Promise<LearningAccessSnapshot> {
  user = await resolveAccessUser(payload, user, req)
  const empty = { courses: [], sections: [], roadmaps: [], nodes: [], lessons: [] }
  if (!user || user.role === 'admin') return buildLearningAccess(user, [], empty)
  const courseId = learningRelationId(lesson.course)
  if (courseId === null) return buildLearningAccess(user, [], empty)
  const courseResult = await payload.find({ collection: 'courses', where: { id: { equals: courseId } }, select: { roadmap: true, roadmapNode: true, isPublished: true }, depth: 0, limit: 1, overrideAccess: true, req })
  const course = courseResult.docs[0]
  if (!course) return buildLearningAccess(user, [], empty)
  const roadmapId = learningRelationId(course.roadmap)
  const sectionId = learningRelationId(lesson.section)
  const nodeId = learningRelationId(course.roadmapNode)
  const [grants, roadmaps, sections, nodes] = await Promise.all([
    collectAllPages(({ page, limit }) => payload.find({ collection: 'learning-access-grants', where: { user: { equals: user.id } }, select: { target: true, effect: true, startsAt: true, expiresAt: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'назначения учебного доступа' }),
    roadmapId === null ? Promise.resolve([]) : payload.find({ collection: 'roadmaps', where: { id: { equals: roadmapId } }, select: { isPublished: true }, depth: 0, limit: 1, overrideAccess: true, req }).then((result) => result.docs),
    sectionId === null ? Promise.resolve([]) : payload.find({ collection: 'sections', where: { id: { equals: sectionId } }, select: { course: true, isPublished: true }, depth: 0, limit: 1, overrideAccess: true, req }).then((result) => result.docs),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'roadmap-nodes', where: { or: [{ course: { equals: courseId } }, ...(nodeId === null ? [] : [{ id: { equals: nodeId } }])] }, select: { roadmap: true, course: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'темы конкретного курса' }),
  ])
  return buildLearningAccess(user, grants as LearningGrant[], { courses: [course], sections, roadmaps, nodes, lessons: [lesson] })
}

/** A Range request loads only this lesson's ancestors and this user's indexed grants. */
async function getLessonPolicy(payload: Payload, user: LearningAccessUser | null | undefined, lesson: LearningLessonMetadata, req?: Partial<PayloadRequest>): Promise<LearningAccessSnapshot> {
  const request = req as PayloadRequest | undefined
  const fullPolicy = request && user ? requestPolicies.get(request)?.get(user.id) : undefined
  if (fullPolicy) return fullPolicy
  if (!request || !user) return withLearningSpan('lesson', 'access', () => loadLessonPolicy(payload, user, lesson, req))
  let policies = requestLessonPolicies.get(request)
  if (!policies) {
    policies = new Map()
    requestLessonPolicies.set(request, policies)
  }
  const key = `${user.id}:${lesson.id}`
  let promise = policies.get(key)
  if (!promise) {
    promise = withLearningSpan('lesson', 'access', () => loadLessonPolicy(payload, user, lesson, req))
    policies.set(key, promise)
  }
  return promise
}

async function loadPolicy(payload: Payload, user: LearningAccessUser | null | undefined, req?: Partial<PayloadRequest>) {
  user = await resolveAccessUser(payload, user, req)
  if (!user || user.role === 'admin') return buildLearningAccess(user, [], { courses: [], sections: [], roadmaps: [], nodes: [], lessons: [] })
  const [grants, courses, sections, roadmaps, nodes] = await Promise.all([
    collectAllPages(({ page, limit }) => payload.find({ collection: 'learning-access-grants', where: { user: { equals: user.id } }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'назначения учебного доступа' }),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'courses', select: { roadmap: true, roadmapNode: true, isPublished: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'метаданные доступа курсов' }),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'sections', select: { course: true, isPublished: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'метаданные доступа секций' }),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'roadmaps', select: { isPublished: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'публикация роадмапов' }),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'roadmap-nodes', select: { roadmap: true, course: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'метаданные доступа тем' }),
  ])
  const lessonIds = grants.filter((grant) => grant.target.relationTo === 'lessons').map((grant) => learningRelationId(grant.target.value)).filter((id): id is number => id !== null)
  const lessons = lessonIds.length ? await collectAllPages(({ page, limit }) => payload.find({ collection: 'lessons', where: { id: { in: lessonIds } }, select: { course: true, section: true, isPublished: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req }), { label: 'явные исключения доступа уроков' }) : []
  return buildLearningAccess(user, grants as LearningGrant[], { courses, sections, roadmaps, nodes, lessons })
}

/** Cache is scoped to this Payload request, invalidated by entitlement writes. */
export async function getLearningAccess(payload: Payload, user: LearningAccessUser | null | undefined, req?: Partial<PayloadRequest>): Promise<LearningAccessSnapshot> {
  if (!req || !user) return withLearningSpan('lesson', 'access', () => loadPolicy(payload, user, req))
  const request = req as PayloadRequest
  let policies = requestPolicies.get(request)
  if (!policies) {
    policies = new Map()
    requestPolicies.set(request, policies)
  }
  let promise = policies.get(user.id)
  if (!promise) {
    promise = withLearningSpan('lesson', 'access', () => loadPolicy(payload, user, req))
    policies.set(user.id, promise)
  }
  return promise
}

export const lessonReadAccess: Access = async ({ req }) => {
  if (!req.user) return false
  const policy = await getLearningAccess(req.payload, req.user, req)
  return policy.admin ? true : policy.lessonWhere
}

export async function canAccessCourse(payload: Payload, user: LearningAccessUser | null | undefined, course: number | { id: number }, req?: Partial<PayloadRequest>): Promise<boolean> {
  const start = performance.now()
  const id = typeof course === 'number' ? course : course.id
  const policy = await getLearningAccess(payload, user, req)
  const allowed = policy.canAccessCourse(id)
  recordLearningAccess({ resource: 'course', resourceId: id, userId: user?.id, outcome: allowed ? 'allow' : 'deny', reason: allowed ? policy.admin ? 'admin' : policy.mode === 'all' ? 'unrestricted' : 'assigned' : policy.canBrowseCourse(id) ? 'unassigned' : 'unpublished', durationMs: performance.now() - start })
  return allowed
}

async function lessonMetadata(payload: Payload, lesson: number | LearningLessonMetadata, req?: Partial<PayloadRequest>): Promise<LearningLessonMetadata | null> {
  if (typeof lesson !== 'number') return lesson
  try {
    return await payload.findByID({ collection: 'lessons', id: lesson, depth: 0, select: { course: true, section: true, isPublished: true }, overrideAccess: true, req })
  } catch (error) {
    if (error instanceof APIError && error.status === 404) return null
    throw error
  }
}

export async function canAccessLesson(payload: Payload, user: LearningAccessUser | null | undefined, lesson: number | LearningLessonMetadata, req?: Partial<PayloadRequest>): Promise<boolean> {
  const start = performance.now()
  const id = typeof lesson === 'number' ? lesson : lesson.id
  if (!user) {
    recordLearningAccess({ resource: 'lesson', resourceId: id, outcome: 'deny', reason: 'unauthenticated', durationMs: performance.now() - start })
    return false
  }
  const metadata = await lessonMetadata(payload, lesson, req)
  const policy = metadata ? await getLessonPolicy(payload, user, metadata, req) : null
  const allowed = metadata !== null && policy !== null && policy.canAccessLessonMetadata(metadata)
  recordLearningAccess({ resource: 'lesson', resourceId: id, userId: user.id, outcome: allowed ? 'allow' : 'deny', reason: !metadata || !policy ? 'not_found' : !policy.canBrowseLessonMetadata(metadata) ? 'unpublished' : allowed ? policy.admin ? 'admin' : policy.mode === 'all' ? 'unrestricted' : 'assigned' : 'unassigned', durationMs: performance.now() - start })
  return allowed
}

export async function requireLessonAccess(payload: Payload, user: LearningAccessUser | null | undefined, lesson: number | LearningLessonMetadata, req?: Partial<PayloadRequest>): Promise<void> {
  const metadata = await lessonMetadata(payload, lesson, req)
  if (!(await canAccessLesson(payload, user, metadata ?? lesson, req))) {
    const policy = metadata ? await getLessonPolicy(payload, user, metadata, req) : null
    throw new LearningAccessError(!metadata || !policy?.canBrowseLessonMetadata(metadata) ? 404 : 403)
  }
}
