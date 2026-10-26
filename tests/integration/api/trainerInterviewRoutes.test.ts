import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, type Payload } from 'payload'

import type { TrainerTask, TrainerTopic } from '@/payload-types'
import { POST as createPOST } from '@/app/api/trainer/interview/route'
import { GET as roomGET, POST as roomPOST, PATCH as roomPATCH } from '@/app/api/trainer/interview/[token]/route'
import { POST as compilePOST } from '@/app/api/trainer/interview/[token]/compile/route'
import { POST as runPOST } from '@/app/api/trainer/interview/[token]/run/route'
import { POST as taskCompilePOST } from '@/app/api/trainer/compile/route'
import { interviewStarter } from '@/lib/trainer/interview'
import { getTrainerTaskPage } from '@/server/trainer/task-page'
import { createAdmin, createStudent, createSumTask, createTopic, getTestPayload, login, type TestUser } from '../helpers/payload'

/**
 * Маршруты комнаты собеседования через сами route handlers Next: проводка
 * токена из params, разбор тела, CSRF по Origin/Host для cookie-сессии и
 * отказ runtime. Плюс серверная загрузка страницы задачи тренажёра.
 */

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }))
vi.mock('next/headers', () => ({ headers: async () => requestHeaders.current }))

const BASE = 'http://lms.test/api/trainer/interview'
let payload: Payload
let admin: TestUser
let owner: TestUser
let ownerToken: string
let guestToken: string

type Call = { token?: string; cookie?: string; origin?: string; host?: string; proto?: string; site?: string; url?: string; body?: unknown; raw?: BodyInit; type?: string | null }
function request(method: string, path: string, { token, cookie, origin, host, proto, site, url, body, raw, type }: Call = {}): Request {
  const headers = new Headers()
  if (token) headers.set('Authorization', `JWT ${token}`)
  if (cookie) headers.set('Cookie', `payload-token=${cookie}`)
  if (origin) headers.set('Origin', origin)
  if (host) headers.set('Host', host)
  if (proto) headers.set('X-Forwarded-Proto', proto)
  if (site) headers.set('Sec-Fetch-Site', site)
  const payloadBody = raw ?? (body === undefined ? undefined : JSON.stringify(body))
  if (payloadBody !== undefined && type !== null) headers.set('Content-Type', type ?? 'application/json')
  return new Request(`${url ?? BASE}${path}`, { method, headers, body: payloadBody })
}
const ctx = (token: string) => ({ params: Promise.resolve({ token }) })
async function json(response: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}
async function createRoom(auth = ownerToken, body: unknown = {}): Promise<string> {
  const created = await json(await createPOST(request('POST', '', { token: auth, body })))
  expect(created.status).toBe(201)
  return (created.body.room as { token: string }).token
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  owner = await createStudent(payload)
  ownerToken = await login(payload, owner)
  guestToken = await login(payload, await createStudent(payload))
})
afterEach(() => vi.unstubAllEnvs())
afterAll(() => { requestHeaders.current = new Headers() })

describe('комната собеседования: проводка маршрутов', () => {
  it('создание, чтение, вход, сохранение и компиляция идут по токену из адреса', async () => {
    const room = await createRoom()
    const read = await json(await roomGET(request('GET', `/${room}`, { token: ownerToken }), ctx(room)))
    expect(read).toMatchObject({ status: 200, body: { room: { token: room, version: 1 } } })
    expect((await roomPOST(request('POST', `/${room}`, { token: guestToken, body: {} }), ctx(room))).status).toBe(200)
    const saved = await json(await roomPATCH(request('PATCH', `/${room}`, { token: guestToken, body: { version: 1, code: 'const answer = 42', language: 'ts' } }), ctx(room)))
    expect(saved).toMatchObject({ status: 200, body: { room: { code: 'const answer = 42', language: 'ts', version: 2 } } })
    const compiled = await json(await compilePOST(request('POST', `/${room}/compile`, { token: guestToken, body: { code: 'const answer: number = 42' } }), ctx(room)))
    expect(compiled).toMatchObject({ status: 200, body: { js: expect.stringContaining('const answer = 42'), diagnostics: [] } })
    for (const response of [read, saved, compiled]) expect(response.body).not.toHaveProperty('error')
  })

  it.each(['not-a-room', '00000000-0000-0000-0000-000000000000', 'aa573b25-ab70-4b9f-aec4-9dd78d38b109'])('неизвестный или кривой токен %s — 404 для всех действий', async (room) => {
    expect((await roomGET(request('GET', `/${room}`, { token: ownerToken }), ctx(room))).status).toBe(404)
    expect((await roomPOST(request('POST', `/${room}`, { token: ownerToken, body: {} }), ctx(room))).status).toBe(404)
    expect((await roomPATCH(request('PATCH', `/${room}`, { token: ownerToken, body: { version: 1, code: '', language: 'js' } }), ctx(room))).status).toBe(404)
    expect((await compilePOST(request('POST', `/${room}/compile`, { token: ownerToken, body: { code: 'x' } }), ctx(room))).status).toBe(404)
  })

  it('ответы не кэшируются', async () => {
    const room = await createRoom()
    for (const response of [
      await roomGET(request('GET', `/${room}`, { token: ownerToken }), ctx(room)),
      await roomGET(request('GET', `/${room}`), ctx(room)),
      await createPOST(request('POST', '', { token: ownerToken, raw: '{' })),
    ]) expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('комната собеседования: разбор тела запроса', () => {
  it.each([
    ['не JSON по Content-Type', { raw: '{}', type: 'text/plain' }, 400, 'Требуется Content-Type: application/json'],
    ['без Content-Type', { raw: '{}', type: null }, 400, 'Требуется Content-Type: application/json'],
    ['битый JSON', { raw: '{"language":' }, 400, 'Невалидный JSON'],
    ['JSON-строка вместо объекта', { raw: '"js"' }, 400, 'Невалидные данные'],
    ['больше 450 000 байт при допустимой длине текста', { raw: 'я'.repeat(230_000) }, 413, 'Слишком большой запрос'],
  ])('%s — %s', async (_, call, status, error) => {
    const before = await payload.count({ collection: 'interview-rooms', where: { owner: { equals: owner.id } } })
    expect(await json(await createPOST(request('POST', '', { token: ownerToken, ...call })))).toEqual({ status, body: { error } })
    expect((await payload.count({ collection: 'interview-rooms', where: { owner: { equals: owner.id } } })).totalDocs).toBe(before.totalDocs)
  })

  it('пустое тело — 400', async () => {
    const response = await createPOST(new Request(BASE, { method: 'POST', headers: { Authorization: `JWT ${ownerToken}`, 'Content-Type': 'application/json' } }))
    expect(await json(response)).toEqual({ status: 400, body: { error: 'Пустой запрос' } })
  })

  it('версия комнаты обязательна и положительна, неверная версия не меняет код', async () => {
    const room = await createRoom()
    for (const version of [undefined, 0, -1, 1.5, '1']) {
      expect((await roomPATCH(request('PATCH', `/${room}`, { token: ownerToken, body: { version, code: 'x', language: 'js' } }), ctx(room))).status).toBe(400)
    }
    expect((await json(await roomGET(request('GET', `/${room}`, { token: ownerToken }), ctx(room)))).body.room).toMatchObject({ version: 1, code: interviewStarter('js') })
  })

  it('компиляция только для TypeScript и с ограничением длины кода', async () => {
    const room = await createRoom()
    expect(await json(await compilePOST(request('POST', `/${room}/compile`, { token: ownerToken, body: { code: 'x', language: 'js' } }), ctx(room)))).toEqual({ status: 400, body: { error: 'Компиляция доступна только для TypeScript' } })
    expect((await compilePOST(request('POST', `/${room}/compile`, { token: ownerToken, body: { code: 'x'.repeat(100_001) } }), ctx(room))).status).toBe(400)
    expect((await compilePOST(request('POST', `/${room}/compile`, { token: ownerToken, body: { code: 42 } }), ctx(room))).status).toBe(400)
  })
})

describe('комната собеседования: CSRF для cookie-сессии', () => {
  it('cookie с Origin платформы — можно, без Origin или с межсайтовой меткой — отказ без записи', async () => {
    expect((await createPOST(request('POST', '', { cookie: ownerToken, origin: 'http://lms.test', body: {} }))).status).toBe(201)
    const before = await payload.count({ collection: 'interview-rooms', where: { owner: { equals: owner.id } } })
    // Payload принимает cookie без Origin при Sec-Fetch-Site: same-origin, но запись комнаты требует явный Origin.
    expect(await json(await createPOST(request('POST', '', { cookie: ownerToken, site: 'same-origin', body: {} })))).toEqual({ status: 403, body: { error: 'Откройте комнату на платформе' } })
    expect(await json(await createPOST(request('POST', '', { cookie: ownerToken, body: {} })))).toEqual({ status: 401, body: { error: 'Требуется авторизация' } })
    expect((await createPOST(request('POST', '', { cookie: ownerToken, origin: 'http://lms.test', site: 'cross-site', body: {} }))).status).toBe(403)
    expect((await createPOST(request('POST', '', { cookie: ownerToken, origin: 'http://lms.test', site: 'same-site', body: {} }))).status).toBe(403)
    expect((await payload.count({ collection: 'interview-rooms', where: { owner: { equals: owner.id } } })).totalDocs).toBe(before.totalDocs)
  })

  it('чтение комнаты по cookie не требует Origin: GET не меняет состояние', async () => {
    const room = await createRoom()
    expect((await roomGET(request('GET', `/${room}`, { cookie: ownerToken, site: 'same-origin' }), ctx(room))).status).toBe(200)
  })

  it('за прокси origin платформы восстанавливается из Host, но только для корректного имени и своей схемы', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', '')
    const internal = 'http://10.0.0.5:3000/api/trainer/interview'
    expect((await createPOST(request('POST', '', { url: internal, cookie: ownerToken, origin: 'http://lms.test', host: 'lms.test', body: {} }))).status).toBe(201)
    expect((await createPOST(request('POST', '', { url: internal, cookie: ownerToken, origin: 'http://lms.test', host: 'lms.test/evil', body: {} }))).status).toBe(403)
    // По X-Forwarded-Proto: https платформа — https://lms.test, а http-Origin уже чужой.
    expect((await createPOST(request('POST', '', { url: internal, cookie: ownerToken, origin: 'http://lms.test', host: 'lms.test', proto: 'https', body: {} }))).status).toBe(403)
    expect((await createPOST(request('POST', '', { url: internal, cookie: ownerToken, origin: 'http://evil.test', host: 'evil.test', body: {} }))).status).toBe(401)
  })

  it('явный, но кривой заголовок Authorization — 401 без отката на cookie', async () => {
    const response = await createPOST(new Request(BASE, { method: 'POST', headers: { Authorization: 'Basic abc', Cookie: `payload-token=${ownerToken}`, Origin: 'http://lms.test', 'Content-Type': 'application/json' }, body: '{}' }))
    expect(await json(response)).toEqual({ status: 401, body: { error: 'Неверная авторизация' } })
  })
})

describe('комната собеседования: runtime', () => {
  it('Go без настроенного runtime — 503 с понятным текстом, прогресс не пишется', async () => {
    vi.stubEnv('TRAINER_RUNTIME_URL', '')
    const room = await createRoom(ownerToken, { language: 'go' })
    const before = await payload.count({ collection: 'user-trainer-progress' })
    const response = await json(await runPOST(request('POST', `/${room}/run`, { token: ownerToken, body: { language: 'go', code: interviewStarter('go') } }), ctx(room)))
    expect(response).toEqual({ status: 503, body: { error: 'Runtime Go, Python и frontend не настроен. Обратитесь к администратору' } })
    expect((await payload.count({ collection: 'user-trainer-progress' })).totalDocs).toBe(before.totalDocs)
  })
})

describe('POST /api/trainer/compile: несуществующая задача', () => {
  it('админу (доступ ко всем задачам) неопубликованная или удалённая задача — 404', async () => {
    const adminToken = await login(payload, admin)
    const draft = await createSumTask(payload, { isPublished: false })
    for (const taskId of [draft.id, 987654321]) {
      const response = await taskCompilePOST(new Request('http://lms.test/api/trainer/compile', { method: 'POST', headers: { Authorization: `JWT ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, code: 'const x = 1' }) }))
      expect(await json(response)).toEqual({ status: 404, body: { error: 'Задача не найдена' } })
    }
  })
})

describe('getTrainerTaskPage — страница задачи', () => {
  let topic: TrainerTopic
  let task: TrainerTask
  const topicId = (value: TrainerTask['topic']) => typeof value === 'object' ? value.id : value
  const as = async (user: TestUser | null) => {
    requestHeaders.current = new Headers(user ? { Authorization: `JWT ${await login(payload, user)}` } : {})
  }

  beforeAll(async () => {
    topic = await createTopic(payload)
    task = await createSumTask(payload, { topic: topic.id, solutionCode: 'PRIVATE_SOLUTION' })
  })

  it('ученик с доступом получает тему, задачу и свою область доступа', async () => {
    const learner = await createStudent(payload)
    await as(learner)
    const page = await getTrainerTaskPage(topic.slug ?? '', task.slug ?? '')
    expect(page).toMatchObject({ topic: { id: topic.id }, task: { id: task.id }, user: { id: learner.id } })
    expect(page?.scope.canAccessTask(task.id)).toBe(true)
  })

  it('аноним, чужая тема в адресе и неопубликованные тема или задача — null', async () => {
    const draftTask = await createSumTask(payload, { topic: topic.id, isPublished: false })
    const hiddenTopic = await createTopic(payload, { isPublished: false })
    const hiddenTask = await createSumTask(payload, { topic: hiddenTopic.id })
    const otherTopic = await createTopic(payload)
    await as(null)
    expect(await getTrainerTaskPage(topic.slug ?? '', task.slug ?? '')).toBeNull()
    await as(await createStudent(payload))
    expect(await getTrainerTaskPage(otherTopic.slug ?? '', task.slug ?? '')).toBeNull()
    expect(await getTrainerTaskPage(topic.slug ?? '', draftTask.slug ?? '')).toBeNull()
    expect(await getTrainerTaskPage(hiddenTopic.slug ?? '', hiddenTask.slug ?? '')).toBeNull()
    expect(topicId(hiddenTask.topic)).toBe(hiddenTopic.id)
  })

  it('назначенный доступ: без правил задача закрыта, после назначения темы — открыта', async () => {
    const learner = await createStudent(payload, { trainerAccessMode: 'assigned', learningCatalogVisibility: 'assigned' })
    await as(learner)
    expect(await getTrainerTaskPage(topic.slug ?? '', task.slug ?? '')).toBeNull()
    await payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: learner.id, target: { relationTo: 'trainer-topics', value: topic.id }, effect: 'allow', ruleKey: 'server-generated' } })
    expect((await getTrainerTaskPage(topic.slug ?? '', task.slug ?? ''))?.task.id).toBe(task.id)
  })

  it('ученик с выключенным тренажёром задачу не получает, администратор — получает без назначений', async () => {
    await as(await createStudent(payload, { trainerAccessMode: 'disabled' }))
    expect(await getTrainerTaskPage(topic.slug ?? '', task.slug ?? '')).toBeNull()
    await as(admin)
    expect((await getTrainerTaskPage(topic.slug ?? '', task.slug ?? ''))?.scope.admin).toBe(true)
  })
})
