import { createLocalReq, getPayload } from 'payload'
import config from '@payload-config'

import { recordLearningAccess, withLearningSpan } from '@/lib/learning-observability'
import { deriveMediaReferenceIds } from '@/payload/hooks/deriveLearningMediaReferences'
import { mediaError, PRIVATE_MEDIA_HEADERS } from '@/server/learning-media-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

class MediaRequestError extends Error {
  constructor(readonly status: number) { super('Invalid media-reference request') }
}

async function boundedJson(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new MediaRequestError(415)
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096)) throw new MediaRequestError(413)
  const reader = request.body?.getReader()
  if (!reader) throw new MediaRequestError(400)
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > 4096) { await reader.cancel(); throw new MediaRequestError(413) }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

function sameOrigin(request: Request): boolean {
  const url = new URL(request.url)
  const allowed = new Set([url.origin])
  if (process.env.NEXT_PUBLIC_SERVER_URL) allowed.add(new URL(process.env.NEXT_PUBLIC_SERVER_URL).origin)
  const host = request.headers.get('host')
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const protocol = forwarded === 'https' || forwarded === 'http' ? `${forwarded}:` : url.protocol
  if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) allowed.add(new URL(`${protocol}//${host}`).origin)
  return allowed.has(request.headers.get('origin') ?? '') && !['same-site', 'cross-site'].includes(request.headers.get('sec-fetch-site') ?? '')
}

export async function POST(request: Request): Promise<Response> {
  return withLearningSpan('media', 'assignment', async () => {
    const payload = await getPayload({ config })
    const headers = new Headers(request.headers)
    const authorization = headers.get('authorization')
    if (authorization !== null) {
      if (!/^(?:JWT|Bearer) \S+$/.test(authorization)) return mediaError('Требуется авторизация', 401)
      headers.delete('cookie')
    }
    const { user } = await payload.auth({ headers })
    if (!user) return mediaError('Требуется авторизация', 401)
    if (user.role !== 'admin') return mediaError('Недостаточно прав', 403)
    if (authorization === null && !sameOrigin(request)) return mediaError('Доступ запрещён', 403)
    let body: unknown
    try { body = await boundedJson(request) } catch (error) { return mediaError('Некорректный запрос', error instanceof MediaRequestError ? error.status : 400) }
    if (!body || typeof body !== 'object') return mediaError('Некорректный запрос', 400)
    const data = body as Record<string, unknown>
    const cursor = data.cursor ?? 0
    const limit = data.limit ?? 25
    if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0 || typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 50 || (data.apply !== undefined && typeof data.apply !== 'boolean')) return mediaError('Некорректный запрос', 400)
    const req = await createLocalReq({ user }, payload)
    try {
      const lessons = await payload.find({ collection: 'lessons', overrideAccess: true, req, where: { and: [{ id: { greater_than: cursor } }, { mediaReferencesResolved: { not_equals: true } }] }, sort: 'id', depth: 0, limit })
      let resolved = 0
      for (const lesson of lessons.docs) {
        if (data.apply === true) {
          // The hook derives references from originalDoc; the material is never resent.
          await payload.update({ collection: 'lessons', id: lesson.id, req, overrideAccess: true, data: {} })
          resolved++
        } else await deriveMediaReferenceIds(req, lesson)
      }
      return Response.json({ dryRun: data.apply !== true, scanned: lessons.docs.length, resolved, nextCursor: lessons.hasNextPage ? lessons.docs.at(-1)?.id ?? cursor : null }, { headers: PRIVATE_MEDIA_HEADERS })
    } catch {
      recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'internal_error', userId: user.id })
      return mediaError('Не удалось построить индекс файлов. Повторный запрос безопасен', 500)
    }
  }).catch(() => {
    recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'internal_error' })
    return mediaError('Сервис файлов временно недоступен', 503)
  })
}
