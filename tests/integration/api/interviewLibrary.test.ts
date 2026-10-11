import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { createLocalReq } from 'payload'
import { createStudent, createAdmin, getTestPayload, login, type TestUser } from '../helpers/payload'
import { accessibleRecording, beginInterviewUpload, completeInterviewUpload, deleteInterviewRecording, getInterviewDetails, getInterviewLibrary, queueInterviewAnalysis, uploadInput } from '@/server/interviews/service'
import { interviewRoute } from '@/server/interviews/route'
import * as media from '@/server/interviews/media'
import { InterviewStorageError } from '@/server/interviews/disk'
import { createInterviewSource, interviewSourceFilename } from '@/server/interviews/capability'
import { GET as sourceGET } from '@/app/api/internal/interviews/[id]/[file]/route'
import { InterviewAnalysisClientError } from '@/server/interviews/analysis-client'
import type { InterviewAnalysisJob } from '@/lib/interviews/analysis-types'
import { interviewContext, interviewResult } from '../../fixtures/interview-analysis'
import { runInterviewAnalysisJobs } from '@/server/interviews/jobs'

const mocks = vi.hoisted(() => ({
  createUpload: vi.fn(async ({ ownerId, recordingId }: { ownerId: number; recordingId: number }) => ({ diskPath: `disk:/LMS interviews/${ownerId}/${recordingId}-12345678-1234-4123-8123-123456789012.mp4`, uploadHref: 'https://signed-secret.test/upload' })),
  finishUpload: vi.fn(async () => ({ size: 1024, mimeType: 'video/mp4' })),
  removePrivateFile: vi.fn(async () => {}),
  resolveRecordingHref: vi.fn(async () => 'https://downloader.disk.yandex.ru/private-capability'),
  createInterviewAnalysis: vi.fn(async (_ownerId: number, id: string): Promise<InterviewAnalysisJob> => ({ id, status: 'queued', progress: 'Ожидает' })),
  getInterviewAnalysis: vi.fn(async (_ownerId: number, id: string): Promise<InterviewAnalysisJob> => ({ id, status: 'processing', progress: 'Оцениваем ответы' })),
  deleteInterviewAnalysis: vi.fn(async () => {}),
  isInterviewAnalysisConfigured: vi.fn(() => true),
}))
vi.mock('@/server/interviews/disk', () => ({ ...mocks, InterviewStorageError: class extends Error { constructor(message: string, readonly statusCode = 502) { super(message) } }, fetchSharedRecordings: vi.fn(async () => []), uploadPrivateFile: vi.fn() }))
vi.mock('@/server/interviews/analysis-client', async (actual) => ({ ...await actual<typeof import('@/server/interviews/analysis-client')>(), ...mocks }))
let payload: Payload
let student: TestUser
let other: TestUser
let admin: TestUser
let direction: number
const ownedIds: number[] = []
beforeAll(async () => {
  payload = await getTestPayload()
  student = await createStudent(payload)
  other = await createStudent(payload)
  admin = await createAdmin(payload)
  direction = (await payload.find({ collection: 'interview-directions', where: { slug: { equals: 'react' } }, limit: 1 })).docs[0].id
})
beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru'); mocks.isInterviewAnalysisConfigured.mockReturnValue(true) })
afterEach(async () => { vi.unstubAllEnvs(); vi.clearAllMocks() })
const analysisInput = { consent: true, targetGrade: 'middle', vacancyText: 'Разрабатывать React-приложения', interviewFormat: 'mixed' } as const
const expireLease = (id: number) => payload.update({ collection: 'interview-recordings', id, data: { analysisLeaseUntil: new Date(Date.now() - 1000).toISOString() } })
async function recording(owner = student, status: 'ready' | 'uploading' = 'ready', category: 'personal' | 'mentor' = 'personal') {
  const doc = await payload.create({ collection: 'interview-recordings', data: { title: 'Личная запись', direction, owner: owner.id, category, status, analysisStatus: 'idle', size: 1024, mimeType: 'video/mp4', diskPath: `disk:/LMS interviews/${owner.id}/111-12345678-1234-4123-8123-123456789012.mp4` } })
  ownedIds.push(doc.id)
  return doc
}
describe('видеособеседования: приватность, загрузки и долговечная очередь', () => {
  it('владельцу доступна личная запись, другому ученику и администратору — 404; общие записи доступны', async () => {
    const doc = await recording()
    const shared = await recording(student, 'ready', 'mentor')
    expect((await accessibleRecording(payload, student, doc.id)).id).toBe(doc.id)
    for (const user of [other, admin]) await expect(accessibleRecording(payload, user, doc.id)).rejects.toMatchObject({ status: 404 })
    expect((await accessibleRecording(payload, other, shared.id)).id).toBe(shared.id)
    await expect(accessibleRecording(payload, student, shared.id, true)).rejects.toMatchObject({ status: 404 })
  })
  it('isActive исключает из рейтинга и не блокирует просмотр собственной записи', async () => {
    const learner = await createStudent(payload)
    const doc = await recording(learner)
    const hiddenFromRating = await payload.update({ collection: 'users', id: learner.id, data: { isActive: false }, context: { skipHooks: true } })
    expect((await accessibleRecording(payload, hiddenFromRating, doc.id)).id).toBe(doc.id)
    const req = await createLocalReq({ user: hiddenFromRating }, payload)
    const visible = await payload.find({ collection: 'interview-recordings', where: { id: { equals: doc.id } }, req, overrideAccess: false })
    expect(visible.docs).toHaveLength(1)
  })
  it('Payload REST policy изолирует личные записи и закрывает прямую запись ученикам', async () => {
    const mine = await recording()
    const theirs = await recording(other)
    const req = await createLocalReq({ user: student }, payload)
    const found = await payload.find({ collection: 'interview-recordings', where: { category: { equals: 'personal' } }, depth: 0, req, overrideAccess: false })
    expect(found.docs.map((d) => d.id)).toContain(mine.id)
    expect(found.docs.map((d) => d.id)).not.toContain(theirs.id)
    expect(found.docs.find((d) => d.id === mine.id)).not.toHaveProperty('diskPath')
    const adminReq = await createLocalReq({ user: admin }, payload)
    await expect(payload.update({ collection: 'interview-recordings', id: mine.id, data: { owner: admin.id }, req: adminReq, overrideAccess: false })).rejects.toThrow()
    await expect(payload.delete({ collection: 'interview-recordings', id: mine.id, req: adminReq, overrideAccess: false })).rejects.toThrow()
    await expect(payload.update({ collection: 'interview-recordings', id: mine.id, data: { owner: other.id }, req, overrideAccess: false })).rejects.toThrow()
  })
  it('личный список пагинирует до фильтрации и не раскрывает пути и отчёты', async () => {
    for (let i = 0; i < 13; i++) await recording()
    await recording(other)
    const first = await getInterviewLibrary(payload, student, { direction: 'react', category: 'personal', page: 1 })
    const second = await getInterviewLibrary(payload, student, { direction: 'react', category: 'personal', page: 2 })
    expect(first.recordings).toHaveLength(12)
    expect(second.recordings.length).toBeGreaterThan(0)
    expect(first.totalDocs).toBeGreaterThanOrEqual(14)
    expect(first.recordings.every((d) => d.isOwner)).toBe(true)
    expect(JSON.stringify(first)).not.toContain('disk:/')
    expect(first.recordings[0]).not.toHaveProperty('analysisReport')
  })
  it('авторизация, запрет чужих Origin и нет fallback с malformed token на cookie', async () => {
    const doc = await recording()
    expect((await interviewRoute(new Request('http://lms.test/api/interviews'), 'list')).status).toBe(401)
    const jwt = await login(payload, student)
    const auth = { Authorization: `JWT ${jwt}` }
    const body = JSON.stringify({})
    expect((await interviewRoute(new Request(`http://lms.test/api/interviews/${doc.id}/analyze`, { method: 'POST', headers: { ...auth, Origin: 'https://foreign.test', 'Content-Type': 'application/json' }, body }), 'analyze', doc.id)).status).toBe(403)
    expect((await interviewRoute(new Request('http://lms.test/api/interviews', { headers: { Authorization: 'broken', Cookie: `payload-token=${jwt}` } }), 'list')).status).toBe(401)
    const otherJwt = await login(payload, other)
    expect((await interviewRoute(new Request(`http://lms.test/api/interviews/${doc.id}`, { headers: { Authorization: `JWT ${otherJwt}` } }), 'detail', doc.id)).status).toBe(404)
  })
  it('отказ источника видео возвращает контролируемую ошибку без uncaught rejection', async () => {
    const doc = await recording()
    const jwt = await login(payload, student)
    const failing = vi.spyOn(media, 'streamRecordingMedia').mockRejectedValueOnce(new InterviewStorageError('Хранилище недоступно', 503))
    try {
      const result = await interviewRoute(new Request(`http://lms.test/api/interviews/${doc.id}/stream`, { headers: { Authorization: `JWT ${jwt}` } }), 'stream', doc.id)
      expect(result.status).toBe(503)
      expect(await result.json()).toEqual({ error: 'Хранилище недоступно' })
    } finally { failing.mockRestore() }
  })
  it('загрузка создаёт только собственную запись; браузеру возвращается локальный URL', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    // Use another fresh owner because the pagination fixture already has many records.
    const fresh = await createStudent(payload)
    const result = await beginInterviewUpload(payload, fresh, uploadInput({ directionId: direction, title: 'Мой React', size: 1024, mimeType: 'video/mp4', fileName: 'interview.mp4' }))
    ownedIds.push(result.id)
    expect(result.uploadHref).toBe(`/api/interviews/${result.id}/upload`)
    expect(mocks.createUpload).toHaveBeenCalledWith(expect.objectContaining({ ownerId: fresh.id, recordingId: result.id }))
    expect((await completeInterviewUpload(payload, fresh, result.id)).status).toBe('ready')
    expect(mocks.finishUpload).toHaveBeenCalledWith(expect.objectContaining({ expectedSize: 1024 }))
    await expect(completeInterviewUpload(payload, other, result.id)).rejects.toMatchObject({ status: 404 })
  })
  it('отказ хранилища компенсирует DB row, а отказ удаления сохраняет запись для повторения', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', 'test-not-real')
    const fresh = await createStudent(payload)
    mocks.createUpload.mockRejectedValueOnce(new Error('storage'))
    await expect(beginInterviewUpload(payload, fresh, uploadInput({ directionId: direction, title: 'Сбой', size: 1024, fileName: 'clip.mp4' }))).rejects.toThrow('storage')
    expect((await payload.count({ collection: 'interview-recordings', where: { owner: { equals: fresh.id } } })).totalDocs).toBe(0)
    const doc = await recording(fresh)
    mocks.removePrivateFile.mockRejectedValueOnce(new Error('storage'))
    await expect(deleteInterviewRecording(payload, fresh, doc.id)).rejects.toThrow('storage')
    expect((await accessibleRecording(payload, fresh, doc.id)).id).toBe(doc.id)
  })
  it('повторные параллельные клики ставят один анализ; чужие и общие записи нельзя анализировать', async () => {
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    const results = await Promise.all([queueInterviewAnalysis(payload, fresh, doc.id, analysisInput), queueInterviewAnalysis(payload, fresh, doc.id, analysisInput)])
    expect(results.every((r) => r.analysisStatus === 'queued')).toBe(true)
    expect((await payload.findByID({ collection: 'interview-recordings', id: doc.id })).analysisAttempts).toBe(1)
    await expect(queueInterviewAnalysis(payload, other, doc.id, analysisInput)).rejects.toMatchObject({ status: 404 })
    const shared = await recording(fresh, 'ready', 'mentor')
    await expect(queueInterviewAnalysis(payload, fresh, shared.id, analysisInput)).rejects.toMatchObject({ status: 404 })
    const uploading = await recording(fresh, 'uploading')
    await expect(queueInterviewAnalysis(payload, fresh, uploading.id, analysisInput)).rejects.toMatchObject({ status: 409 })
    await expect(deleteInterviewRecording(payload, fresh, doc.id)).rejects.toMatchObject({ status: 409 })
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed' } })
  })
  it('два воркера создают одну оценку, сохраняют контекст и полный семантический отчёт', async () => {
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, analysisInput)
    const queued = await payload.findByID({ collection: 'interview-recordings', id: doc.id })
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    mocks.createInterviewAnalysis.mockImplementationOnce(async (_ownerId, id) => { await gate; return { id, status: 'queued', progress: 'Ожидает' } })
    const first = runInterviewAnalysisJobs(payload)
    await vi.waitFor(() => expect(mocks.createInterviewAnalysis).toHaveBeenCalledTimes(1))
    expect(await runInterviewAnalysisJobs(payload)).toEqual({ skipped: true })
    release()
    expect(await first).toMatchObject({ pending: 1 })
    expect(mocks.createInterviewAnalysis).toHaveBeenCalledWith(fresh.id, queued.analysisRemoteKey, expect.stringContaining(`/interviews/${doc.id}/`), { ...interviewContext, direction: expect.any(String) }, expect.any(AbortSignal))
    await expireLease(doc.id)
    mocks.getInterviewAnalysis.mockResolvedValueOnce({ id: queued.analysisRemoteKey ?? '', status: 'completed', progress: 'Готово', report: interviewResult })
    expect(await runInterviewAnalysisJobs(payload)).toMatchObject({ completed: 1 })
    expect(mocks.createInterviewAnalysis).toHaveBeenCalledTimes(1)
    const stored = await payload.findByID({ collection: 'interview-recordings', id: doc.id })
    expect(stored.analysisReport).toEqual(interviewResult)
    expect(stored.analysisScore).toEqual(interviewResult.score)
    const details = await getInterviewDetails(payload, fresh, doc.id)
    expect(details.analysis).toMatchObject({ provider: 'sovetnik', report: interviewResult, context: { targetGrade: 'middle', vacancyText: analysisInput.vacancyText, interviewFormat: 'mixed' } })
    expect(JSON.stringify(details)).not.toContain(queued.analysisRemoteKey)
    await expect(getInterviewDetails(payload, other, doc.id)).rejects.toMatchObject({ status: 404 })
  })
  it('удаление записей не сбрасывает суточный лимит анализов', async () => {
    const fresh = await createStudent(payload)
    for (let i = 0; i < 3; i++) {
      const doc = await recording(fresh)
      await queueInterviewAnalysis(payload, fresh, doc.id, analysisInput)
      await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed' } })
      await deleteInterviewRecording(payload, fresh, doc.id)
    }
    const next = await recording(fresh)
    await expect(queueInterviewAnalysis(payload, fresh, next.id, analysisInput)).rejects.toMatchObject({ status: 429 })
    expect((await payload.find({ collection: 'interview-analysis-usage', where: { owner: { equals: fresh.id } } })).docs[0].requests).toBe(3)
  })
  it('после рестарта опрашивает известную задачу без повторной отправки видео', async () => {
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, analysisInput)
    const latest = await payload.findByID({ collection: 'interview-recordings', id: doc.id })
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'processing', analysisRemoteJobId: latest.analysisRemoteKey, analysisLeaseUntil: new Date(Date.now() - 1000).toISOString() } })
    expect(await runInterviewAnalysisJobs(payload)).toMatchObject({ pending: 1 })
    expect(mocks.createInterviewAnalysis).not.toHaveBeenCalled()
    expect(mocks.getInterviewAnalysis).toHaveBeenCalledWith(fresh.id, latest.analysisRemoteKey, expect.any(AbortSignal))
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed' } })
  })
  it('потерянный ответ POST повторяет ту же UUID и подписанный источник, не тратит новую попытку', async () => {
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, analysisInput)
    mocks.createInterviewAnalysis.mockRejectedValueOnce(new InterviewAnalysisClientError('Нет ответа', 502, true))
    expect(await runInterviewAnalysisJobs(payload)).toMatchObject({ pending: 1 })
    const original = mocks.createInterviewAnalysis.mock.calls[0]
    await expireLease(doc.id)
    expect(await runInterviewAnalysisJobs(payload)).toMatchObject({ pending: 1 })
    expect(mocks.createInterviewAnalysis.mock.calls[1].slice(0, 4)).toEqual(original.slice(0, 4))
    const latest = await payload.findByID({ collection: 'interview-recordings', id: doc.id })
    expect(latest.analysisRemoteJobId).toBe(original[1])
    expect(latest.analysisAttempts).toBe(1)
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed' } })
  })
  it('подписанный источник ограничен записью/владельцем/попыткой и отзывается после окончания', async () => {
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, analysisInput)
    const latest = await payload.findByID({ collection: 'interview-recordings', id: doc.id, depth: 0 })
    const source = new URL(createInterviewSource(latest))
    const context = { params: Promise.resolve({ id: String(doc.id), file: interviewSourceFilename(latest) }) }
    const stream = vi.spyOn(media, 'streamRecordingMedia').mockResolvedValue(new Response('video'))
    try {
      expect((await sourceGET(new Request(source), context)).status).toBe(200)
      source.searchParams.set('token', '0'.repeat(64))
      expect((await sourceGET(new Request(source), context)).status).toBe(404)
      source.searchParams.set('token', new URL(createInterviewSource(latest)).searchParams.get('token') ?? '')
      await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'completed' } })
      expect((await sourceGET(new Request(source), context)).status).toBe(404)
    } finally { stream.mockRestore() }
  })
  it('повтор сначала удаляет прежнюю задачу, отказ сервиса сохраняет связь и попытку', async () => {
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, analysisInput)
    const queued = await payload.findByID({ collection: 'interview-recordings', id: doc.id })
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed', analysisRemoteJobId: queued.analysisRemoteKey } })
    mocks.deleteInterviewAnalysis.mockRejectedValueOnce(new Error('busy'))
    await expect(queueInterviewAnalysis(payload, fresh, doc.id, analysisInput)).rejects.toThrow('busy')
    const failed = await payload.findByID({ collection: 'interview-recordings', id: doc.id })
    expect(failed.analysisRemoteJobId).toBe(queued.analysisRemoteKey)
    expect(failed.analysisAttempts).toBe(1)
    await queueInterviewAnalysis(payload, fresh, doc.id, analysisInput)
    expect(mocks.deleteInterviewAnalysis).toHaveBeenLastCalledWith(fresh.id, queued.analysisRemoteKey)
    const latest = await payload.findByID({ collection: 'interview-recordings', id: doc.id })
    expect(latest.analysisRemoteJobId).toBeNull()
    expect(latest.analysisRemoteKey).not.toBe(queued.analysisRemoteKey)
    expect(latest.analysisAttempts).toBe(2)
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed' } })
  })
  it('удаление после неопределённой отправки удаляет задачу по сохранённой UUID', async () => {
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, analysisInput)
    const failed = await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed', analysisSubmissionStartedAt: new Date().toISOString() } })
    await deleteInterviewRecording(payload, fresh, doc.id)
    expect(mocks.deleteInterviewAnalysis).toHaveBeenCalledWith(fresh.id, failed.analysisRemoteKey)
  })
  it('сохранённый отчёт доступен только владельцу даже при отключении сервиса оценки', async () => {
    const doc = await recording()
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'completed', analysisBackend: 'sovetnik', analysisInput: { ...analysisInput, direction: interviewContext.direction }, analysisReport: interviewResult } })
    mocks.isInterviewAnalysisConfigured.mockReturnValue(false)
    const jwt = await login(payload, student)
    const response = await interviewRoute(new Request(`http://lms.test/api/interviews/${doc.id}/report`, { headers: { Authorization: `JWT ${jwt}` } }), 'report', doc.id)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-disposition')).toContain('attachment;')
    expect(await response.json()).toMatchObject({ provider: 'sovetnik', report: interviewResult })
    for (const user of [other, admin]) {
      const token = await login(payload, user)
      expect((await interviewRoute(new Request(`http://lms.test/api/interviews/${doc.id}/report`, { headers: { Authorization: `JWT ${token}` } }), 'report', doc.id)).status).toBe(404)
    }
    expect(mocks.getInterviewAnalysis).not.toHaveBeenCalled()
    expect(mocks.createInterviewAnalysis).not.toHaveBeenCalled()
  })
  it('повреждённый или старый фрод-отчёт не выдаётся за оценку качества ответов', async () => {
    const doc = await recording()
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'completed', analysisBackend: 'sovetnik', analysisReport: { duration_s: 10, episodes: [] } } })
    expect((await getInterviewDetails(payload, student, doc.id)).analysis).toBeNull()
    const jwt = await login(payload, student)
    expect((await interviewRoute(new Request(`http://lms.test/api/interviews/${doc.id}/report`, { headers: { Authorization: `JWT ${jwt}` } }), 'report', doc.id)).status).toBe(409)
  })
})
