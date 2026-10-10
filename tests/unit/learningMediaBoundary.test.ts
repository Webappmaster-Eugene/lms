import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { acquireLearningStream, LearningStreamLimitError, limitedLearningBody } from '@/server/learning-stream-limits'
import { parseLearningRange } from '@/server/learning-media-response'
import { safeLearningUpstream, upstreamLearningMedia, LearningUpstreamError } from '@/server/learning-upstream'

const { resolveHref, invalidateHref } = vi.hoisted(() => ({ resolveHref: vi.fn(), invalidateHref: vi.fn() }))
vi.mock('@/lib/yandex-disk-href', () => ({ resolveHref, invalidateHref }))
vi.mock('@/lib/learning-observability', () => ({ recordLearningAccess: vi.fn() }))
const upstream = vi.fn()
const ref = { publicKey: 'https://disk.yandex.ru/d/fixture', path: '/video.mp4' }
let viewerId = 30000
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  viewerId++
  resolveHref.mockResolvedValue('https://downloader.disk.yandex.ru/disk/fixture/video.mp4')
  upstream.mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Length': '3', 'Content-Type': 'video/mp4' } }))
  vi.stubGlobal('fetch', upstream)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('native Range and closed upstream sources', () => {
  it.each([
    ['bytes=0-2', 5, { start: 0, end: 2 }],
    ['bytes=2-', 5, { start: 2, end: 4 }],
    ['bytes=-2', 5, { start: 3, end: 4 }],
    ['bytes=0-999', 5, { start: 0, end: 4 }],
    ['bytes=5-', 5, false], ['bytes=-0', 5, false], ['bytes=3-1', 5, false],
    ['bytes=0-1,3-4', 5, false], ['items=0-1', 5, false], ['bytes=9007199254740992-', 5, false],
  ])('validates %s against the real file size', (value, size, expected) => {
    expect(parseLearningRange(value, size)).toEqual(expected)
  })
  it.each(['http://downloader.yandex.ru/x', 'https://127.0.0.1/x', 'https://yandex.ru.evil.example/x', 'https://evil.example.yandex.ru:8443/x', 'https://user:pass@downloader.yandex.ru/x'])('rejects unsafe CDN destination %s', (url) => {
    expect(() => safeLearningUpstream(url)).toThrow(LearningUpstreamError)
  })
  it('returns 206 bytes with size headers, never a signed URL', async () => {
    upstream.mockResolvedValue(new Response(new Uint8Array([1, 2]), { status: 206, headers: { 'Content-Range': 'bytes 2-3/20', 'Content-Length': '2', 'Content-Type': 'video/mp4' } }))
    const response = await upstreamLearningMedia(new Request('https://lms.test/media', { headers: { Range: 'bytes=2-3' } }), viewerId, ref)
    expect(response.status).toBe(206)
    expect(response.headers.get('Location')).toBeNull()
    expect(response.headers.get('Content-Length')).toBe('2')
    expect(response.headers.get('Content-Range')).toBe('bytes 2-3/20')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await response.arrayBuffer()).byteLength).toBe(2)
  })
  it('HEAD asks upstream for HEAD, keeps size and has no body', async () => {
    const response = await upstreamLearningMedia(new Request('https://lms.test/media', { method: 'HEAD' }), viewerId, ref)
    expect(upstream.mock.calls[0][1].method).toBe('HEAD')
    expect(response.headers.get('Content-Length')).toBe('3')
    expect(response.body).toBeNull()
  })
  it.each([403, 410])('a rejected temporary CDN link (%s) refreshes once without changing Range or leaking href', async (status) => {
    const old = 'https://downloader.disk.yandex.ru/disk/old/video.mp4'
    const fresh = 'https://downloader.disk.yandex.ru/disk/new/video.mp4'
    resolveHref.mockResolvedValueOnce(old).mockResolvedValueOnce(fresh)
    const rejected = new Response('expired', { status })
    const cancel = vi.spyOn(rejected.body as ReadableStream, 'cancel')
    upstream.mockResolvedValueOnce(rejected).mockResolvedValueOnce(new Response(new Uint8Array([4, 5]), { status: 206, headers: { 'Content-Range': 'bytes 4-5/20', 'Content-Length': '2', 'Content-Type': 'video/mp4' } }))
    const response = await upstreamLearningMedia(new Request('https://lms.test/media', { headers: { Range: 'bytes=4-5' } }), viewerId, ref)
    expect(invalidateHref).toHaveBeenCalledWith(ref, old)
    expect(cancel).toHaveBeenCalledOnce()
    expect(upstream.mock.calls.map((call) => String(call[0]))).toEqual([old, fresh])
    expect(upstream.mock.calls.every((call) => call[1].headers.Range === 'bytes=4-5')).toBe(true)
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 4-5/20')
    expect(response.headers.get('Server-Timing')).toMatch(/^disk_href;dur=\d+\.\d, disk_headers;dur=\d+\.\d$/)
    expect(response.headers.get('Location')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([4, 5])
  })
  it('a persistent CDN refusal has two attempts, a generic error, and releases its stream slot', async () => {
    upstream.mockImplementation(async () => new Response('refused', { status: 403 }))
    const response = await upstreamLearningMedia(new Request('https://lms.test/media'), viewerId, ref)
    expect(response.status).toBe(502)
    expect(upstream).toHaveBeenCalledTimes(2)
    expect(resolveHref).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(await response.json())).not.toContain('yandex')
    const releases = Array.from({ length: 6 }, () => acquireLearningStream(viewerId))
    releases.forEach((release) => release())
  })
  it('a refresh redirect is validated again instead of bypassing the CDN allowlist', async () => {
    upstream.mockResolvedValueOnce(new Response('expired', { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/metadata' } }))
    await expect(upstreamLearningMedia(new Request('https://lms.test/media'), viewerId, ref)).rejects.toMatchObject({ reason: 'invalid_source' })
    expect(upstream).toHaveBeenCalledTimes(2)
  })
  it('a real missing file is not retried as an expired CDN capability', async () => {
    upstream.mockResolvedValue(new Response('missing', { status: 404 }))
    const response = await upstreamLearningMedia(new Request('https://lms.test/media'), viewerId, ref)
    expect(response.status).toBe(404)
    expect(upstream).toHaveBeenCalledOnce()
    expect(invalidateHref).not.toHaveBeenCalled()
  })
  it('416 retains the complete file size and private caching', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */3' } }))
    const response = await upstreamLearningMedia(new Request('https://lms.test/media', { headers: { Range: 'bytes=99-' } }), viewerId, ref)
    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */3')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it('does not follow a redirect to another origin outside the allowlist', async () => {
    upstream.mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest/meta-data' } }))
    await expect(upstreamLearningMedia(new Request('https://lms.test/media'), viewerId, ref)).rejects.toMatchObject({ reason: 'invalid_source' })
    expect(upstream).toHaveBeenCalledTimes(1)
  })
  it('rejects unexpected content encoding rather than forwarding decompressed bytes with stale size headers', async () => {
    upstream.mockResolvedValue(new Response(new Uint8Array([1, 2]), { headers: { 'Content-Encoding': 'gzip', 'Content-Length': '18' } }))
    const response = await upstreamLearningMedia(new Request('https://lms.test/media'), viewerId, ref)
    expect(response.status).toBe(502)
    expect(upstream.mock.calls[0][1].headers['Accept-Encoding']).toBe('identity')
  })
  it('times out headers, releases its slot, and can then open another stream', async () => {
    vi.useFakeTimers()
    upstream.mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })))
    const pending = upstreamLearningMedia(new Request('https://lms.test/media'), viewerId, ref)
    const failure = expect(pending).rejects.toMatchObject({ reason: 'upstream_timeout' })
    await vi.advanceTimersByTimeAsync(15001)
    await failure
    const releases = Array.from({ length: 6 }, () => acquireLearningStream(viewerId))
    releases.forEach((release) => release())
  })
  it('refresh uses the original 15-second deadline and preserves the HEAD method', async () => {
    vi.useFakeTimers()
    upstream.mockResolvedValueOnce(new Response('expired', { status: 403 }))
      .mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })))
    const pending = upstreamLearningMedia(new Request('https://lms.test/media', { method: 'HEAD' }), viewerId, ref)
    const failure = expect(pending).rejects.toMatchObject({ reason: 'upstream_timeout' })
    await vi.advanceTimersByTimeAsync(15001)
    await failure
    expect(upstream).toHaveBeenCalledTimes(2)
    expect(upstream.mock.calls.every((call) => call[1].method === 'HEAD')).toBe(true)
    const releases = Array.from({ length: 6 }, () => acquireLearningStream(viewerId))
    releases.forEach((release) => release())
  })
  it('does not apply the header timeout to a long live video body', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    upstream.mockImplementation(async () => new Response(new ReadableStream({ start() { /* open playback */ } })))
    const response = await upstreamLearningMedia(new Request('https://lms.test/media', { signal: controller.signal }), viewerId, ref)
    await vi.advanceTimersByTimeAsync(60000)
    expect(upstream.mock.calls[0][1].signal.aborted).toBe(false)
    controller.abort()
    await response.body?.cancel()
    const releases = Array.from({ length: 6 }, () => acquireLearningStream(viewerId))
    releases.forEach((release) => release())
  })
})

describe('bounded stream lifecycle', () => {
  it('limits concurrency to 6, releasing a slot once', () => {
    const releases = Array.from({ length: 6 }, () => acquireLearningStream(viewerId))
    expect(() => acquireLearningStream(viewerId)).toThrow(LearningStreamLimitError)
    releases[0](); releases[0]()
    const next = acquireLearningStream(viewerId)
    expect(() => acquireLearningStream(viewerId)).toThrow(LearningStreamLimitError)
    next(); releases.forEach((release) => release())
  })
  it('counts completed bursts and resets only after the window', () => {
    const now = Date.now()
    for (let index = 0; index < 120; index++) acquireLearningStream(viewerId, now)()
    expect(() => acquireLearningStream(viewerId, now)).toThrow(LearningStreamLimitError)
    acquireLearningStream(viewerId, now + 60001)()
  })
  it.each(['eof', 'cancel', 'error', 'abort'])('releases exactly once after %s', async (event) => {
    const release = vi.fn()
    const abort = new AbortController()
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      if (event === 'eof') controller.close()
      if (event === 'error') controller.error(new Error('stream failed'))
    } })
    const limited = limitedLearningBody(body, release, abort.signal)
    if (event === 'eof') await new Response(limited).arrayBuffer()
    if (event === 'cancel') await limited.cancel()
    if (event === 'error') await expect(new Response(limited).arrayBuffer()).rejects.toThrow('stream failed')
    if (event === 'abort') { abort.abort(); await limited.cancel() }
    expect(release).toHaveBeenCalledTimes(1)
  })
})
