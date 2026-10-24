import 'server-only'

import { recordLearningAccess } from '@/lib/learning-observability'
import { invalidateHref, resolveHref } from '@/lib/yandex-disk-href'
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

function contentType(ref: PublicResourceRef, upstream: Headers, kind: 'video' | 'asset'): string {
  const filename = ref.path ?? new URL(ref.publicKey).pathname
  if (/\.ts$/i.test(filename)) return kind === 'video' ? 'video/mp2t' : 'application/octet-stream'
  const mime = upstream.get('content-type')
  // Active content served from our origin could execute with the student's session.
  if (mime && /^(video\/|audio\/|image\/(?:png|jpeg|gif|webp)|application\/(?:pdf|zip|octet-stream))/.test(mime)) return mime
  if (/\.(?:mp4|m4v)$/i.test(filename)) return 'video/mp4'
  if (/\.webm$/i.test(filename)) return 'video/webm'
  if (/\.pdf$/i.test(filename)) return 'application/pdf'
  if (/\.zip$/i.test(filename)) return 'application/zip'
  return 'application/octet-stream'
}

/**
 * Хранилище Диска иногда отвечает 200/206 с верным размером и закрывает соединение,
 * не прислав ни байта. Такой ответ нельзя отдавать плееру как успешный: ждём первый кусок.
 */
async function firstBodyChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal): Promise<Uint8Array | null> {
  let onAbort: (() => void) | undefined
  try {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason ?? new DOMException('Request aborted', 'AbortError'))
        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) onAbort()
      }),
    ])
    return chunk.done || !chunk.value?.byteLength ? null : chunk.value
  } catch (error) {
    // Обрыв сокета до первого байта — тот же пустой ответ; отмена и дедлайн идут своим путём.
    if (signal.aborted) throw error
    return null
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}

function resumeBody(reader: ReadableStreamDefaultReader<Uint8Array>, first: Uint8Array): ReadableStream<Uint8Array> {
  let pending: Uint8Array | null = first
  return new ReadableStream({
    async pull(controller) {
      if (pending) { controller.enqueue(pending); pending = null; return }
      const chunk = await reader.read()
      if (chunk.done) controller.close()
      else controller.enqueue(chunk.value)
    },
    cancel(reason) { return reader.cancel(reason) },
  })
}

export async function upstreamLearningMedia(request: Request, userId: number, ref: PublicResourceRef, kind: 'video' | 'asset' = 'video'): Promise<Response> {
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
    let hrefDuration = 0
    let upstreamDuration = 0
    let upstream: Response | undefined
    let opened: { reader: ReadableStreamDefaultReader<Uint8Array>; first: Uint8Array } | undefined
    let emptyBody = false
    for (let attempt = 0; attempt < 2; attempt++) {
      const hrefStarted = performance.now()
      const href = await resolveHref(ref, controller.signal)
      hrefDuration += performance.now() - hrefStarted
      let target = safeLearningUpstream(href)
      const upstreamStarted = performance.now()
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
      upstreamDuration += performance.now() - upstreamStarted
      // A CDN capability can expire before our conservative TTL; retry once,
      // with the same Range and deadline, rather than breaking native playback.
      if (!upstream || ![403, 410].includes(upstream.status)) break
      invalidateHref(ref, href)
      if (attempt === 1) break
      await upstream.body?.cancel()
    }
    if (!upstream) throw new LearningUpstreamError('invalid_source')
    // Пустой ответ не повторяем и ссылку не сбрасываем: новая ведёт на тот же узел хранилища,
    // а лишние обращения к download API бьют по общему лимиту, от которого зависят исправные записи.
    const encoding = upstream.headers.get('content-encoding')
    if (upstream.body && request.method !== 'HEAD' && [200, 206].includes(upstream.status)
      && upstream.headers.get('content-length') !== '0' && (!encoding || encoding === 'identity')) {
      const opening = performance.now()
      const reader = upstream.body.getReader()
      const first = await firstBodyChunk(reader, controller.signal)
      upstreamDuration += performance.now() - opening
      if (first) opened = { reader, first }
      else { emptyBody = true; await reader.cancel().catch(() => undefined) }
    }
    clearTimeout(timer)
    const headers = new Headers(PRIVATE_MEDIA_HEADERS)
    headers.set('Server-Timing', `disk_href;dur=${hrefDuration.toFixed(1)}, disk_headers;dur=${upstreamDuration.toFixed(1)}`)
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
    if (emptyBody) {
      recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'upstream_empty', userId })
      return mediaError('Хранилище не отдало файл. Попробуйте позже', 502)
    }
    if (upstream.headers.get('content-encoding') && upstream.headers.get('content-encoding') !== 'identity') {
      await upstream.body?.cancel()
      recordLearningAccess({ resource: 'media', outcome: 'error', reason: 'upstream_error', userId })
      return mediaError('Источник файла временно недоступен', 502)
    }
    headers.set('Content-Type', contentType(ref, upstream.headers, kind))
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
    const body = limitedLearningBody(opened ? resumeBody(opened.reader, opened.first) : upstream.body, finish, request.signal, () => {
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
