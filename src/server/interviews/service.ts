import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, initTransaction, commitTransaction, killTransaction, type Payload, type PayloadRequest, type Where } from 'payload'
import type { InterviewDirection, InterviewRecording, User } from '@/payload-types'
import { relationId } from '@/lib/relation-id'
import { collectAllPages } from '@/lib/paginate'
import { MAX_RECORDING_BYTES, type InterviewDirectionDTO, type InterviewListDTO, type InterviewRecordingDTO, type RecordingCategory } from '@/lib/interviews/types'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { createUpload, finishUpload, removePrivateFile, fetchSharedRecordings } from '@/server/interviews/disk'
import { isInterviewAnalysisConfigured } from '@/server/interviews/analyzer'
import type { InterviewCriterion, InterviewReport, InterviewScore } from '@/lib/interviews/analysis/types'

export class InterviewLibraryError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
type TransactionAdapter = { sessions: Record<string | number, { db: Executor } | undefined> }
export async function interviewTransaction<T>(payload: Payload, key: number, operation: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({}, payload)
  await initTransaction(req)
  try {
    const id = await req.transactionID
    const db = id === undefined ? undefined : (payload.db as unknown as TransactionAdapter).sessions[id]?.db
    if (!db) throw new Error('Interview writes require a transaction')
    await db.execute(sql`select pg_advisory_xact_lock(7211, ${key})`)
    const result = await operation(req)
    await commitTransaction(req)
    return result
  } catch (error) { await killTransaction(req); throw error }
}

export function assertInterviewUser(user: User): void {
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new InterviewLibraryError('Войдите в аккаунт', 401)
}
export function isOwnRecording(recording: Pick<InterviewRecording, 'category' | 'owner'>, user: User): boolean {
  return recording.category === 'personal' && relationId(recording.owner) === user.id
}
export async function accessibleRecording(payload: Payload, user: User, id: number, ownOnly = false, req?: PayloadRequest): Promise<InterviewRecording> {
  assertInterviewUser(user)
  if (!Number.isSafeInteger(id) || id <= 0) throw new InterviewLibraryError('Запись не найдена', 404)
  const found = await payload.find({ collection: 'interview-recordings', where: { id: { equals: id } }, limit: 1, depth: 0, overrideAccess: true, req })
  const doc = found.docs[0]
  // Personal recordings are private even from the shared-library administrator.
  if (!doc || (doc.category === 'personal' ? !isOwnRecording(doc, user) : ownOnly || doc.status !== 'ready')) throw new InterviewLibraryError('Запись не найдена', 404)
  return doc
}

const directionDTO = (doc: InterviewDirection): InterviewDirectionDTO => ({ id: doc.id, slug: doc.slug, title: doc.title, description: doc.description ?? '' })
export function recordingDTO(doc: Pick<InterviewRecording, 'id' | 'title' | 'description' | 'category' | 'owner' | 'status' | 'size' | 'createdAt' | 'analysisStatus' | 'analysisProgress' | 'analysisError'>, direction: InterviewDirectionDTO, user: User): InterviewRecordingDTO {
  return { id: doc.id, title: doc.title, description: doc.description ?? '', direction, category: doc.category, status: doc.status, size: doc.size, createdAt: doc.createdAt, isOwner: isOwnRecording(doc, user), analysisStatus: doc.analysisStatus, analysisProgress: doc.analysisProgress ?? '', analysisError: doc.analysisError ?? '' }
}
async function directions(payload: Payload): Promise<InterviewDirection[]> {
  return collectAllPages(({ page, limit }) => payload.find({ collection: 'interview-directions', sort: ['order', 'id'], depth: 0, overrideAccess: true, page, limit }), { label: 'Направления собеседований' })
}
export async function getInterviewLibrary(payload: Payload, user: User, params: { direction?: string; category?: string; page?: number | string; search?: string } = {}): Promise<InterviewListDTO> {
  assertInterviewUser(user)
  const tracks = await directions(payload)
  const selected = tracks.find((d) => d.slug === params.direction) ?? tracks[0]
  const category: RecordingCategory = params.category === 'community' || params.category === 'personal' ? params.category : 'mentor'
  const page = Math.max(1, Math.min(10000, Number(params.page) || 1))
  const conditions: Where[] = [{ category: { equals: category } }]
  if (selected) conditions.push({ direction: { equals: selected.id } })
  else conditions.push({ id: { equals: -1 } })
  if (category === 'personal') conditions.push({ owner: { equals: user.id } })
  else conditions.push({ status: { equals: 'ready' } })
  if (params.search?.trim()) conditions.push({ title: { contains: params.search.trim().slice(0, 100) } })
  const [found, policy] = await Promise.all([
    payload.find({ collection: 'interview-recordings', where: { and: conditions }, select: { title: true, description: true, direction: true, category: true, owner: true, status: true, size: true, createdAt: true, analysisStatus: true, analysisProgress: true, analysisError: true }, sort: '-createdAt', depth: 0, overrideAccess: true, page: Math.floor(page), limit: 12 }),
    getAuthoritativeLearningPolicy(payload, user.id),
  ])
  const dtos = tracks.map(directionDTO)
  return { directions: dtos, recordings: found.docs.flatMap((doc) => { const track = dtos.find((d) => d.id === relationId(doc.direction)); return track ? [recordingDTO(doc, track, user)] : [] }), page: found.page ?? 1, totalPages: found.totalPages, totalDocs: found.totalDocs, uploadAvailable: Boolean(process.env.YANDEX_DISK_TOKEN), analysisAvailable: isInterviewAnalysisConfigured(), isAdmin: policy.role === 'admin' }
}
export async function getInterviewDetails(payload: Payload, user: User, id: number) {
  const doc = await accessibleRecording(payload, user, id)
  const track = await payload.findByID({ collection: 'interview-directions', id: relationId(doc.direction) ?? -1, depth: 0, overrideAccess: true })
  const analysis = isOwnRecording(doc, user) && doc.analysisStatus === 'completed' && doc.analysisReport && doc.analysisScore
    ? { report: doc.analysisReport as unknown as InterviewReport, score: doc.analysisScore as unknown as InterviewScore, criteria: doc.analysisCriteria as unknown as InterviewCriterion[], transcript: doc.analysisTranscript ?? '', model: doc.analysisModel ?? '' } : null
  return { recording: recordingDTO(doc, directionDTO(track), user), analysis, analysisAvailable: isInterviewAnalysisConfigured() }
}

export function uploadInput(value: unknown) {
  if (!value || typeof value !== 'object') throw new InterviewLibraryError('Укажите данные записи')
  const d = value as Record<string, unknown>
  const title = typeof d.title === 'string' ? d.title.trim() : ''
  const fileName = typeof d.fileName === 'string' ? d.fileName : ''
  const extension = fileName.toLowerCase().split('.').pop() ?? ''
  const types: Record<string, string[]> = { mp4: ['video/mp4'], webm: ['video/webm'], mov: ['video/quicktime'], mkv: ['video/x-matroska'] }
  const mimeType = typeof d.mimeType === 'string' && d.mimeType ? d.mimeType : types[extension]?.[0]
  if (!title || title.length > 200 || !Number.isSafeInteger(d.directionId)) throw new InterviewLibraryError('Укажите название и направление')
  if (!Number.isSafeInteger(d.size) || typeof d.size !== 'number' || d.size <= 0 || d.size > MAX_RECORDING_BYTES) throw new InterviewLibraryError('Выберите видео размером до 2 ГБ', 413)
  if (!mimeType || !types[extension]?.includes(mimeType)) throw new InterviewLibraryError('Поддерживаются MP4, WebM, MOV и MKV')
  if (d.description !== undefined && (typeof d.description !== 'string' || d.description.length > 2000)) throw new InterviewLibraryError('Описание должно быть короче 2000 символов')
  return { title, directionId: d.directionId as number, size: d.size, mimeType, extension, description: typeof d.description === 'string' ? d.description.trim() : '' }
}
export async function beginInterviewUpload(payload: Payload, user: User, input: ReturnType<typeof uploadInput>) {
  assertInterviewUser(user)
  if (!process.env.YANDEX_DISK_TOKEN) throw new InterviewLibraryError('Загрузка записей временно недоступна', 503)
  const track = await payload.find({ collection: 'interview-directions', where: { id: { equals: input.directionId } }, limit: 1, depth: 0, overrideAccess: true })
  if (!track.docs.length) throw new InterviewLibraryError('Направление не найдено', 404)
  const doc = await interviewTransaction(payload, user.id, async (req) => {
    const previous = await collectAllPages(({ page, limit }) => payload.find({ collection: 'interview-recordings', where: { owner: { equals: user.id } }, select: { size: true }, req, depth: 0, overrideAccess: true, page, limit }), { label: 'Лимит личных записей' })
    if (previous.length >= 20 || previous.reduce((total, row) => total + row.size, 0) + input.size > 10 * 1024 ** 3) throw new InterviewLibraryError('Достигнут лимит: 20 записей или 10 ГБ. Удалите ненужные записи', 429)
    return payload.create({ collection: 'interview-recordings', data: { title: input.title, description: input.description, direction: input.directionId, category: 'personal', owner: user.id, status: 'uploading', size: input.size, mimeType: input.mimeType, analysisStatus: 'idle' }, req, overrideAccess: true, depth: 0 })
  })
  try {
    const upload = await createUpload({ ownerId: user.id, recordingId: doc.id, size: input.size, mimeType: input.mimeType, extension: input.extension })
    await payload.update({ collection: 'interview-recordings', id: doc.id, data: { diskPath: upload.diskPath }, overrideAccess: true, depth: 0 })
    return { id: doc.id, uploadHref: `/api/interviews/${doc.id}/upload` }
  } catch (error) {
    await payload.delete({ collection: 'interview-recordings', id: doc.id, overrideAccess: true })
    throw error
  }
}
export async function claimInterviewUpload(payload: Payload, user: User, id: number) {
  return interviewTransaction(payload, user.id, async (req) => {
    const doc = await accessibleRecording(payload, user, id, true, req)
    if (doc.status !== 'uploading' || !doc.diskPath) throw new InterviewLibraryError('Запись уже загружена или недоступна', 409)
    if (doc.uploadLeaseUntil && Date.parse(doc.uploadLeaseUntil) > Date.now()) throw new InterviewLibraryError('Загрузка этой записи уже идёт', 409)
    const claim = randomUUID()
    await payload.update({ collection: 'interview-recordings', id, data: { uploadClaim: claim, uploadLeaseUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }, req, overrideAccess: true })
    return { doc, claim }
  })
}
export async function releaseInterviewUpload(payload: Payload, user: User, id: number, claim: string) {
  await interviewTransaction(payload, user.id, async (req) => {
    const doc = await accessibleRecording(payload, user, id, true, req)
    if (doc.uploadClaim === claim) await payload.update({ collection: 'interview-recordings', id, data: { uploadClaim: null, uploadLeaseUntil: null }, req, overrideAccess: true })
  })
}
export async function completeInterviewUpload(payload: Payload, user: User, id: number) {
  const doc = await accessibleRecording(payload, user, id, true)
  if (doc.status === 'ready') return (await getInterviewDetails(payload, user, id)).recording
  if (!doc.diskPath || doc.uploadLeaseUntil && Date.parse(doc.uploadLeaseUntil) > Date.now()) throw new InterviewLibraryError('Дождитесь завершения загрузки', 409)
  const metadata = await finishUpload({ diskPath: doc.diskPath, expectedSize: doc.size, expectedMime: doc.mimeType ?? undefined })
  await interviewTransaction(payload, user.id, async (req) => {
    const latest = await accessibleRecording(payload, user, id, true, req)
    if (latest.uploadLeaseUntil && Date.parse(latest.uploadLeaseUntil) > Date.now()) throw new InterviewLibraryError('Дождитесь завершения загрузки', 409)
    await payload.update({ collection: 'interview-recordings', id, data: { status: 'ready', size: metadata.size, mimeType: metadata.mimeType }, overrideAccess: true, req })
  })
  return (await getInterviewDetails(payload, user, id)).recording
}
export async function deleteInterviewRecording(payload: Payload, user: User, id: number) {
  await interviewTransaction(payload, user.id, async (req) => {
    const doc = await accessibleRecording(payload, user, id, true, req)
    if (doc.analysisStatus === 'queued' || doc.analysisStatus === 'processing') throw new InterviewLibraryError('Дождитесь завершения анализа', 409)
    if (doc.uploadLeaseUntil && Date.parse(doc.uploadLeaseUntil) > Date.now()) throw new InterviewLibraryError('Остановите загрузку и дождитесь её завершения', 409)
    // Keep the row if storage deletion fails, so students can retry without orphaning their file.
    if (doc.diskPath) await removePrivateFile(doc.diskPath)
    await payload.delete({ collection: 'interview-recordings', id, req, overrideAccess: true })
  })
  return { deleted: true }
}
export function analysisInput(value: unknown) {
  const d = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const text = (name: string, max: number) => { const v = d[name]; if (v !== undefined && (typeof v !== 'string' || v.length > max)) throw new InterviewLibraryError('Слишком длинные или некорректные данные анализа'); return typeof v === 'string' ? v.trim() : '' }
  return { candidateName: text('candidateName', 100), candidateSpeaker: text('candidateSpeaker', 100), vacancyText: text('vacancyText', 20000) }
}
export async function queueInterviewAnalysis(payload: Payload, user: User, id: number, input: ReturnType<typeof analysisInput>) {
  if (!isInterviewAnalysisConfigured()) throw new InterviewLibraryError('Анализ записей временно недоступен', 503)
  return interviewTransaction(payload, user.id, async (req) => {
    const doc = await accessibleRecording(payload, user, id, true, req)
    if (doc.status !== 'ready') throw new InterviewLibraryError('Сначала загрузите видео полностью', 409)
    if (doc.analysisStatus === 'queued' || doc.analysisStatus === 'processing') return { analysisStatus: doc.analysisStatus }
    if (doc.analysisStatus === 'completed') throw new InterviewLibraryError('Эта запись уже проанализирована', 409)
    const day = new Date().toISOString().slice(0, 10)
    const usage = await payload.find({ collection: 'interview-analysis-usage', where: { owner: { equals: user.id } }, limit: 1, depth: 0, req, overrideAccess: true })
    const row = usage.docs[0]
    const used = row?.day === day ? row.requests : 0
    if (used >= 3 || (doc.analysisAttempts ?? 0) >= 3) throw new InterviewLibraryError('Лимит анализа: 3 запуска в сутки и 3 попытки на запись', 429)
    if (row) await payload.update({ collection: 'interview-analysis-usage', id: row.id, data: { day, requests: used + 1 }, req, overrideAccess: true })
    else await payload.create({ collection: 'interview-analysis-usage', data: { owner: user.id, day, requests: 1 }, req, overrideAccess: true })
    await payload.update({ collection: 'interview-recordings', id, data: { analysisStatus: 'queued', analysisProgress: 'Ожидает анализа', analysisError: null, analysisInput: input, analysisRequestedAt: new Date().toISOString(), analysisAttempts: (doc.analysisAttempts ?? 0) + 1 }, req, overrideAccess: true })
    return { analysisStatus: 'queued' as const }
  })
}
export async function importInterviewSources(payload: Payload, user: User) {
  assertInterviewUser(user)
  if ((await getAuthoritativeLearningPolicy(payload, user.id)).role !== 'admin') throw new InterviewLibraryError('Доступ запрещён', 403)
  const files = await fetchSharedRecordings()
  const tracks = await directions(payload)
  return interviewTransaction(payload, -2, async (req) => {
    let created = 0
    let updated = 0
    for (const file of files) {
      const track = tracks.find((d) => d.slug === file.directionSlug)
      if (!track) continue
      const sourceKey = createHash('sha256').update(JSON.stringify([file.publicKey, file.publicPath])).digest('hex')
      const old = await payload.find({ collection: 'interview-recordings', where: { sourceKey: { equals: sourceKey } }, req, depth: 0, limit: 1, overrideAccess: true })
      const data = { title: file.title, direction: track.id, category: file.category, publicKey: file.publicKey, publicPath: file.publicPath, sourceKey, size: file.size, mimeType: file.mimeType, status: 'ready' as const, analysisStatus: 'idle' as const }
      if (old.docs[0]) { await payload.update({ collection: 'interview-recordings', id: old.docs[0].id, data, req, overrideAccess: true }); updated++ }
      else { await payload.create({ collection: 'interview-recordings', data, req, overrideAccess: true }); created++ }
    }
    return { created, updated }
  })
}
