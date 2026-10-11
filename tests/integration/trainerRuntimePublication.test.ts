import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import { POST } from '@/app/api/manage/trainer/runtime-publication/route'
import { TRAINER_CATALOG } from '@/data/trainer'
import { buildTaskData } from '@/data/trainer/seed-document'
import { publishTrainerRuntime } from '@/server/trainer/runtime-publication'
import type { TrainerTask, TrainerTopic, User } from '@/payload-types'
import { createAdmin, createStudent, createSumTask, createTopic, getTestPayload, login, rest, uid } from './helpers/payload'

const runtimeTopics = TRAINER_CATALOG.filter((topic) => topic.tasks.some((task) => task.checkMode === 'program' || task.checkMode === 'dom'))
const healthToken = 'local-runtime-publication-test-token-00000001'
type HealthMode = 'ok' | 'unavailable' | 'invalid' | 'large' | 'redirect'
let payload: Payload
let admin: User
let student: User
let adminToken: string
let studentToken: string
let server: Server
let healthUrl: string
let healthMode: HealthMode = 'ok'
let healthRequests = 0
const topics: TrainerTopic[] = []
const tasks: TrainerTask[] = []
let progressId: number
let outsider: TrainerTask
let outsiderTopic: TrainerTopic

function legacyChecks(task: TrainerTask) {
  return task.runtimeCases?.map((row) => ({
    ...row,
    checks: Array.isArray(row.checks) ? row.checks.map((value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value
      const check = value as Record<string, unknown>
      if (check.selector === 'main h1') return { ...check, selector: 'main > h1' }
      if (check.selector === 'li[data-course="react"]:text-is("React"), li[data-course="react"] :text-is("React")') return { selector: 'li[data-course="react"] > span', text: 'React' }
      if (check.selector === 'li[data-course="go"]:text-is("Go"), li[data-course="go"] :text-is("Go")') return { selector: 'li[data-course="go"] > span', text: 'Go' }
      return value
    }) : row.checks,
  }))
}

function editorialChecks(slug: string) {
  const base = slug === 'html-responsive-profile'
    ? { selector: 'main > h1', text: 'Команда', count: 1 }
    : { selector: 'main > h1', text: 'Каталог курсов' }
  const extraChecks = [
    { ...base, visible: false },
    { ...base, attribute: { name: 'data-editor', value: 'kept' } },
    { ...base, css: { display: 'grid' } },
    { ...base, count: 2 },
    { selector: 'main > h1', text: 'Команда' },
  ]
  if (slug === 'next-server-catalog') {
    for (const [course, text] of [['react', 'React'], ['go', 'Go']]) {
      const span = { selector: `li[data-course="${course}"] > span`, text }
      extraChecks.push(
        { ...span, visible: false },
        { ...span, attribute: { name: 'data-editor', value: 'kept' } },
        { ...span, css: { display: 'inline' } },
        { ...span, count: 1 },
      )
    }
  }
  return [{ selector: '.editor-only', count: 1 }, { selector: 'main > h1', text: 'Другой заголовок' }, ...extraChecks]
}

async function snapshot() {
  return {
    tasks: await Promise.all(tasks.map((task) => payload.findByID({ collection: 'trainer-tasks', id: task.id, depth: 0 }))),
    topics: await Promise.all(topics.map((topic) => payload.findByID({ collection: 'trainer-topics', id: topic.id, depth: 0 }))),
    progress: await payload.findByID({ collection: 'user-trainer-progress', id: progressId, depth: 0 }),
    outsider: await payload.findByID({ collection: 'trainer-tasks', id: outsider.id, depth: 0 }),
    outsiderTopic: await payload.findByID({ collection: 'trainer-topics', id: outsiderTopic.id, depth: 0 }),
  }
}

function request(token?: string, body: unknown = { dryRun: true }, origin = 'http://lms.test') {
  return new Request('http://lms.test/api/manage/trainer/runtime-publication', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}) }, body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  student = await createStudent(payload)
  adminToken = await login(payload, { ...admin, password: 'Test-Passw0rd!' })
  studentToken = await login(payload, { ...student, password: 'Test-Passw0rd!' })
  for (const source of runtimeTopics) {
    const slugs = source.tasks.filter((task) => task.checkMode === 'program' || task.checkMode === 'dom').map((task) => task.slug)
    const conflicts = await payload.find({ collection: 'trainer-tasks', where: { slug: { in: slugs } }, limit: 100, depth: 0 })
    if (conflicts.totalDocs) throw new Error('Canonical runtime fixture slugs already exist; refusing to modify another test’s documents')
    const topic = await createTopic(payload, { slug: uid('runtime-publication'), title: source.title, category: source.category, isPublished: false })
    topics.push(topic)
    for (const [order, seed] of source.tasks.entries()) {
      if (seed.checkMode !== 'program' && seed.checkMode !== 'dom') continue
      let task = await payload.create({ collection: 'trainer-tasks', data: { ...buildTaskData(seed, topic.id, order), isPublished: false } })
      tasks.push(task)
      if (task.slug === 'html-responsive-profile' || task.slug === 'next-server-catalog') {
        task = await payload.update({ collection: 'trainer-tasks', id: task.id, data: {
          runtimeCases: [...(legacyChecks(task) ?? []), { name: 'Редакторская проверка', hidden: true, checks: editorialChecks(task.slug), path: '/editor', viewport: { width: 901, height: 701 } }],
          descriptionMd: `${task.descriptionMd}\n\nПримечание редактора: сохранять.`,
        } })
        tasks[tasks.length - 1] = task
      }
    }
  }
  outsiderTopic = await createTopic(payload, { slug: uid('runtime-outside'), isPublished: false })
  outsider = await createSumTask(payload, { topic: outsiderTopic.id, slug: uid('cms-runtime'), checkMode: 'program', languages: ['python'], isPublished: false, runtimeCases: [{ name: 'Собственная CMS-проверка', input: 'kept', expected: 'kept', hidden: true }] })
  const progress = await payload.create({ collection: 'user-trainer-progress', data: { user: student.id, task: tasks[0].id, language: 'go', userCode: 'PRESERVE_STUDENT_CODE', attempts: 6, isCompleted: false } })
  progressId = progress.id
  server = createServer((incoming, response) => {
    healthRequests += 1
    expect(incoming.method).toBe('GET')
    expect(incoming.url).toBe('/health')
    if (incoming.headers.authorization !== `Bearer ${healthToken}`) { response.writeHead(401); response.end('{}'); return }
    if (healthMode === 'redirect') { response.writeHead(302, { location: '/health' }); response.end(); return }
    response.writeHead(healthMode === 'unavailable' ? 503 : 200, { 'Content-Type': 'application/json' })
    response.end(healthMode === 'invalid' ? '{"ok":"true"}' : healthMode === 'large' ? JSON.stringify({ ok: true, padding: 'x'.repeat(5000) }) : '{"ok":true}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local HTTP health fixture did not bind')
  healthUrl = `http://127.0.0.1:${address.port}`
})

beforeEach(async () => {
  vi.stubEnv('TRAINER_RUNTIME_URL', healthUrl)
  vi.stubEnv('TRAINER_RUNTIME_TOKEN', healthToken)
  healthMode = 'ok'
  healthRequests = 0
  for (const topic of topics) await payload.update({ collection: 'trainer-topics', id: topic.id, data: { isPublished: false } })
  for (const task of tasks) await payload.update({ collection: 'trainer-tasks', id: task.id, data: { isPublished: false, runtimeCases: task.runtimeCases } })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  // Every deletion uses IDs created in this file; conflicting canonical slugs are never adopted.
  if (progressId) await payload.delete({ collection: 'user-trainer-progress', id: progressId })
  for (const task of tasks) await payload.delete({ collection: 'trainer-tasks', id: task.id })
  if (outsider) await payload.delete({ collection: 'trainer-tasks', id: outsider.id })
  for (const topic of topics) await payload.delete({ collection: 'trainer-topics', id: topic.id })
  if (outsiderTopic) await payload.delete({ collection: 'trainer-topics', id: outsiderTopic.id })
  if (student) await payload.delete({ collection: 'users', id: student.id })
  if (admin) await payload.delete({ collection: 'users', id: admin.id })
})

describe('Публикация runtime: настоящий HTTP health, Payload REST и PostgreSQL', () => {
  it('закрывает endpoint для гостя, ученика, чужого Origin и произвольного тела до проверки runtime', async () => {
    expect((await POST(request())).status).toBe(401)
    expect((await POST(request(studentToken))).status).toBe(403)
    expect((await POST(request(adminToken, { dryRun: false }, 'https://foreign.test'))).status).toBe(403)
    for (const body of [{}, [], null, { dryRun: 'false' }, { dryRun: true, tasks: [] }, { dryRun: false, isPublished: true }]) {
      expect((await POST(request(adminToken, body))).status).toBe(400)
    }
    expect(healthRequests).toBe(0)
    await expect(publishTrainerRuntime(await createLocalReq({ user: student }, payload), false)).rejects.toMatchObject({ status: 403 })
  })

  it.each(['missing-url', 'short-token', 'invalid-url', 'wrong-token', 'unavailable', 'invalid', 'large', 'redirect'] as const)('не публикует ничего при отказе health: %s', async (failure) => {
    const before = await snapshot()
    if (failure === 'missing-url') vi.stubEnv('TRAINER_RUNTIME_URL', '')
    else if (failure === 'short-token') vi.stubEnv('TRAINER_RUNTIME_TOKEN', 'short')
    else if (failure === 'invalid-url') vi.stubEnv('TRAINER_RUNTIME_URL', 'file:///tmp/runtime')
    else if (failure === 'wrong-token') vi.stubEnv('TRAINER_RUNTIME_TOKEN', `${healthToken}wrong`)
    else healthMode = failure
    const response = await POST(request(adminToken, { dryRun: false }))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain(healthToken)
    expect(await snapshot()).toEqual(before)
    if (['missing-url', 'short-token', 'invalid-url'].includes(failure)) expect(healthRequests).toBe(0)
    else expect(healthRequests).toBe(1)
  })

  it('dryRun ничего не меняет и возвращает только состав изменения без приватных данных', async () => {
    const before = await snapshot()
    const response = await POST(request(adminToken))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const result = await response.json()
    expect(result).toMatchObject({ dryRun: true, inspected: 30, changed: 35 })
    expect(result.changes).toHaveLength(35)
    expect(result.changes.every((row: Record<string, unknown>) => Object.keys(row).sort().join(',') === 'collection,fields,id,slug')).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/PRESERVE_STUDENT_CODE|expected|solutionCode|input|checks/)
    expect(await snapshot()).toEqual(before)
  })

  it('публикует 30 задач и темы, сохраняя условия, решения, редакторские проверки, row ID и прогресс', async () => {
    const before = await snapshot()
    expect((await rest('GET', `/trainer-tasks/${tasks[0].id}`, { token: studentToken })).status).toBe(404)
    expect((await rest('GET', `/trainer-topics/${topics[0].id}`, { token: studentToken })).status).toBe(404)
    const response = await POST(request(adminToken, { dryRun: false }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ dryRun: false, inspected: 30, changed: 35 })
    const after = await snapshot()
    expect(after.progress).toEqual(before.progress)
    expect(after.outsider).toEqual(before.outsider)
    expect(after.outsiderTopic).toEqual(before.outsiderTopic)
    for (const [index, task] of after.tasks.entries()) {
      const previous = before.tasks[index]
      const { updatedAt: _updatedAt, isPublished: _published, runtimeCases: _cases, ...immutable } = task
      const { updatedAt: _priorUpdatedAt, isPublished: _priorPublished, runtimeCases: _priorCases, ...priorImmutable } = previous
      expect(immutable).toEqual(priorImmutable)
      expect(task.isPublished).toBe(true)
      expect(task.runtimeCases?.map((row) => row.id)).toEqual(previous.runtimeCases?.map((row) => row.id))
      if (!['html-responsive-profile', 'next-server-catalog'].includes(task.slug)) expect(task.runtimeCases).toEqual(previous.runtimeCases)
      else {
        expect(task.runtimeCases?.at(-1)).toEqual(previous.runtimeCases?.at(-1))
        const seed = runtimeTopics.flatMap((topic) => topic.tasks).find((row) => row.slug === task.slug)
        expect(task.runtimeCases?.slice(0, -1).map((row) => row.checks)).toEqual(seed?.runtimeCases?.map((row) => row.checks))
        for (const [caseIndex, row] of (task.runtimeCases ?? []).entries()) {
          const { checks: _checks, ...caseRest } = row
          const { checks: _previousChecks, ...previousRest } = previous.runtimeCases?.[caseIndex] ?? {}
          expect(caseRest).toEqual(previousRest)
        }
      }
      const read = await rest('GET', `/trainer-tasks/${task.id}?depth=0`, { token: studentToken })
      expect(read.status).toBe(200)
      expect(read.json.solutionCodeGo).toBeUndefined()
      expect(read.json.solutionCodePython).toBeUndefined()
      expect(read.json.solutionFiles).toBeUndefined()
      const hidden = (read.json.runtimeCases as Array<Record<string, unknown>>).filter((row) => row.hidden)
      for (const row of hidden) for (const field of ['input', 'expected', 'checks', 'viewport', 'path']) expect(row[field]).toBeUndefined()
    }
    for (const [index, topic] of after.topics.entries()) {
      const { updatedAt: _updatedAt, isPublished: _published, ...immutable } = topic
      const { updatedAt: _previousUpdatedAt, isPublished: _previousPublished, ...previousImmutable } = before.topics[index]
      expect(immutable).toEqual(previousImmutable)
      expect(topic.isPublished).toBe(true)
      expect((await rest('GET', `/trainer-topics/${topic.id}`, { token: studentToken })).status).toBe(200)
    }
    expect((await rest('GET', `/trainer-tasks/${outsider.id}`, { token: studentToken })).status).toBe(404)
    const again = await POST(request(adminToken))
    expect(await again.json()).toEqual({ dryRun: true, inspected: 30, changed: 0, changes: [] })
    const repeat = await POST(request(adminToken, { dryRun: false }))
    expect(await repeat.json()).toEqual({ dryRun: false, inspected: 30, changed: 0, changes: [] })
    expect(await snapshot()).toEqual(after)
  })

  it('откатывает темы и уже опубликованную первую задачу при ошибке второй записи', async () => {
    const before = await snapshot()
    const originalUpdate = payload.update.bind(payload)
    const spy = vi.spyOn(payload, 'update').mockImplementation(async (options) => {
      if (options.collection === 'trainer-tasks' && 'id' in options && options.id === tasks[1].id) throw new Error('Controlled runtime publication failure')
      return originalUpdate(options)
    })
    try { await expect(publishTrainerRuntime(await createLocalReq({ user: admin }, payload), false)).rejects.toThrow('Controlled runtime publication failure') }
    finally { spy.mockRestore() }
    expect(await snapshot()).toEqual(before)
    expect((await rest('GET', `/trainer-tasks/${tasks[0].id}`, { token: studentToken })).status).toBe(404)
  })

  it('требует все канонические slug до записи и не подменяет их неизвестной CMS-задачей', async () => {
    await payload.update({ collection: 'trainer-tasks', id: tasks[1].id, data: { slug: uid('missing-runtime') } })
    try {
      const before = await snapshot()
      for (const dryRun of [true, false]) {
        const response = await POST(request(adminToken, { dryRun }))
        expect(response.status).toBe(409)
        expect(await snapshot()).toEqual(before)
      }
    } finally { await payload.update({ collection: 'trainer-tasks', id: tasks[1].id, data: { slug: tasks[1].slug } }) }
  })

  it('не публикует задачу с изменённым редактором режимом проверки', async () => {
    await payload.update({ collection: 'trainer-tasks', id: tasks[0].id, data: { checkMode: 'unit' } })
    try {
      const before = await snapshot()
      const response = await POST(request(adminToken, { dryRun: false }))
      expect(response.status).toBe(409)
      expect(await snapshot()).toEqual(before)
    } finally { await payload.update({ collection: 'trainer-tasks', id: tasks[0].id, data: { checkMode: tasks[0].checkMode } }) }
  })
})
