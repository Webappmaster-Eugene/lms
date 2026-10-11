import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { createLocalReq } from 'payload'
import { createStudent, createAdmin, getTestPayload, login, type TestUser } from '../helpers/payload'
import { accessibleRecording, beginInterviewUpload, completeInterviewUpload, deleteInterviewRecording, getInterviewDetails, getInterviewLibrary, queueInterviewAnalysis, uploadInput } from '@/server/interviews/service'
import { interviewRoute } from '@/server/interviews/route'
import * as media from '@/server/interviews/media'
import { InterviewStorageError } from '@/server/interviews/disk'
import { createCheckfrodSource, checkfrodSourceFilename } from '@/server/interviews/capability'
import { GET as sourceGET } from '@/app/api/internal/interviews/[id]/[file]/route'
import { summarizeCheckfrodReport } from '@/server/interviews/checkfrod-client'
import { runInterviewAnalysisJobs } from '@/server/interviews/jobs'

const mocks = vi.hoisted(() => ({
  createUpload: vi.fn(async ({ ownerId, recordingId }: { ownerId: number; recordingId: number }) => ({ diskPath: `disk:/LMS interviews/${ownerId}/${recordingId}-12345678-1234-4123-8123-123456789012.mp4`, uploadHref: 'https://signed-secret.test/upload' })),
  finishUpload: vi.fn(async () => ({ size: 1024, mimeType: 'video/mp4' })),
  removePrivateFile: vi.fn(async () => {}),
  resolveRecordingHref: vi.fn(async () => 'https://downloader.disk.yandex.ru/private-capability'),
  createCheckfrodImport: vi.fn(async () => 'remote-job'),
  getCheckfrodJob: vi.fn(async () => ({ id: 'remote-job', status: 'queued', phase: 'queued', progress: 0, episodes: null, duration: null, gaze: null, error: null })),
  getCheckfrodReport: vi.fn(async () => ({ duration_s: 120, episodes: [{ confidence: 'high' }, { confidence: 'info' }], quality: { gaze: 'head_only' }, attention: { head_only_s: 120, moments: [] } })),
  listCheckfrodJobs: vi.fn(async () => [] as { id: string; filename: string; status: string }[]),
  getCheckfrodReportLink: vi.fn(async () => ({ url: 'https://checkfrod.nadtocheev.ru/r/r1.fixture.signature', expiresInS: 86400 })),
  deleteCheckfrodJob: vi.fn(async () => {}),
}))
vi.mock('@/server/interviews/disk', () => ({ ...mocks, InterviewStorageError: class extends Error { constructor(message: string, readonly statusCode = 502) { super(message) } }, fetchSharedRecordings: vi.fn(async () => []), uploadPrivateFile: vi.fn() }))
vi.mock('@/server/interviews/checkfrod-client', async (actual) => ({ ...await actual<typeof import('@/server/interviews/checkfrod-client')>(), ...mocks, isCheckfrodConfigured: () => true }))
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
afterEach(async () => { vi.unstubAllEnvs(); vi.clearAllMocks() })
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
    const results = await Promise.all([queueInterviewAnalysis(payload, fresh, doc.id, { consent: true, roiSpec: 'auto' }), queueInterviewAnalysis(payload, fresh, doc.id, { consent: true, roiSpec: 'auto' })])
    expect(results.every((r) => r.analysisStatus === 'queued')).toBe(true)
    expect((await payload.findByID({ collection: 'interview-recordings', id: doc.id })).analysisAttempts).toBe(1)
    await expect(queueInterviewAnalysis(payload, other, doc.id, { consent: true, roiSpec: 'auto' })).rejects.toMatchObject({ status: 404 })
    await expect(deleteInterviewRecording(payload, fresh, doc.id)).rejects.toMatchObject({ status: 409 })
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed' } })
  })
  it('два воркера не создают два разбора; прогресс и готовый отчёт получаются из Checkfrod', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru')
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, { consent: true, roiSpec: 'auto' })
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    mocks.getCheckfrodJob.mockImplementationOnce(async () => { await gate; return { id: 'remote-job', status: 'queued', phase: 'queued', progress: 0, episodes: null, duration: null, gaze: null, error: null } })
    const first = runInterviewAnalysisJobs(payload)
    await vi.waitFor(() => expect(mocks.getCheckfrodJob).toHaveBeenCalledTimes(1))
    expect(await runInterviewAnalysisJobs(payload)).toEqual({ skipped: true })
    release()
    expect(await first).toMatchObject({ pending: 1 })
    expect(mocks.createCheckfrodImport).toHaveBeenCalledTimes(1)
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisLeaseUntil: new Date(Date.now() - 1000).toISOString() } })
    mocks.getCheckfrodJob.mockResolvedValueOnce({ id: 'remote-job', status: 'done', phase: 'done', progress: 1, episodes: null, duration: null, gaze: null, error: null })
    expect(await runInterviewAnalysisJobs(payload)).toMatchObject({ completed: 1 })
    expect(mocks.createCheckfrodImport).toHaveBeenCalledTimes(1)
    const details = await getInterviewDetails(payload, fresh, doc.id)
    expect(details.analysis).toMatchObject({ provider: 'checkfrod', summary: { durationS: 120, episodes: 1, gaze: 'head_only' } })
    expect(JSON.stringify(details)).not.toContain('remote-job')
    await expect(getInterviewDetails(payload, other, doc.id)).rejects.toMatchObject({ status: 404 })
  })
  it('удаление записей не сбрасывает суточный лимит платных анализов', async () => {
    const fresh = await createStudent(payload)
    for (let i = 0; i < 3; i++) {
      const doc = await recording(fresh)
      await queueInterviewAnalysis(payload, fresh, doc.id, { consent: true, roiSpec: 'auto' })
      await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed' } })
      await deleteInterviewRecording(payload, fresh, doc.id)
    }
    const next = await recording(fresh)
    await expect(queueInterviewAnalysis(payload, fresh, next.id, { consent: true, roiSpec: 'auto' })).rejects.toMatchObject({ status: 429 })
    expect((await payload.find({ collection: 'interview-analysis-usage', where: { owner: { equals: fresh.id } } })).docs[0].requests).toBe(3)
  })
  it('после рестарта продолжает известную задачу Checkfrod без повторного POST', async () => {
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, { consent: true, roiSpec: 'auto' })
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'processing', analysisRemoteJobId: 'known-job', analysisLeaseUntil: new Date(Date.now() - 1000).toISOString() } })
    expect(await runInterviewAnalysisJobs(payload)).toMatchObject({ pending: 1 })
    expect(mocks.createCheckfrodImport).not.toHaveBeenCalled()
    expect(mocks.getCheckfrodJob).toHaveBeenCalledWith(fresh.id, 'known-job', expect.any(AbortSignal))
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed' } })
  })
  it('потерянный ответ создания восстанавливает remoteId по имени источника без второго POST', async () => {
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, { consent: true, roiSpec: 'auto' })
    const latest = await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisSubmissionStartedAt: new Date().toISOString() } })
    mocks.listCheckfrodJobs.mockResolvedValueOnce([{ id: 'recovered-job', filename: checkfrodSourceFilename(latest), status: 'queued' }])
    expect(await runInterviewAnalysisJobs(payload)).toMatchObject({ pending: 1 })
    expect(mocks.createCheckfrodImport).not.toHaveBeenCalled()
    expect((await payload.findByID({ collection: 'interview-recordings', id: doc.id })).analysisRemoteJobId).toBe('recovered-job')
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed' } })
  })
  it('подписанный источник ограничен записью/владельцем/попыткой и отзывается после окончания', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru')
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, { consent: true, roiSpec: 'auto' })
    const latest = await payload.findByID({ collection: 'interview-recordings', id: doc.id, depth: 0 })
    const source = new URL(createCheckfrodSource(latest))
    const context = { params: Promise.resolve({ id: String(doc.id), file: checkfrodSourceFilename(latest) }) }
    const stream = vi.spyOn(media, 'streamRecordingMedia').mockResolvedValue(new Response('video'))
    try {
      expect((await sourceGET(new Request(source), context)).status).toBe(200)
      source.searchParams.set('token', '0'.repeat(64))
      expect((await sourceGET(new Request(source), context)).status).toBe(404)
      source.searchParams.set('token', new URL(createCheckfrodSource(latest)).searchParams.get('token') ?? '')
      await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'completed' } })
      expect((await sourceGET(new Request(source), context)).status).toBe(404)
    } finally { stream.mockRestore() }
  })
  it('повтор сначала удаляет прежнюю задачу, а отказ сервиса сохраняет связь и попытку', async () => {
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, { consent: true, roiSpec: 'auto' })
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed', analysisRemoteJobId: 'previous-job' } })
    mocks.deleteCheckfrodJob.mockRejectedValueOnce(new Error('busy'))
    await expect(queueInterviewAnalysis(payload, fresh, doc.id, { consent: true, roiSpec: 'auto' })).rejects.toThrow('busy')
    expect((await payload.findByID({ collection: 'interview-recordings', id: doc.id })).analysisRemoteJobId).toBe('previous-job')
    await queueInterviewAnalysis(payload, fresh, doc.id, { consent: true, roiSpec: 'auto' })
    expect(mocks.deleteCheckfrodJob).toHaveBeenLastCalledWith(fresh.id, 'previous-job')
    const latest = await payload.findByID({ collection: 'interview-recordings', id: doc.id })
    expect(latest.analysisRemoteJobId).toBeNull()
    expect(latest.analysisAttempts).toBe(2)
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed' } })
  })
  it('удаление после неопределённой отправки находит и удаляет приватную внешнюю задачу', async () => {
    const fresh = await createStudent(payload)
    const doc = await recording(fresh)
    await queueInterviewAnalysis(payload, fresh, doc.id, { consent: true, roiSpec: 'auto' })
    const failed = await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'failed', analysisSubmissionStartedAt: new Date().toISOString() } })
    mocks.listCheckfrodJobs.mockResolvedValueOnce([{ id: 'unconfirmed-job', filename: checkfrodSourceFilename(failed), status: 'failed' }])
    await deleteInterviewRecording(payload, fresh, doc.id)
    expect(mocks.deleteCheckfrodJob).toHaveBeenCalledWith(fresh.id, 'unconfirmed-job')
  })
  it('оригинальный отчёт выдаётся новой ссылкой только владельцу', async () => {
    const doc = await recording()
    const report = await mocks.getCheckfrodReport()
    expect(summarizeCheckfrodReport(report).episodes).toBe(1)
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { analysisStatus: 'completed', analysisBackend: 'checkfrod', analysisRemoteJobId: 'report-job', analysisReport: report } })
    const jwt = await login(payload, student)
    const response = await interviewRoute(new Request(`http://lms.test/api/interviews/${doc.id}/report`, { headers: { Authorization: `JWT ${jwt}` } }), 'report', doc.id)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('https://checkfrod.nadtocheev.ru/r/')
    const otherJwt = await login(payload, other)
    expect((await interviewRoute(new Request(`http://lms.test/api/interviews/${doc.id}/report`, { headers: { Authorization: `JWT ${otherJwt}` } }), 'report', doc.id)).status).toBe(404)
    expect(mocks.getCheckfrodReportLink).toHaveBeenCalledTimes(1)
  })
})
