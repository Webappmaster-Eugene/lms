import 'server-only'

import { recordLearningAccess } from '@/lib/learning-observability'
import { resolveHref } from '@/lib/yandex-disk-href'
import type { PublicResourceRef } from '@/lib/yandex-disk-url'
import { PRIVATE_MEDIA_HEADERS, mediaError } from '@/server/learning-media-response'
import { acquireLearningStream, limitedLearningBody } from '@/server/learning-stream-limits'

const HEADERS_DEADLINE_MS = 15000
const FORWARDED_HEADERS = ['content-length', 'content-range', 'accept-ranges', 'last-modified']

export class LearningUpstreamError extends Error {
  constructor(readonly reason: 'upstream_timeout' | 'invalid_source') { super(reason) }
}

export function safeLearningUpstream(raw: string): URL {
  let url: URL
  try { url = new URL(raw) } catch { throw new LearningUpstreamError('invalid_source') }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !['yandex.ru', 'yandex.com', 'yandex.net'].some((domain) => host.endsWith(`.${domain}`))) {
    throw new LearningUpstreamError('invalid_source')
  }
  return url
}

function contentType(ref: PublicResourceRef, upstream: Headers): string {
  const filename = ref.path ?? new URL(ref.publicKey).pathname
  if (/\.ts$/i.test(filename)) return 'video/mp2t'
  const mime = upstream.get('content-type')
  // Active content served from our origin could execute with the student's session.
  if (mime && /^(video\/|audio\/|image\/(?:png|jpeg|gif|webp)|application\/(?:pdf|zip|octet-stream))/.test(mime)) return mime
  if (/\.(?:mp4|m4v)$/i.test(filename)) return 'video/mp4'
  if (/\.webm$/i.test(filename)) return 'video/webm'
  if (/\.pdf$/i.test(filename)) return 'application/pdf'
  if (/\.zip$/i.test(filename)) return 'application/zip'
  return 'application/octet-stream'
}

export async function upstreamLearningMedia(request: Request, userId: number, ref: PublicResourceRef): Promise<Response> {
  const release = acquireLearningStream(userId)
  const controller = new AbortController()
  const onAbort = () => { controller.abort(); release() }
  request.signal.addEventListener('abort', onAbort, { once: true })
  if (request.signal.aborted) onAbort()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, HEADERS_DEADLINE_MS)
  let handedOff = false
  try {
    const range = request.headers.get('range')
    if (range && (range.length > 100 || !/^bytes=\d*-\d*$/.test(range) || range === 'bytes=-')) {
      recordLearningAccess({ resource: 'media', outcome: 'deny', reason: 'invalid_range', userId })
      return mediaError('Некорректный диапазон файла', 416)
    }
    const href = await resolveHref(ref, controller.signal)
    let target = safeLearningUpstream(href)
    let upstream: Response | undefined
    for (let redirects = 0; redirects <= 3; redirects++) {
      upstream = await fetch(target, {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) },
        cache: 'no-store', redirect: 'manual', signal: controller.signal,
      })
      if (![301, 302, 303, 307, 308].includes(upstream.status)) break
      const location = upstream.headers.get('location')
      await upstream.body?.cancel()
      if (!location || redirects === 3) throw new LearningUpstreamError('invalid_source')
      target = safeLearningUpstream(new URL(location, target).href)
    }
    clearTimeout(timer)
    if (!upstream) throw new LearningUpstreamError('invalid_source')
    const headers = new Headers(PRIVATE_MEDIA_HEADERS)
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    if (upstream.status === 416) {
      await upstream.body?.cancel()
      return new Response(null, { status: 416, headers })
    }
    if (upstream.status !== 200 && upstream.status !== 206) {
      await upstream.body?.cancel()
      recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'upstream_unavailable', userId })
      return mediaError('Источник файла временно недоступен', upstream.status === 404 ? 404 : 502)
    }
    if (upstream.headers.get('content-encoding') && upstream.headers.get('content-encoding') !== 'identity') {
      await upstream.body?.cancel()
      recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'upstream_error', userId })
      return mediaError('Источник файла временно недоступен', 502)
    }
    headers.set('Content-Type', contentType(ref, upstream.headers))
    headers.set('Accept-Ranges', headers.get('accept-ranges') ?? 'bytes')
    const filename = ref.path?.split('/').at(-1)
    headers.set('Content-Disposition', headers.get('Content-Type')?.startsWith('video/') ? 'inline' : filename
      ? `attachment; filename*=UTF-8''${encodeURIComponent(filename).replaceAll("'", '%27')}`
      : 'attachment')
    headers.set('Content-Security-Policy', "sandbox; default-src 'none'")
    if (request.method === 'HEAD' || !upstream.body) {
      await upstream.body?.cancel()
      return new Response(null, { status: upstream.status, headers })
    }
    const finish = () => { request.signal.removeEventListener('abort', onAbort); release() }
    const body = limitedLearningBody(upstream.body, finish, request.signal, () => {
      recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'stream_error', userId })
    })
    handedOff = true
    return new Response(body, { status: upstream.status, headers })
  } catch (error) {
    if (timedOut) throw new LearningUpstreamError('upstream_timeout')
    throw error
  } finally {
    clearTimeout(timer)
    if (!handedOff) { request.signal.removeEventListener('abort', onAbort); release() }
  }
}
