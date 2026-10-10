import 'server-only'

import { parsePublicResourceUrl } from '@/lib/yandex-disk-url'
import { InterviewStorageError, resolveRecordingHref, type RecordingSource } from '@/server/interviews/disk'
import { PRIVATE_MEDIA_HEADERS, mediaError } from '@/server/learning-media-response'
import { acquireLearningStream, limitedLearningBody } from '@/server/learning-stream-limits'
import { LearningUpstreamError, safeLearningUpstream, upstreamLearningMedia } from '@/server/learning-upstream'

const FORWARDED_HEADERS = ['content-length', 'content-range', 'accept-ranges', 'last-modified']

/** Caller must authenticate and check recording ownership before invoking this helper. */
export async function streamRecordingMedia(request: Request, recording: RecordingSource, userId: number): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return mediaError('Метод не поддерживается', 405)
  if (!Number.isSafeInteger(userId) || userId < 1) throw new InterviewStorageError('Требуется авторизация', 401)
  if (!recording.diskPath) {
    const parsed = recording.publicKey ? parsePublicResourceUrl(recording.publicKey) : null
    if (!parsed || parsed.path) throw new InterviewStorageError('Некорректный источник записи', 400)
    return upstreamLearningMedia(request, userId, { publicKey: parsed.publicKey, path: recording.publicPath ?? null })
  }
  const range = request.headers.get('range')
  if (range && (range.length > 100 || !/^bytes=\d*-\d*$/.test(range) || range === 'bytes=-')) return mediaError('Некорректный диапазон файла', 416)
  const release = acquireLearningStream(userId)
  const controller = new AbortController()
  const onAbort = () => { controller.abort(); release() }
  request.signal.addEventListener('abort', onAbort, { once: true })
  if (request.signal.aborted) onAbort()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, 15000)
  let handedOff = false
  try {
    let upstream: Response | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      let target = safeLearningUpstream(await resolveRecordingHref(recording, controller.signal, attempt > 0))
      for (let redirects = 0; redirects <= 3; redirects++) {
        upstream = await fetch(target, {
          method: request.method, headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: range } : {}) },
          cache: 'no-store', redirect: 'manual', signal: controller.signal,
        })
        if (![301, 302, 303, 307, 308].includes(upstream.status)) break
        const location = upstream.headers.get('location')
        await upstream.body?.cancel()
        if (!location || redirects === 3) throw new LearningUpstreamError('invalid_source')
        target = safeLearningUpstream(new URL(location, target).href)
      }
      if (!upstream || ![403, 410].includes(upstream.status) || attempt === 1) break
      await upstream.body?.cancel()
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
      return mediaError('Источник видео временно недоступен', upstream.status === 404 ? 404 : 502)
    }
    if (upstream.headers.get('content-encoding') && upstream.headers.get('content-encoding') !== 'identity') {
      await upstream.body?.cancel()
      return mediaError('Источник видео временно недоступен', 502)
    }
    const extension = recording.diskPath.split('.').at(-1)
    headers.set('Content-Type', extension === 'webm' ? 'video/webm' : extension === 'mov' ? 'video/quicktime' : extension === 'mkv' ? 'video/x-matroska' : 'video/mp4')
    headers.set('Content-Disposition', 'inline')
    headers.set('Content-Security-Policy', "sandbox; default-src 'none'")
    headers.set('Accept-Ranges', headers.get('accept-ranges') ?? 'bytes')
    if (request.method === 'HEAD' || !upstream.body) {
      await upstream.body?.cancel()
      return new Response(null, { status: upstream.status, headers })
    }
    const finish = () => { request.signal.removeEventListener('abort', onAbort); release() }
    const body = limitedLearningBody(upstream.body, finish, request.signal)
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
