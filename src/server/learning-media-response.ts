import 'server-only'

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { createLocalReq, type Payload } from 'payload'
import type { User } from '@/payload-types'

import { recordLearningAccess } from '@/lib/learning-observability'
import { learningMediaReadAccess, mediaFilenameWhere } from '@/server/learning-media-access'
import { acquireLearningStream, limitedLearningBody } from '@/server/learning-stream-limits'

export const PRIVATE_MEDIA_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Vary': 'Cookie, Authorization',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
}

export function mediaError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: PRIVATE_MEDIA_HEADERS })
}

export type ByteRange = { start: number; end: number }
export function parseLearningRange(value: string | null, size: number): ByteRange | null | false {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2]) || size === 0) return false
  const first = match[1] ? Number(match[1]) : null
  const last = match[2] ? Number(match[2]) : null
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return false
  if (first === null) {
    if (!last || last <= 0) return false
    return { start: Math.max(0, size - last), end: size - 1 }
  }
  if (first >= size || (last !== null && last < first)) return false
  return { start: first, end: Math.min(last ?? size - 1, size - 1) }
}

export async function localLearningMedia(request: Request, payload: Payload, user: User | null, filename: string): Promise<Response> {
  if (!filename || filename.length > 255 || /[/\\]/.test(filename) || filename.includes(String.fromCharCode(0)) || filename === '.' || filename === '..') return mediaError('Файл не найден', 404)
  const req = await createLocalReq({ user: user ?? undefined }, payload)
  const access = await learningMediaReadAccess({ req, data: { filename } })
  if (!access || typeof access !== 'object') return mediaError('Файл недоступен', user ? 404 : 401)
  // Pass the filename into the same policy as Payload's file handler. A generic
  // find would otherwise compute permissions for the entire media catalog.
  const docs = await payload.find({ collection: 'media', where: { and: [mediaFilenameWhere(filename), access] }, depth: 0, limit: 1, overrideAccess: true, req })
  const doc = docs.docs[0]
  if (!doc) {
    recordLearningAccess({ resource: 'media', outcome: 'deny', reason: user ? 'unassigned' : 'unauthenticated', userId: user?.id })
    return mediaError('Файл недоступен', user ? 404 : 401)
  }
  const upload = payload.collections.media.config.upload
  if (!upload) return mediaError('Файл не найден', 404)
  const directory = path.resolve(upload.staticDir || 'media')
  const filePath = path.resolve(directory, filename)
  if (!filePath.startsWith(directory + path.sep)) return mediaError('Файл не найден', 404)
  let size: number
  try { size = (await stat(filePath)).size }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return mediaError('Файл не найден', 404)
    throw error
  }
  const headers = new Headers(PRIVATE_MEDIA_HEADERS)
  const isOriginal = filename === doc.filename
  const sizeEntry = Object.values(doc.sizes ?? {}).find((entry) => entry?.filename === filename)
  headers.set('Content-Type', isOriginal ? doc.mimeType ?? 'application/octet-stream' : sizeEntry?.mimeType ?? 'application/octet-stream')
  const mime = headers.get('Content-Type') ?? ''
  headers.set('Content-Disposition', /^(?:video|image|audio)\//.test(mime) ? 'inline'
    : `attachment; filename*=UTF-8''${encodeURIComponent(filename).replaceAll("'", '%27')}`)
  headers.set('Content-Security-Policy', "sandbox; default-src 'none'")
  headers.set('Accept-Ranges', 'bytes')
  const range = parseLearningRange(request.headers.get('range'), size)
  if (range === false) {
    headers.set('Content-Range', `bytes */${size}`)
    recordLearningAccess({ resource: 'media', outcome: 'deny', reason: 'invalid_range', userId: user?.id, resourceId: doc.id })
    return new Response(null, { status: 416, headers })
  }
  headers.set('Content-Length', String(range ? range.end - range.start + 1 : size))
  if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
  const status = range ? 206 : 200
  if (request.method === 'HEAD') return new Response(null, { status, headers })
  const release = user ? acquireLearningStream(user.id) : () => undefined
  try {
    const stream = createReadStream(filePath, range || undefined)
    const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>
    return new Response(limitedLearningBody(body, release, request.signal, () => {
      recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'stream_error', userId: user?.id, resourceId: doc.id })
    }), { status, headers })
  } catch (error) { release(); throw error }
}
