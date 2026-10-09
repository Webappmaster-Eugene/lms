import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, getPayload, initTransaction, killTransaction, type Payload, type PayloadRequest, type Where } from 'payload'
import config from '@payload-config'

import { AssignmentInputError, assignmentId, storedAssignmentTarget, validateAssignmentInput, type AssignmentInput, type AssignmentRule, type AssignmentSnapshot } from '@/components/learning-access/contracts'
import { buildLearningAccess, learningGrantIsActive, learningRelationId, learningTargetCollections, type LearningTargetCollection } from '@/lib/learning-access'
import { buildTrainerAccess } from '@/lib/trainer-access'
import { collectAllPages } from '@/lib/paginate'
import { lockLearningAccess } from '@/payload/hooks/learningAccessLock'

const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
const pageSize = 25
const titles = (collection: LearningTargetCollection) => collection === 'roadmap-nodes' ? 'label' : 'title'

async function authenticate(request: Request) {
  const payload = await getPayload({ config })
  const headers = new Headers(request.headers)
  const authorization = headers.get('Authorization')
  if (authorization !== null) {
    if (!/^(?:JWT|Bearer) \S+$/.test(authorization)) throw new AssignmentInputError('Требуется авторизация', 401)
    headers.delete('Cookie')
  }
  const { user } = await payload.auth({ headers })
  if (!user) throw new AssignmentInputError('Требуется авторизация', 401)
  if (user.role !== 'admin') throw new AssignmentInputError('Назначать обучение может только администратор', 403)
  return { payload, user, authorization }
}

function assertSameOrigin(request: Request, authorization: string | null) {
  if (authorization !== null) return
  const url = new URL(request.url)
  const origins = new Set([url.origin])
  if (process.env.NEXT_PUBLIC_SERVER_URL) origins.add(new URL(process.env.NEXT_PUBLIC_SERVER_URL).origin)
  const host = request.headers.get('Host')
  const forwarded = request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim()
  const protocol = forwarded === 'https' || forwarded === 'http' ? `${forwarded}:` : url.protocol
  if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) origins.add(new URL(`${protocol}//${host}`).origin)
  const site = request.headers.get('Sec-Fetch-Site')
  if (!origins.has(request.headers.get('Origin') ?? '') || site === 'cross-site' || site === 'same-site') throw new AssignmentInputError('Сохранение доступно только со страницы платформы', 403)
}

function queryId(raw: string | null): number {
  return assignmentId(raw && /^\d+$/.test(raw) ? Number(raw) : undefined)
}

function queryPage(raw: string | null): number {
  const page = raw === null ? 1 : Number(raw)
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) throw new AssignmentInputError('Неверная страница списка')
  return page
}

function revision(userId: number, mode: 'all' | 'assigned', catalogVisibility: 'catalog' | 'assigned', trainerMode: 'all' | 'assigned' | 'disabled', updatedAt: string, rules: AssignmentRule[]) {
  const stable = rules.map(({ id, target, effect, startsAt, expiresAt, note }) => ({ id, target, effect, startsAt, expiresAt, note })).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  return createHash('sha256').update(JSON.stringify({ userId, mode, catalogVisibility, trainerMode, updatedAt, rules: stable })).digest('hex')
}

async function snapshot(payload: Payload, userId: number, req: PayloadRequest): Promise<AssignmentSnapshot> {
  const student = await payload.findByID({ collection: 'users', id: userId, depth: 0, select: { firstName: true, lastName: true, role: true, learningAccessMode: true, learningCatalogVisibility: true, trainerAccessMode: true, updatedAt: true }, overrideAccess: false, req })
  if (student.role !== 'student') throw new AssignmentInputError('Назначения доступны для аккаунтов учеников', 400)
  const grants = await collectAllPages(({ page, limit }) => payload.find({ collection: 'learning-access-grants', where: { user: { equals: userId } }, page, limit, sort: 'id', depth: 0, overrideAccess: false, req }), { label: 'Назначения ученика' })
  const rules: AssignmentRule[] = grants.map((grant) => ({ id: grant.id, target: storedAssignmentTarget(grant.target, grant.id), effect: grant.effect, startsAt: grant.startsAt ?? null, expiresAt: grant.expiresAt ?? null, note: grant.note ?? '' }))
  const mode = student.learningAccessMode === 'all' ? 'all' : 'assigned'
  const catalogVisibility = student.learningCatalogVisibility === 'assigned' ? 'assigned' : 'catalog'
  const trainerMode = student.trainerAccessMode === 'assigned' || student.trainerAccessMode === 'disabled' ? student.trainerAccessMode : 'all'
  return { userId, mode, catalogVisibility, trainerMode, revision: revision(userId, mode, catalogVisibility, trainerMode, student.updatedAt, rules), rules, student: { id: student.id, title: `${student.firstName} ${student.lastName}` } }
}

async function ruleTitles(payload: Payload, rules: AssignmentRule[], req: PayloadRequest) {
  const labels = new Map<string, string>()
  await Promise.all(learningTargetCollections.map(async (collection) => {
    const ids = rules.filter((rule) => rule.target.relationTo === collection).map((rule) => rule.target.value)
    if (!ids.length) return
    const result = await payload.find({ collection, where: { id: { in: ids } }, limit: ids.length, depth: 0, select: collection === 'roadmap-nodes' ? { label: true } : { title: true }, overrideAccess: false, req })
    for (const doc of result.docs) labels.set(`${collection}:${doc.id}`, 'label' in doc ? doc.label : doc.title)
  }))
  return rules.map((rule) => ({ ...rule, title: labels.get(`${rule.target.relationTo}:${rule.target.value}`) ?? 'Материал удалён' }))
}

async function validateTargets(payload: Payload, input: AssignmentInput, req: PayloadRequest) {
  for (const collection of learningTargetCollections) {
    const ids = input.rules.filter((rule) => rule.target.relationTo === collection).map((rule) => rule.target.value)
    if (!ids.length) continue
    const result = await payload.find({ collection, where: { id: { in: ids } }, limit: ids.length, depth: 0, select: collection === 'roadmap-nodes' ? { label: true } : { title: true }, overrideAccess: false, req })
    if (result.totalDocs !== ids.length) throw new AssignmentInputError('Один из материалов удалён. Обновите назначения и выберите его заново', 404)
  }
}

async function readInput(request: Request) {
  if (!request.body) throw new AssignmentInputError('Назначения не переданы')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 512_000) {
        await reader.cancel()
        throw new AssignmentInputError('Назначения слишком большие', 413)
      }
      chunks.push(next.value)
    }
  } finally { reader.releaseLock() }
  const combined = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder().decode(combined)) as unknown }
  catch { throw new AssignmentInputError('Не удалось прочитать назначения') }
}

async function preview(payload: Payload, input: AssignmentInput, req: PayloadRequest, page: number, trainerPage: number) {
  const [courses, sections, roadmaps, nodes, trainerTopics, trainerTasks] = await Promise.all([
    collectAllPages(({ page, limit }) => payload.find({ collection: 'courses', page, limit, sort: 'id', depth: 0, select: { title: true, roadmap: true, roadmapNode: true, isPublished: true }, overrideAccess: false, req })),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'sections', page, limit, sort: 'id', depth: 0, select: { course: true, isPublished: true }, overrideAccess: false, req })),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'roadmaps', page, limit, sort: 'id', depth: 0, select: { isPublished: true }, overrideAccess: false, req })),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'roadmap-nodes', page, limit, sort: 'id', depth: 0, select: { roadmap: true, course: true }, overrideAccess: false, req })),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'trainer-topics', page, limit, sort: 'id', depth: 0, select: { title: true, isPublished: true }, overrideAccess: false, req })),
    collectAllPages(({ page, limit }) => payload.find({ collection: 'trainer-tasks', page, limit, sort: 'id', depth: 0, select: { title: true, topic: true, isPublished: true }, overrideAccess: false, req })),
  ])
  const lessonIds = input.rules.filter((rule) => rule.target.relationTo === 'lessons').map((rule) => rule.target.value)
  const lessons = lessonIds.length ? await collectAllPages(({ page, limit }) => payload.find({ collection: 'lessons', where: { id: { in: lessonIds } }, page, limit, sort: 'id', depth: 0, select: { course: true, section: true, isPublished: true }, overrideAccess: false, req })) : []
  const user = { id: input.userId, role: 'student', learningAccessMode: input.mode, learningCatalogVisibility: input.catalogVisibility, trainerAccessMode: input.trainerMode }
  const metadata = { courses, sections, roadmaps, nodes, lessons }
  const now = Date.now()
  const policy = buildLearningAccess(user, input.rules, metadata, now)
  const parentRules = input.rules.filter((rule) => rule.target.relationTo !== 'sections' && rule.target.relationTo !== 'lessons')
  const base = buildLearningAccess(user, parentRules, metadata, now)
  const sectionCourses = new Map(sections.filter((section) => section.isPublished).map((section) => [section.id, learningRelationId(section.course)]))
  const lessonCourses = new Map(lessons.filter((lesson) => lesson.isPublished).map((lesson) => [lesson.id, learningRelationId(lesson.course)]))
  const deniedDescendants = new Set<number>()
  for (const rule of input.rules) {
    if (rule.effect !== 'deny' || !learningGrantIsActive(rule, now)) continue
    const courseId = rule.target.relationTo === 'sections' ? sectionCourses.get(rule.target.value) : rule.target.relationTo === 'lessons' ? lessonCourses.get(rule.target.value) : undefined
    if (courseId != null) deniedDescendants.add(courseId)
  }
  const liveRoadmaps = new Set(roadmaps.filter((roadmap) => roadmap.isPublished).map((roadmap) => roadmap.id))
  const visible = courses.filter((course) => course.isPublished && liveRoadmaps.has(learningRelationId(course.roadmap) ?? -1))
  const trainerPolicy = buildTrainerAccess(user, input.rules, { topics: trainerTopics, tasks: trainerTasks }, now)
  const liveTopics = new Set(trainerTopics.filter((topic) => topic.isPublished).map((topic) => topic.id))
  const publishedTasks = trainerTasks.filter((task) => task.isPublished && liveTopics.has(learningRelationId(task.topic) ?? -1))
  const docs = visible.slice((page - 1) * pageSize, page * pageSize).map((course) => {
    return { id: course.id, title: course.title, visible: policy.canBrowseCourse(course.id), access: !policy.canAccessCourse(course.id) ? 'closed' : base.canAccessCourse(course.id) && !deniedDescendants.has(course.id) ? 'full' : 'partial' }
  })
  return { courses: docs, page, hasNextPage: page * pageSize < visible.length, availableCount: visible.filter((course) => policy.canAccessCourse(course.id)).length, totalCount: visible.length, hiddenCount: visible.filter((course) => !policy.canBrowseCourse(course.id)).length, trainer: { tasks: publishedTasks.slice((trainerPage - 1) * pageSize, trainerPage * pageSize).map((task) => ({ id: task.id, title: task.title, visible: trainerPolicy.canBrowseTask(task.id), access: trainerPolicy.canAccessTask(task.id) ? 'open' : 'closed' })), page: trainerPage, hasNextPage: trainerPage * pageSize < publishedTasks.length, availableCount: trainerPolicy.accessibleTaskIds.length, totalCount: publishedTasks.length } }
}

function failure(error: unknown) {
  if (error instanceof AssignmentInputError) return response({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status)
  const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500
  return response({ error: status === 404 ? 'Ученик или материал не найден' : status < 500 ? 'Проверьте поля назначений и повторите сохранение' : 'Не удалось загрузить или сохранить назначения. Повторите попытку' }, status)
}

export async function GET(request: Request) {
  try {
    const { payload, user } = await authenticate(request)
    const req = await createLocalReq({ user, req: { headers: request.headers } }, payload)
    const url = new URL(request.url)
    const kind = url.searchParams.get('kind')
    const page = queryPage(url.searchParams.get('page'))
    const search = (url.searchParams.get('search') ?? '').trim()
    if (search.length > 100) throw new AssignmentInputError('Поисковый запрос слишком длинный')
    if (kind === 'students') {
      const where: Where = { and: [{ role: { equals: 'student' } }, ...(search ? [{ or: [{ firstName: { contains: search } }, { lastName: { contains: search } }, { email: { contains: search } }] }] : [])] }
      const result = await payload.find({ collection: 'users', where, page, limit: pageSize, sort: 'id', depth: 0, select: { firstName: true, lastName: true, email: true }, overrideAccess: false, req })
      return response({ docs: result.docs.map((student) => ({ id: student.id, title: `${student.firstName} ${student.lastName} (${student.email})` })), page, hasNextPage: result.hasNextPage })
    }
    if (kind === 'targets') {
      const rawType = url.searchParams.get('type')
      if (!rawType || !learningTargetCollections.includes(rawType as LearningTargetCollection)) throw new AssignmentInputError('Выберите тип учебного материала')
      const collection = rawType as LearningTargetCollection
      const clauses: Where[] = search ? [{ [titles(collection)]: { contains: search } }] : []
      const parent = url.searchParams.get('parent')
      if (parent) {
        const field = collection === 'courses' || collection === 'roadmap-nodes' ? 'roadmap' : collection === 'sections' || collection === 'lessons' ? 'course' : collection === 'trainer-tasks' ? 'topic' : undefined
        if (!field) throw new AssignmentInputError('У выбранного типа нет родительского материала')
        clauses.push({ [field]: { equals: queryId(parent) } })
      }
      const result = await payload.find({ collection, where: clauses.length ? { and: clauses } : {}, page, limit: pageSize, sort: 'id', depth: 0, select: collection === 'roadmap-nodes' ? { label: true, roadmap: true } : { title: true, isPublished: true }, overrideAccess: false, req })
      return response({ docs: result.docs.map((doc) => ({ id: doc.id, title: 'label' in doc ? doc.label : doc.title, published: 'isPublished' in doc ? doc.isPublished : undefined })), page, hasNextPage: result.hasNextPage })
    }
    const current = await snapshot(payload, queryId(url.searchParams.get('user')), req)
    return response({ ...current, rules: await ruleTitles(payload, current.rules, req) })
  } catch (error) { return failure(error) }
}

async function mutate(request: Request, save: boolean) {
  let req: PayloadRequest | undefined
  let payload: Payload | undefined
  try {
    const auth = await authenticate(request)
    payload = auth.payload
    assertSameOrigin(request, auth.authorization)
    if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new AssignmentInputError('Для сохранения требуется JSON')
    const size = request.headers.get('Content-Length')
    if (size && Number(size) > 512_000) throw new AssignmentInputError('Назначения слишком большие', 413)
    const input = validateAssignmentInput(await readInput(request))
    req = await createLocalReq({ user: auth.user, req: { headers: request.headers } }, payload)
    if (save) {
      if (!await initTransaction(req)) throw new Error('Assignment save requires a transaction')
      const transactionID = await req.transactionID
      const adapter = payload.db as unknown as { sessions: Record<string | number, { db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } } | undefined> }
      const db = transactionID === undefined ? undefined : adapter.sessions[transactionID]?.db
      if (!db) throw new Error('Assignment transaction not available')
      await lockLearningAccess(req, input.userId)
      await db.execute(sql`select id from users where id = ${input.userId} for update`)
    }
    const current = await snapshot(payload, input.userId, req)
    if (current.revision !== input.revision) throw new AssignmentInputError('Другой администратор уже изменил назначения. Обновите данные перед сохранением', 409)
    input.catalogVisibility ??= current.catalogVisibility
    input.trainerMode ??= current.trainerMode
    const currentById = new Map(current.rules.map((rule) => [rule.id, rule]))
    for (const rule of input.rules) {
      if (rule.id !== undefined && !currentById.has(rule.id)) throw new AssignmentInputError('Назначение не принадлежит выбранному ученику', 403)
      const original = currentById.get(rule.id)
      if (original && (original.target.relationTo !== rule.target.relationTo || original.target.value !== rule.target.value)) throw new AssignmentInputError('Чтобы сменить материал, удалите назначение и добавьте новое')
    }
    await validateTargets(payload, input, req)
    if (!save) {
      const params = new URL(request.url).searchParams
      return response(await preview(payload, input, req, queryPage(params.get('page')), queryPage(params.get('trainerPage'))))
    }
    const keep = new Set(input.rules.map((rule) => rule.id).filter((id): id is number => id !== undefined))
    for (const rule of current.rules) if (rule.id !== undefined && !keep.has(rule.id)) await payload.delete({ collection: 'learning-access-grants', id: rule.id, overrideAccess: false, req })
    for (const rule of input.rules) {
      const original = currentById.get(rule.id)
      const data = { user: input.userId, target: rule.target, effect: rule.effect, startsAt: rule.startsAt, expiresAt: rule.expiresAt, note: rule.note }
      if (original && rule.id !== undefined) {
        if (original.effect !== rule.effect || original.startsAt !== rule.startsAt || original.expiresAt !== rule.expiresAt || original.note !== rule.note) await payload.update({ collection: 'learning-access-grants', id: rule.id, data, overrideAccess: false, req })
      } else await payload.create({ collection: 'learning-access-grants', data: { ...data, ruleKey: `${input.userId}:${rule.target.relationTo}:${rule.target.value}` }, overrideAccess: false, req })
    }
    if (current.mode !== input.mode || current.catalogVisibility !== input.catalogVisibility || current.trainerMode !== input.trainerMode) await payload.update({ collection: 'users', id: input.userId, data: { learningAccessMode: input.mode, learningCatalogVisibility: input.catalogVisibility, trainerAccessMode: input.trainerMode }, overrideAccess: false, req })
    const next = await snapshot(payload, input.userId, req)
    const rules = await ruleTitles(payload, next.rules, req)
    await commitTransaction(req)
    return response({ ...next, rules })
  } catch (error) {
    if (req && save) await killTransaction(req)
    if (!(error instanceof AssignmentInputError) && !(error instanceof Error && 'status' in error && typeof error.status === 'number' && error.status < 500)) payload?.logger.error({ msg: 'Learning assignment management failed', error: error instanceof Error ? error.name : 'UnknownError' })
    return failure(error)
  }
}

export async function PUT(request: Request) { return mutate(request, true) }
export async function POST(request: Request) { return mutate(request, false) }
