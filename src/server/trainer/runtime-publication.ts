import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import { APIError, commitTransaction, initTransaction, killTransaction, type PayloadRequest } from 'payload'
import { TRAINER_CATALOG } from '@/data/trainer'
import { collectAllPages } from '@/lib/paginate'
import { relationId } from '@/lib/relation-id'
import type { TrainerTask } from '@/payload-types'

const runtimeSeeds = TRAINER_CATALOG.flatMap((topic) => topic.tasks).filter((task) => task.checkMode === 'program' || task.checkMode === 'dom')
const runtimeSlugs = runtimeSeeds.map((task) => task.slug)
const runtimeModes = new Map(runtimeSeeds.map((task) => [task.slug, task.checkMode]))

type Adapter = { sessions: Record<string | number, { db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } } | undefined> }
type PublicationChange = { collection: 'trainer-tasks' | 'trainer-topics'; id: number; slug: string; fields: string[] }

/** A healthy gateway must accept the application's actual credential before anything becomes visible. */
async function requireRuntimeHealth(): Promise<void> {
  const endpoint = process.env.TRAINER_RUNTIME_URL
  const token = process.env.TRAINER_RUNTIME_TOKEN
  const unavailable = () => new APIError('Сервер запуска не настроен или недоступен. Задачи остаются черновиками.', 503)
  if (!endpoint || !token || token.length < 32) throw unavailable()
  let url: URL
  try {
    url = new URL('/health', endpoint)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw unavailable()
  } catch { throw unavailable() }
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000) })
    if (!response.ok) { await response.body?.cancel(); throw unavailable() }
    const reader = response.body?.getReader()
    if (!reader) throw unavailable()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 4096) { await reader.cancel(); throw unavailable() }
      chunks.push(chunk.value)
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!body || typeof body !== 'object' || !('ok' in body) || body.ok !== true) throw unavailable()
  } catch { throw unavailable() }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasExactlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function loosenKnownSelector(slug: string, check: unknown): unknown {
  if (!record(check)) return check
  if (slug === 'html-responsive-profile' && check.selector === 'main > h1' && check.text === 'Команда' && check.count === 1 && hasExactlyKeys(check, ['selector', 'text', 'count'])) return { ...check, selector: 'main h1' }
  if (slug !== 'next-server-catalog') return check
  // A matching selector alone does not identify a seed check: editors may add distinct expectations.
  if (!hasExactlyKeys(check, ['selector', 'text'])) return check
  if (check.selector === 'main > h1' && check.text === 'Каталог курсов') return { ...check, selector: 'main h1' }
  if (check.selector === 'li[data-course="react"] > span' && check.text === 'React') {
    const { text: _text, ...rest } = check
    return { ...rest, selector: 'li[data-course="react"]:text-is("React"), li[data-course="react"] :text-is("React")', visible: true }
  }
  if (check.selector === 'li[data-course="go"] > span' && check.text === 'Go') {
    const { text: _text, ...rest } = check
    return { ...rest, selector: 'li[data-course="go"]:text-is("Go"), li[data-course="go"] :text-is("Go")', visible: true }
  }
  return check
}

/** Keep saved rows and editorial checks; only remove four incidental markup requirements. */
function selectorPatch(task: TrainerTask): Partial<TrainerTask> {
  if (!task.runtimeCases?.length || !['html-responsive-profile', 'next-server-catalog'].includes(task.slug)) return {}
  let changed = false
  const runtimeCases = task.runtimeCases.map((row) => {
    if (!Array.isArray(row.checks)) return row
    const checks = row.checks.map((check) => {
      const next = loosenKnownSelector(task.slug, check)
      if (next !== check) changed = true
      return next
    })
    return { ...row, checks }
  })
  return changed ? { runtimeCases } : {}
}

/** Publish only the existing canonical runtime catalogue; never reseed or replace solutions/progress. */
export async function publishTrainerRuntime(req: PayloadRequest, dryRun: boolean) {
  if (req.user?.role !== 'admin') throw new APIError('Требуются права администратора', 403)
  await requireRuntimeHealth()
  const payload = req.payload
  if (!dryRun && !(await initTransaction(req))) throw new APIError('Публикация требует транзакции', 500)
  try {
    const tasks = await collectAllPages(({ page, limit }) => payload.find({ collection: 'trainer-tasks', where: { slug: { in: runtimeSlugs } }, page, limit, depth: 0, sort: 'id', overrideAccess: false, req }), { label: 'задачи для публикации runtime' })
    const found = new Set(tasks.map((task) => task.slug))
    const missing = runtimeSlugs.filter((slug) => !found.has(slug))
    if (missing.length) throw new APIError(`Не найдены задачи каталога: ${missing.join(', ')}. Изменения отменены.`, 409)
    const topicIds = [...new Set(tasks.map((task) => relationId(task.topic)))].sort((a, b) => a - b)
    const transactionID = await req.transactionID
    const db = transactionID === undefined ? undefined : (payload.db as unknown as Adapter).sessions[transactionID]?.db
    if (!dryRun && !db) throw new APIError('Транзакция недоступна', 500)
    // Lock in a deterministic order before rereading, so concurrent publication/editorial edits merge.
    if (db) {
      for (const id of topicIds) await db.execute(sql`select id from trainer_topics where id = ${id} for update`)
      for (const task of tasks) await db.execute(sql`select id from trainer_tasks where id = ${task.id} for update`)
    }
    const currentTasks = dryRun ? tasks : await collectAllPages(({ page, limit }) => payload.find({ collection: 'trainer-tasks', where: { id: { in: tasks.map((task) => task.id) } }, page, limit, depth: 0, sort: 'id', overrideAccess: false, req }), { label: 'заблокированные задачи runtime' })
    if (currentTasks.length !== tasks.length || currentTasks.some((task) => !found.has(task.slug) || task.checkMode !== runtimeModes.get(task.slug) || !topicIds.includes(relationId(task.topic)))) {
      throw new APIError('Состав задач изменён редактором. Проверьте каталог перед публикацией.', 409)
    }
    const topics = await collectAllPages(({ page, limit }) => payload.find({ collection: 'trainer-topics', where: { id: { in: topicIds } }, page, limit, depth: 0, sort: 'id', overrideAccess: false, req }), { label: 'темы runtime для публикации' })
    if (topics.length !== topicIds.length) throw new APIError('Не найдены родительские темы задач. Изменения отменены.', 409)
    const changes: PublicationChange[] = []
    for (const topic of topics) {
      if (topic.isPublished) continue
      if (!dryRun) await payload.update({ collection: 'trainer-topics', id: topic.id, data: { isPublished: true }, overrideAccess: false, req })
      changes.push({ collection: 'trainer-topics', id: topic.id, slug: topic.slug, fields: ['isPublished'] })
    }
    for (const task of currentTasks) {
      const patch: Partial<TrainerTask> = { ...selectorPatch(task), ...(!task.isPublished ? { isPublished: true } : {}) }
      const fields = Object.keys(patch)
      if (!fields.length) continue
      if (!dryRun) await payload.update({ collection: 'trainer-tasks', id: task.id, data: patch, overrideAccess: false, req })
      changes.push({ collection: 'trainer-tasks', id: task.id, slug: task.slug, fields })
    }
    if (!dryRun) await commitTransaction(req)
    return { dryRun, inspected: tasks.length, changed: changes.length, changes }
  } catch (error) {
    if (!dryRun) await killTransaction(req)
    throw error
  }
}
