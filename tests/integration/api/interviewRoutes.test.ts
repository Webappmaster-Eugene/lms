import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { InterviewRecording } from '@/payload-types'
import { logger } from '@/lib/telemetry'
import { InterviewStorageError } from '@/server/interviews/disk'
import { InterviewAnalysisClientError } from '@/server/interviews/analysis-client'
import { cleanupInterviewUploads } from '@/server/interviews/cleanup'
import { createInterviewSource, interviewSourceFilename } from '@/server/interviews/capability'
import { GET as listGET } from '@/app/api/interviews/route'
import { POST as createPOST } from '@/app/api/interviews/upload/route'
import { POST as importPOST } from '@/app/api/interviews/import/route'
import { GET as detailGET, DELETE as detailDELETE } from '@/app/api/interviews/[id]/route'
import { PUT as uploadPUT } from '@/app/api/interviews/[id]/upload/route'
import { POST as finishPOST } from '@/app/api/interviews/[id]/finish/route'
import { POST as analyzePOST } from '@/app/api/interviews/[id]/analyze/route'
import { GET as reportGET } from '@/app/api/interviews/[id]/report/route'
import { GET as streamGET, HEAD as streamHEAD } from '@/app/api/interviews/[id]/stream/route'
import { GET as sourceGET, HEAD as sourceHEAD } from '@/app/api/internal/interviews/[id]/[file]/route'
import { POST as runPOST } from '@/app/api/internal/interviews/run/route'
import { TEST_SECRET } from '../setup/constants'
import { createAdmin, createStudent, getTestPayload, login, uid, type TestUser } from '../helpers/payload'

/**
 * Маршруты библиотеки собеседований и служебные задачи — настоящие route
 * handlers поверх настоящего Payload и PostgreSQL. Яндекс Диск и сервис
 * оценки подменены на границе модулей, сеть наружу закрыта подменой fetch:
 * пропускается только подписанная ссылка на видео, которую отдаёт подмена диска.
 */

const VIDEO_HREF = 'https://downloader.disk.yandex.ru/disk/private-capability'
const mocks = vi.hoisted(() => ({
  createUpload: vi.fn(async ({ ownerId, recordingId }: { ownerId: number; recordingId: number }) => ({ diskPath: `disk:/LMS interviews/${ownerId}/${recordingId}-12345678-1234-4123-8123-123456789012.mp4`, uploadHref: 'https://uploader1.disk.yandex.net/upload-target/signed' })),
  finishUpload: vi.fn(async (input: { expectedSize: number }) => ({ size: input.expectedSize, mimeType: 'video/mp4' })),
  removePrivateFile: vi.fn(async () => {}),
  uploadPrivateFile: vi.fn(async () => {}),
  resolveRecordingHref: vi.fn(async () => 'https://downloader.disk.yandex.ru/disk/private-capability'),
  fetchSharedRecordings: vi.fn(async () => [] as unknown[]),
  createInterviewAnalysis: vi.fn(),
  getInterviewAnalysis: vi.fn(),
  deleteInterviewAnalysis: vi.fn(async () => {}),
  isInterviewAnalysisConfigured: vi.fn(() => true),
}))
vi.mock('@/server/interviews/disk', async (actual) => ({
  ...await actual<typeof import('@/server/interviews/disk')>(),
  createUpload: mocks.createUpload, finishUpload: mocks.finishUpload, removePrivateFile: mocks.removePrivateFile,
  uploadPrivateFile: mocks.uploadPrivateFile, resolveRecordingHref: mocks.resolveRecordingHref, fetchSharedRecordings: mocks.fetchSharedRecordings,
}))
vi.mock('@/server/interviews/analysis-client', async (actual) => ({
  ...await actual<typeof import('@/server/interviews/analysis-client')>(),
  createInterviewAnalysis: mocks.createInterviewAnalysis, getInterviewAnalysis: mocks.getInterviewAnalysis,
  deleteInterviewAnalysis: mocks.deleteInterviewAnalysis, isInterviewAnalysisConfigured: mocks.isInterviewAnalysisConfigured,
}))

const network = vi.fn(async (input: unknown, init?: RequestInit) => {
  if (String(input) !== VIDEO_HREF) throw new Error(`Внешняя сеть в тестах запрещена: ${String(input)}`)
  const range = new Headers(init?.headers).get('range')
  return range
    ? new Response('vid', { status: 206, headers: { 'content-length': '3', 'content-range': 'bytes 0-2/11', 'accept-ranges': 'bytes' } })
    : new Response('video-bytes', { status: 200, headers: { 'content-length': '11' } })
})

let payload: Payload
let student: TestUser
let other: TestUser
let admin: TestUser
let studentToken: string
let otherToken: string
let adminToken: string
let react: number
let nodejs: number

const ORIGIN = 'http://lms.test'
const analysisBody = { consent: true, targetGrade: 'middle', vacancyText: 'Разрабатывать React-приложения', interviewFormat: 'mixed' }
const JOB_KEY = createHmac('sha256', TEST_SECRET).update('lms-interviews-scheduler-v1').digest('hex')

type Options = { token?: string; origin?: string; site?: string; body?: unknown; raw?: BodyInit; type?: string; headers?: Record<string, string> }
function request(path: string, method: string, { token, origin, site, body, raw, type, headers = {} }: Options = {}): Request {
  const all = new Headers(headers)
  if (token) all.set('Authorization', `JWT ${token}`)
  if (origin) all.set('Origin', origin)
  if (site) all.set('Sec-Fetch-Site', site)
  if (body !== undefined || raw !== undefined) all.set('Content-Type', type ?? 'application/json')
  return new Request(`${ORIGIN}${path}`, { method, headers: all, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) })
}
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })
async function json(response: Response): Promise<{ status: number; body: Record<string, unknown> }> {
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}

async function recording(owner: TestUser | null, overrides: Partial<InterviewRecording> = {}): Promise<InterviewRecording> {
  return payload.create({ collection: 'interview-recordings', data: {
    title: uid('Запись'), direction: react, category: 'personal', owner: owner?.id, status: 'ready', analysisStatus: 'idle',
    size: 1024, mimeType: 'video/mp4', diskPath: `disk:/LMS interviews/${owner?.id ?? 9}/1-12345678-1234-4123-8123-123456789012.mp4`, ...overrides,
  } as never })
}
const stored = (id: number) => payload.find({ collection: 'interview-recordings', where: { id: { equals: id } }, depth: 0, limit: 1 }).then((found) => found.docs[0])
const titled = (title: string) => payload.count({ collection: 'interview-recordings', where: { title: { equals: title } } }).then((found) => found.totalDocs)
const removeStaleUploads = () => payload.delete({ collection: 'interview-recordings', where: { and: [{ status: { equals: 'uploading' } }, { category: { equals: 'personal' } }, { createdAt: { less_than: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() } }] } })
/** createdAt выставляет Payload; старую «брошенную» загрузку моделируем прямо в базе. */
async function makeOld(id: number, hours = 48): Promise<void> {
  const db = (payload.db as unknown as { drizzle: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } }).drizzle
  await db.execute(sql`update interview_recordings set created_at = now() - make_interval(hours => ${hours}) where id = ${id}`)
}

beforeAll(async () => {
  payload = await getTestPayload()
  student = await createStudent(payload)
  other = await createStudent(payload)
  admin = await createAdmin(payload)
  ;[studentToken, otherToken, adminToken] = await Promise.all([login(payload, student), login(payload, other), login(payload, admin)])
  const tracks = await payload.find({ collection: 'interview-directions', where: { slug: { in: ['react', 'nodejs'] } }, depth: 0 })
  react = tracks.docs.find((track) => track.slug === 'react')?.id ?? -1
  nodejs = tracks.docs.find((track) => track.slug === 'nodejs')?.id ?? -1
  vi.stubGlobal('fetch', network)
})
beforeEach(() => {
  mocks.isInterviewAnalysisConfigured.mockReturnValue(true)
})
afterEach(() => {
  // Сброс к исходным реализациям подмен: настройки одного теста не протекают в следующий.
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})
afterAll(() => vi.unstubAllGlobals())

describe('GET /api/interviews — библиотека', () => {
  it('аноним — 401 без кэширования', async () => {
    const response = await listGET(request('/api/interviews', 'GET'))
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('общая категория показывает только готовые записи, личная — только свои, без путей диска', async () => {
    const tag = uid('библиотека')
    const ready = await recording(null, { category: 'mentor', title: `${tag} готова`, diskPath: null })
    await recording(null, { category: 'mentor', title: `${tag} загружается`, status: 'uploading', diskPath: null })
    const mine = await recording(student, { title: `${tag} моя` })
    await recording(other, { title: `${tag} чужая` })
    const shared = await json(await listGET(request(`/api/interviews?category=mentor&direction=react&search=${encodeURIComponent(tag)}`, 'GET', { token: studentToken })))
    expect(shared.status).toBe(200)
    expect((shared.body.recordings as { id: number }[]).map((item) => item.id)).toEqual([ready.id])
    const personal = await json(await listGET(request(`/api/interviews?category=personal&direction=react&search=${encodeURIComponent(tag)}`, 'GET', { token: studentToken })))
    expect((personal.body.recordings as { id: number; isOwner: boolean }[])).toEqual([expect.objectContaining({ id: mine.id, isOwner: true })])
    expect(JSON.stringify(personal.body)).not.toContain('disk:/')
    // Неизвестная категория не открывает личные записи: подставляется категория ментора.
    const unknown = await json(await listGET(request(`/api/interviews?category=all&search=${encodeURIComponent(tag)}`, 'GET', { token: studentToken })))
    expect((unknown.body.recordings as { id: number }[]).map((item) => item.id)).toEqual([ready.id])
  })

  it('сообщает доступность загрузки и роль администратора', async () => {
    const plain = await json(await listGET(request('/api/interviews', 'GET', { token: studentToken })))
    expect(plain.body).toMatchObject({ uploadAvailable: false, analysisAvailable: true, isAdmin: false })
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const asAdmin = await json(await listGET(request('/api/interviews', 'GET', { token: adminToken })))
    expect(asAdmin.body).toMatchObject({ uploadAvailable: true, isAdmin: true })
  })
})

describe('GET и DELETE /api/interviews/[id]', () => {
  it('карточку видят только владелец личной записи и все — готовой общей', async () => {
    const mine = await recording(student)
    const shared = await recording(null, { category: 'community', diskPath: null })
    const pending = await recording(null, { category: 'mentor', status: 'uploading', diskPath: null })
    expect((await detailGET(request(`/api/interviews/${mine.id}`, 'GET'), params(mine.id))).status).toBe(401)
    const own = await json(await detailGET(request(`/api/interviews/${mine.id}`, 'GET', { token: studentToken }), params(mine.id)))
    expect(own.status).toBe(200)
    expect(own.body.recording).toMatchObject({ id: mine.id, isOwner: true, category: 'personal' })
    expect(JSON.stringify(own.body)).not.toContain('disk:/')
    for (const token of [otherToken, adminToken]) expect((await detailGET(request(`/api/interviews/${mine.id}`, 'GET', { token }), params(mine.id))).status).toBe(404)
    expect((await detailGET(request(`/api/interviews/${shared.id}`, 'GET', { token: otherToken }), params(shared.id))).status).toBe(200)
    expect((await detailGET(request(`/api/interviews/${pending.id}`, 'GET', { token: adminToken }), params(pending.id))).status).toBe(404)
    for (const id of ['abc', '0', '-1', '1.5']) expect((await detailGET(request(`/api/interviews/${id}`, 'GET', { token: studentToken }), params(id))).status).toBe(404)
  })

  it('удалить можно только свою запись, с платформы и не во время загрузки', async () => {
    const mine = await recording(student)
    const shared = await recording(null, { category: 'mentor', diskPath: null })
    const del = (id: number, options: Options) => detailDELETE(request(`/api/interviews/${id}`, 'DELETE', options), params(id))
    expect((await del(mine.id, { token: studentToken, origin: 'https://evil.test' })).status).toBe(403)
    expect((await del(mine.id, { token: studentToken, origin: ORIGIN, site: 'cross-site' })).status).toBe(403)
    expect((await del(mine.id, { origin: ORIGIN })).status).toBe(401)
    expect((await del(mine.id, { token: otherToken })).status).toBe(404)
    expect((await del(shared.id, { token: adminToken })).status).toBe(404)
    expect(await stored(shared.id)).toBeDefined()
    await payload.update({ collection: 'interview-recordings', id: mine.id, data: { uploadLeaseUntil: new Date(Date.now() + 60_000).toISOString() } })
    expect((await del(mine.id, { token: studentToken })).status).toBe(409)
    expect(mocks.removePrivateFile).not.toHaveBeenCalled()
    expect(await stored(mine.id)).toBeDefined()
    await payload.update({ collection: 'interview-recordings', id: mine.id, data: { uploadLeaseUntil: null } })
    const deleted = await json(await del(mine.id, { token: studentToken, origin: ORIGIN }))
    expect(deleted).toEqual({ status: 200, body: { deleted: true } })
    expect(mocks.removePrivateFile).toHaveBeenCalledWith(mine.diskPath)
    expect(await stored(mine.id)).toBeUndefined()
  })
})

describe('POST /api/interviews/upload — резервирование записи', () => {
  const valid = (title: string) => ({ title, directionId: react, size: 2048, fileName: 'interview.mp4' })

  it('чужой Origin, межсайтовый запрос и аноним — отказ без записи в базу', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const title = uid('отказ')
    expect((await createPOST(request('/api/interviews/upload', 'POST', { token: studentToken, origin: 'https://evil.test', body: valid(title) }))).status).toBe(403)
    expect((await createPOST(request('/api/interviews/upload', 'POST', { token: studentToken, site: 'same-site', body: valid(title) }))).status).toBe(403)
    expect((await createPOST(request('/api/interviews/upload', 'POST', { origin: ORIGIN, body: valid(title) }))).status).toBe(401)
    // Без Origin и без явного токена запрос не считается запросом платформы.
    expect((await createPOST(request('/api/interviews/upload', 'POST', { body: valid(title) }))).status).toBe(403)
    expect(await titled(title)).toBe(0)
    expect(mocks.createUpload).not.toHaveBeenCalled()
  })

  it.each([
    ['не JSON по Content-Type', { raw: '{}', type: 'text/plain' }, 415],
    ['битый JSON', { raw: '{"title":' }, 400],
    ['тело больше 8 КБ', { body: { title: 'x', directionId: 1, size: 1, fileName: 'a.mp4', description: 'я'.repeat(5000) } }, 413],
    ['без названия', { body: { directionId: 1, size: 1, fileName: 'a.mp4' } }, 400],
    ['название длиннее 200', { body: { title: 'я'.repeat(201), directionId: 1, size: 1, fileName: 'a.mp4' } }, 400],
    ['направление строкой', { body: { title: 'x', directionId: '1', size: 1, fileName: 'a.mp4' } }, 400],
    ['больше 5 ГБ', { body: { title: 'x', directionId: 1, size: 5 * 1024 ** 3 + 1, fileName: 'a.mp4' } }, 413],
    ['дробный размер', { body: { title: 'x', directionId: 1, size: 1.5, fileName: 'a.mp4' } }, 413],
    ['формат avi', { body: { title: 'x', directionId: 1, size: 1, fileName: 'a.avi' } }, 400],
    ['MIME не совпадает с расширением', { body: { title: 'x', directionId: 1, size: 1, fileName: 'a.mp4', mimeType: 'text/html' } }, 400],
    ['описание не строкой', { body: { title: 'x', directionId: 1, size: 1, fileName: 'a.mp4', description: ['a'] } }, 400],
    ['массив вместо объекта', { body: [] }, 400],
  ])('%s — %s, ничего не резервируется', async (_, options, status) => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const before = await payload.count({ collection: 'interview-recordings', where: { owner: { equals: student.id } } })
    const response = await createPOST(request('/api/interviews/upload', 'POST', { token: studentToken, ...options }))
    expect(response.status).toBe(status)
    expect(typeof (await response.json()).error).toBe('string')
    expect((await payload.count({ collection: 'interview-recordings', where: { owner: { equals: student.id } } })).totalDocs).toBe(before.totalDocs)
    expect(mocks.createUpload).not.toHaveBeenCalled()
  })

  it('без настроенного диска — 503, с неизвестным направлением — 404', async () => {
    const title = uid('недоступно')
    expect((await createPOST(request('/api/interviews/upload', 'POST', { token: studentToken, body: valid(title) }))).status).toBe(503)
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    expect((await createPOST(request('/api/interviews/upload', 'POST', { token: studentToken, body: { ...valid(title), directionId: 987654321 } }))).status).toBe(404)
    expect(await titled(title)).toBe(0)
  })

  it('лишние поля не меняют владельца, категорию и статус: запись всегда личная и ждёт загрузки', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const fresh = await createStudent(payload)
    const title = uid('эскалация')
    const response = await json(await createPOST(request('/api/interviews/upload', 'POST', { token: await login(payload, fresh), origin: ORIGIN, body: {
      ...valid(title), directionId: nodejs, description: '  моё описание  ', owner: other.id, category: 'mentor', status: 'ready',
      diskPath: 'disk:/LMS interviews/1/evil.mp4', analysisStatus: 'completed', analysisReport: { score: 100 }, size: 2048,
    } })))
    expect(response.status).toBe(201)
    const id = response.body.id as number
    expect(response.body).toEqual({ id, uploadHref: `/api/interviews/${id}/upload` })
    expect(await stored(id)).toMatchObject({
      title, description: 'моё описание', direction: nodejs, category: 'personal', owner: fresh.id, status: 'uploading',
      analysisStatus: 'idle', analysisReport: null, mimeType: 'video/mp4', size: 2048,
      diskPath: `disk:/LMS interviews/${fresh.id}/${id}-12345678-1234-4123-8123-123456789012.mp4`,
    })
    expect(mocks.createUpload).toHaveBeenCalledWith({ ownerId: fresh.id, recordingId: id, size: 2048, mimeType: 'video/mp4', extension: 'mp4' })
  })

  it('двадцать личных записей — предел: 429 без новой строки', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const busy = await createStudent(payload)
    for (let index = 0; index < 20; index += 1) await recording(busy, { size: 1 })
    const response = await createPOST(request('/api/interviews/upload', 'POST', { token: await login(payload, busy), body: valid(uid('сверх')) }))
    expect(response.status).toBe(429)
    expect((await payload.count({ collection: 'interview-recordings', where: { owner: { equals: busy.id } } })).totalDocs).toBe(20)
  })

  it('сбой хранилища — 503 без подробностей провайдера, зарезервированная строка удаляется', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})
    mocks.createUpload.mockRejectedValueOnce(new Error('PUT https://uploader1.disk.yandex.net/upload-target/SIGNED failed'))
    const title = uid('сбой')
    const response = await createPOST(request('/api/interviews/upload', 'POST', { token: studentToken, body: valid(title) }))
    expect(response.status).toBe(503)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ error: 'Сервис собеседований временно недоступен. Попробуйте ещё раз' })
    expect(await titled(title)).toBe(0)
    expect(error).toHaveBeenCalledWith('Interview library request failed', expect.any(Error), expect.objectContaining({ action: 'create', errorClass: 'Error' }))
    expect(JSON.stringify(error.mock.calls, (_key, value: unknown) => value instanceof Error ? `${value.message} ${value.stack}` : value)).not.toContain('SIGNED')
  })
})

describe('PUT /api/interviews/[id]/upload — поток видео', () => {
  const put = (id: number, options: Options = {}) => uploadPUT(request(`/api/interviews/${id}/upload`, 'PUT', { raw: new Uint8Array(1024), type: 'video/mp4', ...options }), params(id))

  it('чужой Origin, аноним и чужая запись — отказ до обращения к диску', async () => {
    const pending = await recording(student, { status: 'uploading' })
    expect((await put(pending.id, { token: studentToken, origin: 'https://evil.test' })).status).toBe(403)
    expect((await put(pending.id, { origin: ORIGIN })).status).toBe(401)
    expect((await put(pending.id, { token: otherToken })).status).toBe(404)
    expect((await put(pending.id, { token: adminToken })).status).toBe(404)
    expect(mocks.uploadPrivateFile).not.toHaveBeenCalled()
    expect(await stored(pending.id)).toMatchObject({ status: 'uploading', uploadClaim: null, uploadLeaseUntil: null })
  })

  it('владелец загружает файл в свою зарезервированную папку, аренда снимается после ответа', async () => {
    const pending = await recording(student, { status: 'uploading', size: 1024, mimeType: 'video/webm', diskPath: `disk:/LMS interviews/${student.id}/5-12345678-1234-4123-8123-123456789012.webm` })
    expect(await json(await put(pending.id, { token: studentToken }))).toEqual({ status: 200, body: { uploaded: true } })
    expect(mocks.uploadPrivateFile).toHaveBeenCalledWith(expect.any(Request), { diskPath: pending.diskPath, expectedSize: 1024, mimeType: 'video/webm' })
    expect(await stored(pending.id)).toMatchObject({ status: 'uploading', uploadClaim: null, uploadLeaseUntil: null })
  })

  it('пока идёт загрузка, вторая загрузка, завершение и удаление получают 409', async () => {
    const pending = await recording(student, { status: 'uploading' })
    let release: () => void = () => {}
    mocks.uploadPrivateFile.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const first = put(pending.id, { token: studentToken })
    await vi.waitFor(async () => expect((await stored(pending.id)).uploadClaim).toEqual(expect.any(String)))
    expect(await json(await put(pending.id, { token: studentToken }))).toEqual({ status: 409, body: { error: 'Загрузка этой записи уже идёт' } })
    expect((await finishPOST(request(`/api/interviews/${pending.id}/finish`, 'POST', { token: studentToken }), params(pending.id))).status).toBe(409)
    expect((await detailDELETE(request(`/api/interviews/${pending.id}`, 'DELETE', { token: studentToken }), params(pending.id))).status).toBe(409)
    release()
    expect((await first).status).toBe(200)
    expect(mocks.uploadPrivateFile).toHaveBeenCalledTimes(1)
    expect(mocks.finishUpload).not.toHaveBeenCalled()
    expect(await stored(pending.id)).toMatchObject({ uploadClaim: null, uploadLeaseUntil: null })
  })

  it('отказ хранилища отдаётся статусом и не оставляет аренду: повтор проходит', async () => {
    const pending = await recording(student, { status: 'uploading' })
    mocks.uploadPrivateFile.mockRejectedValueOnce(new InterviewStorageError('Размер загружаемого видео изменился', 400))
    expect(await json(await put(pending.id, { token: studentToken }))).toEqual({ status: 400, body: { error: 'Размер загружаемого видео изменился' } })
    expect(await stored(pending.id)).toMatchObject({ uploadClaim: null, uploadLeaseUntil: null })
    expect((await put(pending.id, { token: studentToken })).status).toBe(200)
  })

  it('готовую запись и запись без зарезервированного пути загрузить нельзя', async () => {
    const ready = await recording(student)
    const unreserved = await recording(student, { status: 'uploading', diskPath: null })
    expect((await put(ready.id, { token: studentToken })).status).toBe(409)
    expect((await put(unreserved.id, { token: studentToken })).status).toBe(409)
    expect(mocks.uploadPrivateFile).not.toHaveBeenCalled()
  })
})

describe('POST /api/interviews/[id]/finish', () => {
  const finish = (id: number, options: Options) => finishPOST(request(`/api/interviews/${id}/finish`, 'POST', options), params(id))

  it('отказы не меняют статус записи', async () => {
    const pending = await recording(student, { status: 'uploading' })
    expect((await finish(pending.id, { token: studentToken, origin: 'https://evil.test' })).status).toBe(403)
    expect((await finish(pending.id, { origin: ORIGIN })).status).toBe(401)
    expect((await finish(pending.id, { token: otherToken })).status).toBe(404)
    mocks.finishUpload.mockRejectedValueOnce(new InterviewStorageError('Видео ещё не загружено полностью', 409))
    expect(await json(await finish(pending.id, { token: studentToken }))).toEqual({ status: 409, body: { error: 'Видео ещё не загружено полностью' } })
    expect((await stored(pending.id)).status).toBe('uploading')
  })

  it('владелец завершает загрузку: размер и тип берутся с диска, повтор идемпотентен', async () => {
    const pending = await recording(student, { status: 'uploading', size: 4096 })
    mocks.finishUpload.mockResolvedValueOnce({ size: 4096, mimeType: 'video/quicktime' })
    const done = await json(await finish(pending.id, { token: studentToken, origin: ORIGIN }))
    expect(done.status).toBe(200)
    expect(done.body).toMatchObject({ id: pending.id, status: 'ready', size: 4096, isOwner: true })
    expect(await stored(pending.id)).toMatchObject({ status: 'ready', mimeType: 'video/quicktime' })
    expect(mocks.finishUpload).toHaveBeenCalledWith({ diskPath: pending.diskPath, expectedSize: 4096, expectedMime: 'video/mp4' })
    expect((await finish(pending.id, { token: studentToken })).status).toBe(200)
    expect(mocks.finishUpload).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/interviews/[id]/analyze', () => {
  const analyze = (id: number, options: Options) => analyzePOST(request(`/api/interviews/${id}/analyze`, 'POST', options), params(id))

  it('отказы до постановки в очередь не трогают запись и лимит', async () => {
    const fresh = await createStudent(payload)
    const token = await login(payload, fresh)
    const mine = await recording(fresh)
    expect((await analyze(mine.id, { token, origin: 'https://evil.test', body: analysisBody })).status).toBe(403)
    expect((await analyze(mine.id, { origin: ORIGIN, body: analysisBody })).status).toBe(401)
    expect((await analyze(mine.id, { token: otherToken, body: analysisBody })).status).toBe(404)
    expect((await analyze(mine.id, { token, body: { ...analysisBody, consent: false } })).status).toBe(400)
    expect((await analyze(mine.id, { token, body: { ...analysisBody, analysisStatus: 'completed' } })).status).toBe(400)
    expect((await analyze(mine.id, { token, body: { ...analysisBody, vacancyText: 'я'.repeat(50_000) } })).status).toBe(413)
    mocks.isInterviewAnalysisConfigured.mockReturnValue(false)
    expect((await analyze(mine.id, { token, body: analysisBody })).status).toBe(503)
    expect(await stored(mine.id)).toMatchObject({ analysisStatus: 'idle', analysisAttempts: 0 })
    expect((await payload.count({ collection: 'interview-analysis-usage', where: { owner: { equals: fresh.id } } })).totalDocs).toBe(0)
  })

  // interview_analysis_usage.owner_id объявлен NOT NULL при внешнем ключе ON DELETE SET NULL:
  // без очистки счётчика удаление ученика упиралось бы в ограничение.
  it('ученика, запускавшего анализ записи, можно удалить', async () => {
    const fresh = await createStudent(payload)
    const mine = await recording(fresh)
    expect((await analyze(mine.id, { token: await login(payload, fresh), body: analysisBody })).status).toBe(202)
    await payload.update({ collection: 'interview-recordings', id: mine.id, data: { analysisStatus: 'failed' } })
    await payload.delete({ collection: 'users', id: fresh.id })
    expect((await payload.count({ collection: 'users', where: { id: { equals: fresh.id } } })).totalDocs).toBe(0)
  })

  it('владелец ставит анализ в очередь: 202, попытка и суточный счётчик записаны', async () => {
    const fresh = await createStudent(payload)
    const mine = await recording(fresh)
    const response = await json(await analyze(mine.id, { token: await login(payload, fresh), origin: ORIGIN, body: analysisBody }))
    expect(response).toEqual({ status: 202, body: { analysisStatus: 'queued' } })
    expect(await stored(mine.id)).toMatchObject({ analysisStatus: 'queued', analysisAttempts: 1, analysisBackend: 'sovetnik' })
    expect((await payload.find({ collection: 'interview-analysis-usage', where: { owner: { equals: fresh.id } } })).docs[0].requests).toBe(1)
    await payload.update({ collection: 'interview-recordings', id: mine.id, data: { analysisStatus: 'failed' } })
  })
})

describe('GET /api/interviews/[id]/report', () => {
  it('аноним — 401, отчёта ещё нет — 409, чужому — 404', async () => {
    const mine = await recording(student)
    expect((await reportGET(request(`/api/interviews/${mine.id}/report`, 'GET'), params(mine.id))).status).toBe(401)
    expect((await reportGET(request(`/api/interviews/${mine.id}/report`, 'GET', { token: studentToken }), params(mine.id))).status).toBe(409)
    expect((await reportGET(request(`/api/interviews/${mine.id}/report`, 'GET', { token: otherToken }), params(mine.id))).status).toBe(404)
  })
})

describe('GET/HEAD /api/interviews/[id]/stream', () => {
  const stream = (id: number, options: Options, method: 'GET' | 'HEAD' = 'GET') => (method === 'HEAD' ? streamHEAD : streamGET)(request(`/api/interviews/${id}/stream`, method, options), params(id))

  it('видео отдаётся владельцу через платформу, ссылка диска наружу не уходит', async () => {
    const mine = await recording(student)
    const response = await stream(mine.id, { token: studentToken })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('video-bytes')
    expect(response.headers.get('Content-Type')).toBe('video/mp4')
    expect(response.headers.get('Content-Disposition')).toBe('inline')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Content-Security-Policy')).toContain('sandbox')
    expect(JSON.stringify([...response.headers])).not.toContain('private-capability')
    expect(mocks.resolveRecordingHref).toHaveBeenCalledWith(expect.objectContaining({ diskPath: mine.diskPath }), expect.any(AbortSignal), false)
  })

  it('диапазон байтов пробрасывается, HEAD отвечает без тела', async () => {
    const mine = await recording(student)
    const partial = await stream(mine.id, { token: studentToken, headers: { Range: 'bytes=0-2' } })
    expect(partial.status).toBe(206)
    expect(partial.headers.get('Content-Range')).toBe('bytes 0-2/11')
    expect(await partial.text()).toBe('vid')
    const head = await stream(mine.id, { token: studentToken }, 'HEAD')
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('аноним — 401, чужая личная — 404, незагруженная — 409, до обращения к диску', async () => {
    const mine = await recording(student)
    const pending = await recording(student, { status: 'uploading' })
    expect((await stream(mine.id, {})).status).toBe(401)
    expect((await stream(mine.id, { token: otherToken })).status).toBe(404)
    expect((await stream(mine.id, { token: adminToken })).status).toBe(404)
    expect((await stream(pending.id, { token: studentToken })).status).toBe(409)
    expect(mocks.resolveRecordingHref).not.toHaveBeenCalled()
  })
})

describe('POST /api/interviews/import — общие записи с Диска', () => {
  const shared = (tag: string) => [
    { category: 'mentor', directionSlug: 'react', title: `${tag} React`, publicKey: 'https://disk.yandex.com/d/GnyK5icpAuUnnQ', publicPath: `/React/${tag}.mp4`, size: 10, mimeType: 'video/mp4' },
    { category: 'community', directionSlug: 'nodejs', title: `${tag} Node`, publicKey: 'https://disk.yandex.com/d/OExQrM0fLW1APQ', publicPath: `/Node/${tag}.webm`, size: 20, mimeType: 'video/webm' },
    { category: 'mentor', directionSlug: 'python', title: `${tag} Python`, publicKey: 'https://disk.yandex.com/d/GnyK5icpAuUnnQ', publicPath: `/Python/${tag}.mp4`, size: 30, mimeType: 'video/mp4' },
  ]
  const sharedRows = (tag: string) => payload.find({ collection: 'interview-recordings', where: { title: { like: tag } }, depth: 0, sort: 'title' }).then((found) => found.docs)

  it('ученику, анониму и с чужого Origin — отказ без чтения Диска', async () => {
    expect((await importPOST(request('/api/interviews/import', 'POST', { token: adminToken, origin: 'https://evil.test' }))).status).toBe(403)
    expect((await importPOST(request('/api/interviews/import', 'POST', { origin: ORIGIN }))).status).toBe(401)
    expect(await json(await importPOST(request('/api/interviews/import', 'POST', { token: studentToken })))).toEqual({ status: 403, body: { error: 'Доступ запрещён' } })
    expect(mocks.fetchSharedRecordings).not.toHaveBeenCalled()
  })

  it('администратор импортирует записи известных направлений, повтор обновляет без дублей', async () => {
    const tag = uid('импорт')
    mocks.fetchSharedRecordings.mockResolvedValue(shared(tag))
    expect(await json(await importPOST(request('/api/interviews/import', 'POST', { token: adminToken, origin: ORIGIN })))).toEqual({ status: 200, body: { created: 2, updated: 0 } })
    const first = await sharedRows(tag)
    expect(first).toEqual([
      expect.objectContaining({ title: `${tag} Node`, category: 'community', direction: nodejs, status: 'ready', owner: null, size: 20, mimeType: 'video/webm' }),
      expect.objectContaining({ title: `${tag} React`, category: 'mentor', direction: react, status: 'ready', owner: null, size: 10 }),
    ])
    mocks.fetchSharedRecordings.mockResolvedValue(shared(tag).map((file) => ({ ...file, size: file.size + 1 })))
    expect(await json(await importPOST(request('/api/interviews/import', 'POST', { token: adminToken })))).toEqual({ status: 200, body: { created: 0, updated: 2 } })
    const second = await sharedRows(tag)
    expect(second.map((row) => row.id)).toEqual(first.map((row) => row.id))
    expect(second.map((row) => row.size)).toEqual([21, 11])
  })

  it('отказ Диска передаётся статусом, база не меняется', async () => {
    mocks.fetchSharedRecordings.mockRejectedValue(new InterviewStorageError('Яндекс Диск временно недоступен. Повторите попытку позже', 429))
    const before = await payload.count({ collection: 'interview-recordings' })
    expect((await importPOST(request('/api/interviews/import', 'POST', { token: adminToken }))).status).toBe(429)
    expect((await payload.count({ collection: 'interview-recordings' })).totalDocs).toBe(before.totalDocs)
  })
})

describe('GET /api/internal/interviews/[id]/[file] — источник для сервиса оценки', () => {
  // Записи «в очереди» из этих тестов иначе подхватил бы планировщик ниже.
  afterEach(() => payload.update({ collection: 'interview-recordings', where: { analysisStatus: { equals: 'queued' } }, data: { analysisStatus: 'failed' } }))
  async function queued(owner: TestUser) {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru')
    const doc = await recording(owner, { analysisStatus: 'queued', analysisBackend: 'sovetnik', analysisAttempts: 1, analysisRemoteKey: '7a3dc8a9-5b54-415b-a719-a4610b1408f2', analysisRequestedAt: new Date().toISOString() })
    const url = new URL(createInterviewSource(doc))
    return { doc, request: (method = 'GET') => new Request(url, { method }), context: { params: Promise.resolve({ id: String(doc.id), file: interviewSourceFilename(doc) }) } }
  }

  it('по подписанной ссылке отдаёт видео без сессии, HEAD — без тела', async () => {
    const source = await queued(student)
    const response = await sourceGET(source.request(), source.context)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('video-bytes')
    const head = await sourceHEAD(source.request('HEAD'), source.context)
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('некорректный id, сбой диска и запись без владельца — одинаковые 404 без подробностей', async () => {
    const source = await queued(student)
    for (const id of ['abc', '0', '-5']) expect((await sourceGET(source.request(), { params: Promise.resolve({ id, file: 'x.mp4' }) })).status).toBe(404)
    mocks.resolveRecordingHref.mockRejectedValueOnce(new InterviewStorageError('Доступ к хранилищу собеседований не настроен', 503))
    const failed = await sourceGET(source.request(), source.context)
    expect(await json(failed)).toEqual({ status: 404, body: { error: 'Запись недоступна' } })
    const orphan = await createStudent(payload)
    const orphaned = await queued(orphan)
    await payload.delete({ collection: 'users', id: orphan.id })
    expect((await stored(orphaned.doc.id)).owner).toBeNull()
    expect((await sourceGET(orphaned.request(), orphaned.context)).status).toBe(404)
  })
})

describe('POST /api/internal/interviews/run — планировщик', () => {
  const run = (key?: string) => runPOST(new Request('http://lms.test/api/internal/interviews/run', { method: 'POST', headers: key ? { 'x-lms-job-key': key } : {} }))
  /** В общей базе могут ждать чужие задачи: планировщик берёт по одной за вызов. */
  async function runUntil(id: number, done: (doc: InterviewRecording) => boolean) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await run(JOB_KEY)
      expect(response.status).toBe(200)
      const doc = await stored(id)
      if (done(doc)) return doc
    }
    throw new Error(`Запись ${id} не обработана за 10 запусков`)
  }
  async function queuedFor(owner: TestUser) {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru')
    return recording(owner, { analysisStatus: 'queued', analysisBackend: 'sovetnik', analysisAttempts: 1, analysisRemoteKey: '7a3dc8a9-5b54-415b-a719-a4610b1408f2', analysisRequestedAt: new Date().toISOString(), analysisInput: { ...analysisBody, direction: 'React.js' } })
  }

  it.each([
    ['без ключа', undefined],
    ['с ключом уведомлений', createHmac('sha256', TEST_SECRET).update('lms-notifications-scheduler-v1').digest('hex')],
    ['с ключом от другого секрета', createHmac('sha256', 'other').update('lms-interviews-scheduler-v1').digest('hex')],
  ])('%s — 403, ничего не удаляется и не отправляется', async (_, key) => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const stale = await recording(student, { status: 'uploading' })
    await makeOld(stale.id)
    const waiting = await queuedFor(student)
    const response = await run(key)
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await stored(stale.id)).toBeDefined()
    expect((await stored(waiting.id)).analysisStatus).toBe('queued')
    expect(mocks.removePrivateFile).not.toHaveBeenCalled()
    expect(mocks.createInterviewAnalysis).not.toHaveBeenCalled()
    await payload.delete({ collection: 'interview-recordings', where: { id: { in: [stale.id, waiting.id] } } })
  })

  it('с верным ключом убирает брошенную загрузку и отправляет запись на оценку', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const stale = await recording(student, { status: 'uploading' })
    await makeOld(stale.id)
    const waiting = await queuedFor(student)
    mocks.createInterviewAnalysis.mockImplementation(async (_owner: number, id: string) => ({ id, status: 'queued', progress: 'Ожидает' }))
    const first = await run(JOB_KEY)
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ removedUploads: 1, skipped: false })
    expect(await stored(stale.id)).toBeUndefined()
    expect(mocks.removePrivateFile).toHaveBeenCalledWith(stale.diskPath)
    const sent = await runUntil(waiting.id, (doc) => doc.analysisRemoteJobId !== null)
    expect(sent).toMatchObject({ analysisStatus: 'processing', analysisRemoteJobId: waiting.analysisRemoteKey })
    expect(mocks.createInterviewAnalysis).toHaveBeenCalledWith(student.id, waiting.analysisRemoteKey, expect.stringContaining(`/api/internal/interviews/${waiting.id}/`), expect.objectContaining({ targetGrade: 'middle' }), expect.any(AbortSignal))
    await payload.update({ collection: 'interview-recordings', id: waiting.id, data: { analysisStatus: 'failed' } })
  })

  it.each([
    ['окончательный отказ сервиса', new InterviewAnalysisClientError('Запись слишком короткая для оценки', 422), 'Запись слишком короткая для оценки'],
    ['непредвиденная ошибка', new Error('socket hang up https://secret.test'), 'Не удалось оценить собеседование. Попробуйте ещё раз'],
  ])('%s переводит анализ в failed с понятным текстом', async (_, failure, message) => {
    const fresh = await createStudent(payload)
    const waiting = await queuedFor(fresh)
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})
    mocks.createInterviewAnalysis.mockRejectedValue(failure)
    const failed = await runUntil(waiting.id, (doc) => doc.analysisStatus === 'failed')
    expect(failed).toMatchObject({ analysisStatus: 'failed', analysisError: message, analysisClaim: null, analysisLeaseUntil: null })
    expect(error).toHaveBeenCalledWith('Interview evaluation integration failed', expect.any(Error), expect.objectContaining({ recordingId: waiting.id }))
  })

  // Очистка идёт первой: её исключение превратило бы весь вызов в 503, и анализ записей не запускался бы.
  it('брошенная загрузка удалённого ученика не останавливает анализ записей', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const gone = await createStudent(payload)
    await makeOld((await recording(gone, { status: 'uploading' })).id)
    await payload.delete({ collection: 'users', id: gone.id })
    const fresh = await createStudent(payload)
    const waiting = await queuedFor(fresh)
    mocks.createInterviewAnalysis.mockImplementation(async (_owner: number, id: string) => ({ id, status: 'queued', progress: 'Ожидает' }))
    try {
      const response = await run(JOB_KEY)
      expect(response.status).toBe(200)
      await runUntil(waiting.id, (doc) => doc.analysisRemoteJobId !== null)
    } finally {
      await removeStaleUploads()
      await payload.update({ collection: 'interview-recordings', id: waiting.id, data: { analysisStatus: 'failed' } })
    }
  })

  it('без настроек диска и сервиса оценки — пустой проход', async () => {
    mocks.isInterviewAnalysisConfigured.mockReturnValue(false)
    expect(await json(await run(JOB_KEY))).toEqual({ status: 200, body: { skipped: true, removedUploads: 0 } })
  })

  it('сбой задачи — 503 без подробностей', async () => {
    mocks.isInterviewAnalysisConfigured.mockImplementation(() => { throw new Error('INTERVIEW_ANALYSIS_API_TOKEN=secret') })
    const response = await run(JOB_KEY)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Задача анализа не выполнена' })
  })
})

describe('cleanupInterviewUploads — брошенные загрузки', () => {
  async function staleUpload(owner: TestUser | null, overrides: Partial<InterviewRecording> = {}, hours = 48) {
    const doc = await recording(owner, { status: 'uploading', ...overrides })
    await makeOld(doc.id, hours)
    return doc
  }

  it('без токена Диска ничего не трогает', async () => {
    const stale = await staleUpload(student)
    expect(await cleanupInterviewUploads(payload)).toBe(0)
    expect(await stored(stale.id)).toBeDefined()
    await payload.delete({ collection: 'interview-recordings', id: stale.id })
  })

  it('удаляет только личные незавершённые загрузки старше суток без активной аренды', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const stale = await staleUpload(student)
    const unreserved = await staleUpload(student, { diskPath: null })
    const fresh = await staleUpload(student, {}, 23)
    const leased = await staleUpload(student, { uploadLeaseUntil: new Date(Date.now() + 60_000).toISOString() })
    const ready = await staleUpload(student, { status: 'ready' })
    const sharedPending = await staleUpload(null, { category: 'mentor', diskPath: null })
    expect(await cleanupInterviewUploads(payload)).toBe(2)
    expect(await stored(stale.id)).toBeUndefined()
    expect(await stored(unreserved.id)).toBeUndefined()
    for (const kept of [fresh, leased, ready, sharedPending]) expect(await stored(kept.id)).toBeDefined()
    expect(mocks.removePrivateFile.mock.calls).toEqual([[stale.diskPath]])
    await payload.delete({ collection: 'interview-recordings', where: { id: { in: [fresh.id, leased.id, ready.id, sharedPending.id] } } })
  })

  it('сбой Диска сохраняет строку для повтора и не останавливает остальные, за проход — не больше пяти', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const rows = []
    for (let index = 0; index < 6; index += 1) rows.push(await staleUpload(student, {}, 48 - index))
    mocks.removePrivateFile.mockRejectedValueOnce(new InterviewStorageError('Яндекс Диск временно недоступен', 502))
    expect(await cleanupInterviewUploads(payload)).toBe(4)
    expect(await stored(rows[0].id)).toBeDefined()
    expect(await stored(rows[5].id)).toBeDefined()
    for (const row of rows.slice(1, 5)) expect(await stored(row.id)).toBeUndefined()
    expect(await cleanupInterviewUploads(payload)).toBe(2)
    expect(await stored(rows[0].id)).toBeUndefined()
    expect(await stored(rows[5].id)).toBeUndefined()
  })

  // Владелец обнуляется при удалении ученика (FK ON DELETE SET NULL). Такие строки
  // попадают в пятёрку самых старых кандидатов: если их пропускать, они навсегда
  // загораживают очистку остальных, а их файлы остаются на Диске.
  it('брошенные загрузки удалённых учеников удаляются и не блокируют очистку остальных', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    try {
      const orphans: InterviewRecording[] = []
      for (let index = 0; index < 5; index += 1) {
        const gone = await createStudent(payload)
        orphans.push(await staleUpload(gone, {}, 72))
        await payload.delete({ collection: 'users', id: gone.id })
      }
      const blocked = await staleUpload(student)
      expect(await cleanupInterviewUploads(payload)).toBe(5)
      for (const orphan of orphans) expect(await stored(orphan.id)).toBeUndefined()
      expect(mocks.removePrivateFile.mock.calls).toEqual(orphans.map((orphan) => [orphan.diskPath]))
      expect(await cleanupInterviewUploads(payload)).toBe(1)
      expect(await stored(blocked.id)).toBeUndefined()
    } finally {
      await removeStaleUploads()
    }
  })
})
