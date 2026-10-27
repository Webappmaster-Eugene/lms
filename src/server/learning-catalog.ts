import { APIError, type Payload, type PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { collectAllPages } from '@/lib/paginate'
import type { LearningPolicyMetadata } from '@/lib/learning-access'
import type { Course, RoadmapNode, RoadmapEdge } from '@/payload-types'
import { cachedContent, contentCacheKey } from '@/server/content-cache'
import { notBootcamp } from '@/lib/course-path'

export type LearningCatalog = Omit<LearningPolicyMetadata, 'lessons'>
export type RoadmapContent = {
  courses: Pick<Course, 'id' | 'title' | 'slug' | 'estimatedHours' | 'prerequisites' | 'roadmapNode' | 'order' | 'isPublished' | 'roadmap'>[]
  nodes: (Pick<RoadmapNode, 'id' | 'nodeId' | 'nodeType' | 'course' | 'label' | 'positionX' | 'positionY' | 'bullets' | 'icon' | 'description' | 'stage' | 'color' | 'order' | 'roadmap'> & { guides: number[]; bootcamps: number[] })[]
  edges: Pick<RoadmapEdge, 'id' | 'edgeId' | 'source' | 'target' | 'edgeType' | 'animated' | 'roadmap'>[]
}

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: Record<string, unknown>[] }> }
function executor(payload: Payload, transactionID?: string | number) {
  const adapter = payload.db as unknown as { drizzle?: Executor; sessions?: Record<string | number, { db: Executor } | undefined> }
  return (transactionID !== undefined && adapter.sessions?.[transactionID]?.db) || adapter.drizzle
}

async function catalogRevision(payload: Payload, roadmap = false): Promise<string | null> {
  const db = executor(payload)
  // Test/alternative adapters retain the uncached Payload path.
  if (!db) return null
  const extra = roadmap ? sql`union all select 'edge', id::text, xmin::text from roadmap_edges
    union all select 'bullet', id::text, xmin::text from roadmap_nodes_bullets
    union all select 'relation', id::text, xmin::text from courses_rels` : sql``
  // Состав темы (гайды, буткемпы) и публикация гайдов меняют и видимость тем, и саму карту.
  const result = await db.execute(sql`select md5(coalesce(string_agg(kind || ':' || id || ':' || version, ',' order by kind, id), '')) as revision from (
    select 'course' as kind, id::text as id, xmin::text as version from courses
    union all select 'section', id::text, xmin::text from sections
    union all select 'roadmap', id::text, xmin::text from roadmaps
    union all select 'node', id::text, xmin::text from roadmap_nodes
    union all select 'lesson', id::text, xmin::text from lessons
    union all select 'node-relation', id::text, xmin::text from roadmap_nodes_rels
    union all select 'guide', id::text, xmin::text from guides
    ${extra}
  ) versions`)
  const revision = result.rows[0]?.revision
  if (typeof revision !== 'string' || !/^[a-f0-9]{32}$/.test(revision)) throw new APIError('Не удалось проверить актуальность учебного каталога', 503)
  return revision
}

async function inconsistentLessonIds(payload: Payload, req: Partial<PayloadRequest>): Promise<number[]> {
  const transactionID = await req.transactionID
  const db = executor(payload, transactionID)
  if (!db) return []
  const result = await db.execute(sql`select l.id from lessons l left join sections s on s.id = l.section_id
    where l.is_published = true and l.section_id is not null and (s.id is null or s.course_id is distinct from l.course_id)
    order by l.id limit 10001`)
  if (result.rows.length > 10000) throw new APIError('Слишком много некорректных связей уроков и разделов', 503)
  return result.rows.map((row) => Number(row.id))
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const id = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0
const relation = (value: unknown) => value == null || id(value)
const boolean = (value: unknown) => value == null || typeof value === 'boolean'
const number = (value: unknown) => value == null || typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown) => value == null || typeof value === 'string'
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key))
const rows = (value: unknown, check: (row: Record<string, unknown>) => boolean) => Array.isArray(value) && value.every((row) => object(row) && id(row.id) && check(row))
const ids = (value: unknown) => Array.isArray(value) && value.every(id)
/** Значение hasMany-связи — id или объекты с id; всё прочее отбрасывается. */
const relationIds = (value: unknown): number[] => Array.isArray(value) ? value.flatMap((item) => {
  const raw = item !== null && typeof item === 'object' ? (item as { id?: unknown }).id : item
  return id(raw) ? [Number(raw)] : []
}) : []
export function validCatalog(value: unknown): value is LearningCatalog {
  return object(value) && keys(value, ['courses', 'sections', 'roadmaps', 'nodes', 'invalidLessonIds']) &&
    // assignedOnly обязателен: запись прежнего кода без него открыла бы закрытый курс всем.
    rows(value.courses, (row) => keys(row, ['id', 'roadmap', 'roadmapNode', 'isPublished', 'assignedOnly']) && relation(row.roadmap) && relation(row.roadmapNode) && boolean(row.isPublished) && typeof row.assignedOnly === 'boolean') &&
    rows(value.sections, (row) => keys(row, ['id', 'course', 'isPublished']) && relation(row.course) && boolean(row.isPublished)) &&
    rows(value.roadmaps, (row) => keys(row, ['id', 'isPublished']) && boolean(row.isPublished)) &&
    // Массивы обязательны: запись без них потеряла бы темы, открытые только гайдами и буткемпами.
    rows(value.nodes, (row) => keys(row, ['id', 'roadmap', 'course', 'guides', 'bootcamps']) && relation(row.roadmap) && relation(row.course) && ids(row.guides) && ids(row.bootcamps)) &&
    Array.isArray(value.invalidLessonIds) && value.invalidLessonIds.every(id)
}
function validRoadmap(value: unknown): value is RoadmapContent {
  return object(value) && keys(value, ['courses', 'nodes', 'edges']) &&
    rows(value.courses, (row) => keys(row, ['id', 'title', 'slug', 'estimatedHours', 'prerequisites', 'roadmapNode', 'order', 'isPublished', 'roadmap']) &&
      typeof row.title === 'string' && typeof row.slug === 'string' && number(row.estimatedHours) && number(row.order) && boolean(row.isPublished) && relation(row.roadmap) && relation(row.roadmapNode) &&
      (row.prerequisites == null || Array.isArray(row.prerequisites) && row.prerequisites.every(id))) &&
    rows(value.nodes, (row) => keys(row, ['id', 'nodeId', 'nodeType', 'course', 'guides', 'bootcamps', 'label', 'positionX', 'positionY', 'bullets', 'icon', 'description', 'stage', 'color', 'order', 'roadmap']) &&
      ids(row.guides) && ids(row.bootcamps) && typeof row.nodeId === 'string' && typeof row.label === 'string' && ['topic', 'category', 'subtopic'].includes(String(row.nodeType)) &&
      typeof row.positionX === 'number' && Number.isFinite(row.positionX) && typeof row.positionY === 'number' && Number.isFinite(row.positionY) &&
      relation(row.course) && relation(row.roadmap) && number(row.order) && text(row.icon) && text(row.description) &&
      (row.stage == null || ['start', 'base', 'stage1', 'stage2', 'practice', 'advanced', 'growth'].includes(String(row.stage))) &&
      (row.color == null || ['yellow', 'lime', 'white', 'gray', 'pink', 'blue', 'red'].includes(String(row.color))) &&
      (row.bullets == null || Array.isArray(row.bullets) && row.bullets.every((bullet) => object(bullet) && keys(bullet, ['id', 'text']) && typeof bullet.text === 'string' && text(bullet.id)))) &&
    rows(value.edges, (row) => keys(row, ['id', 'edgeId', 'source', 'target', 'edgeType', 'animated', 'roadmap']) &&
      typeof row.edgeId === 'string' && relation(row.source) && relation(row.target) && relation(row.roadmap) && boolean(row.animated) &&
      (row.edgeType == null || ['smoothstep', 'default', 'straight'].includes(String(row.edgeType))))
}

async function revisionCached<T>(payload: Payload, scope: string, req: Partial<PayloadRequest> | undefined, load: (req: Partial<PayloadRequest>) => Promise<T>, valid: (value: unknown) => value is T, roadmap = false): Promise<T> {
  const transactionID = await req?.transactionID
  // A shared entry may never include uncommitted writes, nor depend on a user's hooks.
  const internalReq: Partial<PayloadRequest> = { transactionID }
  if (transactionID !== undefined && transactionID !== null) return load(internalReq)
  const revision = await catalogRevision(payload, roadmap)
  if (!revision) return load(internalReq)
  return cachedContent(contentCacheKey(scope, revision), () => load(internalReq), valid, async () => (await catalogRevision(payload, roadmap)) === revision)
}

export async function getLearningCatalog(payload: Payload, req?: Partial<PayloadRequest>): Promise<LearningCatalog> {
  // v2: у тем появились гайды и буткемпы — прежний код и новый не должны читать записи друг друга.
  return revisionCached(payload, 'access-catalog-v2', req, async (internalReq) => {
    const [courses, sections, roadmaps, nodes, invalidLessonIds] = await Promise.all([
      collectAllPages(({ page, limit }) => payload.find({ collection: 'courses', select: { roadmap: true, roadmapNode: true, isPublished: true, assignedOnly: true, isBootcamp: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req: internalReq }), { label: 'метаданные доступа курсов' }),
      collectAllPages(({ page, limit }) => payload.find({ collection: 'sections', select: { course: true, isPublished: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req: internalReq }), { label: 'метаданные доступа секций' }),
      collectAllPages(({ page, limit }) => payload.find({ collection: 'roadmaps', select: { isPublished: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req: internalReq }), { label: 'публикация роадмапов' }),
      collectAllPages(({ page, limit }) => payload.find({ collection: 'roadmap-nodes', select: { roadmap: true, course: true, nodeType: true, guides: true, bootcamps: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req: internalReq }), { label: 'метаданные доступа тем' }),
      inconsistentLessonIds(payload, internalReq),
    ])
    // Категория — заголовок этапа, а не тема: гайды и буткемпы у неё не учитываются.
    const extras = nodes.map((node) => node.nodeType === 'category' ? { guides: [], bootcamps: [] } : { guides: relationIds(node.guides), bootcamps: relationIds(node.bootcamps) })
    const linkedGuides = [...new Set(extras.flatMap((item) => item.guides))]
    const publishedGuides = new Set(linkedGuides.length ? (await collectAllPages(({ page, limit }) => payload.find({ collection: 'guides', where: { and: [{ id: { in: linkedGuides } }, { isPublished: { equals: true } }] }, select: {}, depth: 0, sort: 'id', page, limit, overrideAccess: true, req: internalReq }), { label: 'опубликованные гайды тем' })).map((guide) => guide.id) : [])
    const bootcampIds = new Set(courses.filter((course) => course.isBootcamp === true).map((course) => course.id))
    return {
      courses: courses.map(({ id, roadmap, roadmapNode, isPublished, assignedOnly }) => ({ id, roadmap, roadmapNode, isPublished, assignedOnly: assignedOnly === true })),
      sections: sections.map(({ id, course, isPublished }) => ({ id, course, isPublished })),
      roadmaps: roadmaps.map(({ id, isPublished }) => ({ id, isPublished })),
      nodes: nodes.map(({ id, roadmap, course }, index) => ({
        id, roadmap, course,
        guides: extras[index].guides.filter((guide) => publishedGuides.has(guide)),
        bootcamps: extras[index].bootcamps.filter((bootcamp) => bootcampIds.has(bootcamp)),
      })),
      invalidLessonIds,
    }
  }, validCatalog)
}

/** Internal metadata only. Callers must apply fresh browsing policy and text protection. */
export async function getRoadmapContent(payload: Payload, roadmapId: number, req?: Partial<PayloadRequest>): Promise<RoadmapContent> {
  if (!Number.isSafeInteger(roadmapId) || roadmapId < 1) throw new APIError('Некорректный роадмап', 400)
  // Новое имя: запись прежнего кода (с буткемпом среди курсов, без гайдов и буткемпов тем) не должна читаться.
  return revisionCached(payload, `roadmap-content-${roadmapId}`, req, async (internalReq) => {
    const [courses, nodes, edges] = await Promise.all([
      collectAllPages(({ page, limit }) => payload.find({ collection: 'courses', where: { and: [{ roadmap: { equals: roadmapId }, isPublished: { equals: true } }, notBootcamp] }, select: { title: true, slug: true, estimatedHours: true, prerequisites: true, roadmapNode: true, order: true, isPublished: true, roadmap: true }, depth: 0, sort: ['order', 'id'], page, limit, overrideAccess: true, req: internalReq }), { label: 'курсы карты' }),
      collectAllPages(({ page, limit }) => payload.find({ collection: 'roadmap-nodes', where: { roadmap: { equals: roadmapId } }, select: { nodeId: true, nodeType: true, course: true, guides: true, bootcamps: true, label: true, positionX: true, positionY: true, bullets: true, icon: true, description: true, stage: true, color: true, order: true, roadmap: true }, depth: 0, sort: ['order', 'id'], page, limit, overrideAccess: true, req: internalReq }), { label: 'темы карты' }),
      collectAllPages(({ page, limit }) => payload.find({ collection: 'roadmap-edges', where: { roadmap: { equals: roadmapId } }, select: { edgeId: true, source: true, target: true, edgeType: true, animated: true, roadmap: true }, depth: 0, sort: 'id', page, limit, overrideAccess: true, req: internalReq }), { label: 'связи карты' }),
    ])
    return {
      courses: courses.map(({ id, title, slug, estimatedHours, prerequisites, roadmapNode, order, isPublished, roadmap }) => ({ id, title, slug, estimatedHours, prerequisites, roadmapNode, order, isPublished, roadmap })),
      nodes: nodes.map(({ id, nodeId, nodeType, course, guides, bootcamps, label, positionX, positionY, bullets, icon, description, stage, color, order, roadmap }) => ({ id, nodeId, nodeType, course, guides: relationIds(guides), bootcamps: relationIds(bootcamps), label, positionX, positionY, bullets, icon, description, stage, color, order, roadmap })),
      edges: edges.map(({ id, edgeId, source, target, edgeType, animated, roadmap }) => ({ id, edgeId, source, target, edgeType, animated, roadmap })),
    }
  }, validRoadmap, true)
}
