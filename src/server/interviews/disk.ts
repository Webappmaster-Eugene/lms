import 'server-only'

import { randomUUID } from 'node:crypto'
import { MAX_RECORDING_BYTES, type RecordingCategory } from '@/lib/interviews/types'
import { invalidateHref, resolveHref } from '@/lib/yandex-disk-href'
import { parsePublicResourceUrl } from '@/lib/yandex-disk-url'
import { safeLearningUpstream } from '@/server/learning-upstream'

const API = 'https://cloud-api.yandex.net/v1/disk'
const API_TIMEOUT_MS = 20000
const FORMATS: Record<string, string> = {
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
}
const SOURCE_FOLDERS = [
  { publicKey: 'https://disk.yandex.com/d/GnyK5icpAuUnnQ', category: 'mentor' },
  { publicKey: 'https://disk.yandex.com/d/OExQrM0fLW1APQ', category: 'community' },
] as const

export class InterviewStorageError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message)
    this.name = 'InterviewStorageError'
  }
}

export type RecordingSource = {
  diskPath?: string | null
  publicKey?: string | null
  publicPath?: string | null
}

type HrefEntry = { href: string; expiresAt: number }
const processState = globalThis as typeof globalThis & { __lmsInterviewDiskHrefs?: Map<string, HrefEntry> }
const privateHrefs = processState.__lmsInterviewDiskHrefs ??= new Map<string, HrefEntry>()

function rootPath(): string {
  const root = (process.env.YANDEX_INTERVIEWS_ROOT || 'disk:/LMS interviews').replace(/\/$/, '')
  if (!/^disk:\/[^\\]+$/.test(root) || root.length > 500 || Array.from(root).some((char) => char.charCodeAt(0) < 32) || root.slice(6).split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new InterviewStorageError('Некорректна настройка папки собеседований', 503)
  }
  return root
}

/** Only files reserved by this feature can be read, verified or removed. */
export function assertPrivateRecordingPath(diskPath: string): void {
  const prefix = `${rootPath()}/`
  if (!diskPath.startsWith(prefix) || !/^[1-9]\d*\/[1-9]\d*-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp4|webm|mov|mkv)$/.test(diskPath.slice(prefix.length))) {
    throw new InterviewStorageError('Некорректный путь записи', 400)
  }
}

export function recordingFormat(extension: string, mimeType: string): { extension: string; mimeType: string } {
  const normalized = extension.toLowerCase().replace(/^\./, '')
  const expected = FORMATS[normalized]
  const mime = mimeType.toLowerCase().split(';')[0].trim()
  if (!expected || (mime !== expected && mime !== 'application/octet-stream' && !(normalized === 'mkv' && mime === 'video/matroska'))) {
    throw new InterviewStorageError('Поддерживаются видео MP4, WebM, MOV и MKV', 400)
  }
  return { extension: normalized, mimeType: expected }
}

function sizeAllowed(size: number): void {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_RECORDING_BYTES) {
    throw new InterviewStorageError('Размер видео должен быть от 1 байта до 2 ГБ', 400)
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InterviewStorageError('Некорректный ответ Яндекс Диска')
  return value as Record<string, unknown>
}

async function apiRequest(endpoint: string, parameters: Record<string, string>, method = 'GET', signal?: AbortSignal, publicResource = false): Promise<Response> {
  const token = process.env.YANDEX_DISK_TOKEN?.trim()
  if (!publicResource && !token) throw new InterviewStorageError('Загрузка собеседований пока не настроена', 503)
  const url = new URL(`${API}/${endpoint}`)
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
  const deadline = AbortSignal.timeout(API_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method, headers: { Accept: 'application/json', ...(token ? { Authorization: `OAuth ${token}` } : {}) },
      cache: 'no-store', redirect: 'error', signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    })
  } catch {
    signal?.throwIfAborted()
    throw new InterviewStorageError(deadline.aborted ? 'Яндекс Диск не ответил вовремя. Повторите попытку' : 'Не удалось подключиться к Яндекс Диску', 502)
  }
}

async function requireSuccess(response: Response): Promise<void> {
  if (response.ok) return
  await response.body?.cancel()
  const status = response.status
  if (status === 404) throw new InterviewStorageError('Запись не найдена на Яндекс Диске', 404)
  if (status === 401 || status === 403) throw new InterviewStorageError('Доступ к хранилищу собеседований не настроен', 503)
  if (status === 507) throw new InterviewStorageError('В хранилище собеседований закончилось место', 503)
  throw new InterviewStorageError('Яндекс Диск временно недоступен. Повторите попытку позже', status === 429 ? 429 : 502)
}

async function metadata(diskPath: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await apiRequest('resources', { path: diskPath, fields: 'type,size,mime_type' }, 'GET', signal)
  await requireSuccess(response)
  return object(await response.json())
}

async function ensureFolder(path: string): Promise<void> {
  const response = await apiRequest('resources', { path }, 'PUT')
  if (response.status === 409) {
    await response.body?.cancel()
    const existing = await metadata(path)
    if (existing.type !== 'dir') throw new InterviewStorageError('Папка хранилища занята файлом', 503)
    return
  }
  await requireSuccess(response)
  await response.body?.cancel()
}

export function safeInterviewUploadHref(raw: string): URL {
  let url: URL
  try { url = new URL(raw) } catch { throw new InterviewStorageError('Некорректный адрес загрузки') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^uploader[a-z0-9-]+\.(?:disk|dst)\.yandex\.net$/.test(url.hostname) || !url.pathname.startsWith('/upload-target/')) {
    throw new InterviewStorageError('Некорректный адрес загрузки')
  }
  return url
}

async function uploadHref(diskPath: string, signal?: AbortSignal): Promise<string> {
  const response = await apiRequest('resources/upload', { path: diskPath, overwrite: 'false' }, 'GET', signal)
  await requireSuccess(response)
  const data = object(await response.json())
  if (typeof data.href !== 'string' || data.method !== 'PUT') throw new InterviewStorageError('Яндекс Диск не вернул адрес загрузки')
  return safeInterviewUploadHref(data.href).href
}

export async function createUpload(input: { ownerId: number; recordingId: number; size: number; mimeType: string; extension: string }): Promise<{ diskPath: string; uploadHref: string }> {
  sizeAllowed(input.size)
  if (![input.ownerId, input.recordingId].every((id) => Number.isSafeInteger(id) && id > 0)) throw new InterviewStorageError('Некорректный владелец записи', 400)
  const format = recordingFormat(input.extension, input.mimeType)
  const root = rootPath()
  const segments = root.slice('disk:/'.length).split('/')
  for (let index = 1; index <= segments.length; index++) await ensureFolder(`disk:/${segments.slice(0, index).join('/')}`)
  await ensureFolder(`${root}/${input.ownerId}`)
  const diskPath = `${root}/${input.ownerId}/${input.recordingId}-${randomUUID()}.${format.extension}`
  return { diskPath, uploadHref: await uploadHref(diskPath) }
}

/** Streams through our origin; neither OAuth nor a storage capability reaches the browser. */
export async function uploadPrivateFile(request: Request, input: { diskPath: string; expectedSize: number; mimeType: string }): Promise<void> {
  assertPrivateRecordingPath(input.diskPath)
  sizeAllowed(input.expectedSize)
  const format = recordingFormat(input.diskPath.split('.').at(-1) ?? '', input.mimeType)
  const declaredSize = request.headers.get('content-length')
  if (!request.body || (declaredSize !== null && (!/^\d+$/.test(declaredSize) || Number(declaredSize) !== input.expectedSize))) {
    throw new InterviewStorageError('Размер загружаемого видео изменился', 400)
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30 * 60 * 1000)])
  const href = await uploadHref(input.diskPath, signal)
  let uploadedBytes = 0
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      uploadedBytes += chunk.byteLength
      if (uploadedBytes > input.expectedSize) throw new InterviewStorageError('Размер загружаемого видео изменился', 400)
      controller.enqueue(chunk)
    },
    flush() {
      if (uploadedBytes !== input.expectedSize) throw new InterviewStorageError('Видео загружено не полностью. Повторите загрузку', 400)
    },
  }))
  const init: RequestInit & { duplex: 'half' } = {
    method: 'PUT', headers: { 'Content-Type': format.mimeType, 'Content-Length': String(input.expectedSize) },
    body, duplex: 'half', signal, redirect: 'error',
  }
  let response: Response
  try { response = await fetch(href, init) }
  catch (error) {
    if (error instanceof InterviewStorageError) throw error
    if (error instanceof Error && error.cause instanceof InterviewStorageError) throw error.cause
    request.signal.throwIfAborted()
    throw new InterviewStorageError('Не удалось загрузить видео. Повторите попытку', 502)
  }
  await requireSuccess(response)
  await response.body?.cancel()
  if (uploadedBytes !== input.expectedSize) throw new InterviewStorageError('Видео загружено не полностью. Повторите загрузку', 400)
}

export async function finishUpload(input: { diskPath: string; expectedSize: number; expectedMime?: string }): Promise<{ size: number; mimeType: string }> {
  assertPrivateRecordingPath(input.diskPath)
  sizeAllowed(input.expectedSize)
  const data = await metadata(input.diskPath)
  if (data.type !== 'file' || data.size !== input.expectedSize) throw new InterviewStorageError('Видео ещё не загружено полностью', 409)
  const format = recordingFormat(input.diskPath.split('.').at(-1) ?? '', typeof data.mime_type === 'string' ? data.mime_type : '')
  if (input.expectedMime && recordingFormat(format.extension, input.expectedMime).mimeType !== format.mimeType) throw new InterviewStorageError('Тип видео изменился при загрузке', 409)
  return { size: input.expectedSize, mimeType: format.mimeType }
}

export async function removePrivateFile(diskPath: string): Promise<void> {
  assertPrivateRecordingPath(diskPath)
  const signal = AbortSignal.timeout(20000)
  const response = await apiRequest('resources', { path: diskPath, permanently: 'true' }, 'DELETE', signal)
  if (response.status !== 404) await requireSuccess(response)
  if (response.status === 202) {
    const data = object(await response.json())
    let operation: URL
    try { operation = new URL(typeof data.href === 'string' ? data.href : '') }
    catch { throw new InterviewStorageError('Яндекс Диск не подтвердил удаление записи') }
    if (operation.protocol !== 'https:' || operation.hostname !== 'cloud-api.yandex.net' || operation.port || operation.username || operation.password || operation.search || !/^\/v1\/disk\/operations\/[a-zA-Z0-9_-]+$/.test(operation.pathname)) {
      throw new InterviewStorageError('Некорректный адрес проверки удаления записи')
    }
    let completed = false
    while (!completed) {
      if (signal.aborted) throw new InterviewStorageError('Удаление записи ещё не завершено. Повторите попытку позже', 503)
      let statusResponse: Response
      try { statusResponse = await apiRequest(operation.pathname.slice('/v1/disk/'.length), {}, 'GET', signal) }
      catch (error) {
        if (signal.aborted) throw new InterviewStorageError('Удаление записи ещё не завершено. Повторите попытку позже', 503)
        throw error
      }
      await requireSuccess(statusResponse)
      const status = object(await statusResponse.json()).status
      if (status === 'success') completed = true
      else if (status !== 'in-progress') throw new InterviewStorageError('Яндекс Диск не смог удалить запись. Повторите попытку позже')
      else await new Promise<void>((resolve) => setTimeout(resolve, 500))
    }
  } else await response.body?.cancel()
  privateHrefs.delete(diskPath)
}

export async function resolveRecordingHref(recording: RecordingSource, signal?: AbortSignal, fresh = false): Promise<string> {
  signal?.throwIfAborted()
  if (recording.diskPath) {
    assertPrivateRecordingPath(recording.diskPath)
    const cached = privateHrefs.get(recording.diskPath)
    if (!fresh && cached && cached.expiresAt > Date.now()) return cached.href
    const response = await apiRequest('resources/download', { path: recording.diskPath }, 'GET', signal)
    await requireSuccess(response)
    const data = object(await response.json())
    if (typeof data.href !== 'string') throw new InterviewStorageError('Яндекс Диск не вернул адрес записи')
    const href = safeLearningUpstream(data.href).href
    for (const [key, entry] of privateHrefs) if (entry.expiresAt <= Date.now()) privateHrefs.delete(key)
    while (privateHrefs.size >= 500) {
      const first = privateHrefs.keys().next()
      if (first.done) break
      privateHrefs.delete(first.value)
    }
    privateHrefs.set(recording.diskPath, { href, expiresAt: Date.now() + 5 * 60 * 1000 })
    return href
  }
  if (!recording.publicKey) throw new InterviewStorageError('Источник записи отсутствует', 404)
  const parsed = parsePublicResourceUrl(recording.publicKey)
  if (!parsed || parsed.path) throw new InterviewStorageError('Некорректный источник записи', 400)
  const ref = { publicKey: parsed.publicKey, path: recording.publicPath ?? null }
  if (fresh) {
    const old = await resolveHref(ref, signal)
    invalidateHref(ref, old)
  }
  return safeLearningUpstream(await resolveHref(ref, signal)).href
}

export type SharedRecording = {
  category: Exclude<RecordingCategory, 'personal'>
  directionSlug: 'react' | 'nodejs'
  title: string
  publicKey: string
  publicPath: string
  size: number
  mimeType: string
}

export async function fetchSharedRecordings(options: { signal?: AbortSignal; maxFiles?: number } = {}): Promise<SharedRecording[]> {
  const maxFiles = options.maxFiles ?? 500
  if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 5000) throw new InterviewStorageError('Некорректный лимит импорта', 400)
  const controller = new AbortController()
  const signals = [controller.signal, AbortSignal.timeout(120000), ...(options.signal ? [options.signal] : [])]
  const signal = AbortSignal.any(signals)
  const result: SharedRecording[] = []
  let directories = 0
  type Folder = { source: typeof SOURCE_FOLDERS[number]; path?: string; direction?: SharedRecording['directionSlug']; depth: number }
  const queue: Folder[] = SOURCE_FOLDERS.map((source) => ({ source, depth: 0 }))
  const visit = async ({ source, path, direction, depth }: Folder): Promise<void> => {
    if (++directories > 500 || depth > 8) throw new InterviewStorageError('Папка собеседований слишком большая для одного импорта', 400)
    let offset = 0
    while (true) {
      const response = await apiRequest('public/resources', { public_key: source.publicKey, limit: '100', offset: String(offset), ...(path ? { path } : {}) }, 'GET', signal, true)
      await requireSuccess(response)
      const data = object(await response.json())
      if (!data._embedded) return
      const embedded = object(data._embedded)
      if (!Array.isArray(embedded.items) || typeof embedded.total !== 'number' || !Number.isSafeInteger(embedded.total) || embedded.total < 0) throw new InterviewStorageError('Некорректный список записей Яндекс Диска')
      if (!embedded.items.length && offset < embedded.total) throw new InterviewStorageError('Яндекс Диск вернул неполный список записей')
      for (const raw of embedded.items) {
        const item = object(raw)
        if (typeof item.name !== 'string' || typeof item.path !== 'string') throw new InterviewStorageError('Некорректная запись Яндекс Диска')
        if (item.type === 'dir') {
          const label = item.name.toLowerCase()
          const inferred = direction ?? (/react/.test(label) ? 'react' : /node/.test(label) ? 'nodejs' : undefined)
          if (inferred) {
            if (queue.length + directories >= 500 || depth >= 8) throw new InterviewStorageError('Папка собеседований слишком большая для одного импорта', 400)
            queue.push({ source, path: item.path, direction: inferred, depth: depth + 1 })
          }
        } else if (item.type === 'file' && direction) {
          const extension = item.name.split('.').at(-1)?.toLowerCase() ?? ''
          if (!FORMATS[extension]) continue
          if (result.length >= maxFiles) throw new InterviewStorageError('Слишком много записей для одного импорта', 400)
          result.push({ category: source.category, directionSlug: direction, title: item.name.replace(/\.[^.]+$/, ''), publicKey: source.publicKey, publicPath: item.path, size: typeof item.size === 'number' && Number.isSafeInteger(item.size) && item.size > 0 ? item.size : 0, mimeType: FORMATS[extension] })
        }
      }
      offset += embedded.items.length
      if (offset >= embedded.total) break
    }
  }
  try {
    while (queue.length) await Promise.all(queue.splice(0, 4).map(visit))
  } catch (error) {
    controller.abort()
    throw error
  }
  return result
}
