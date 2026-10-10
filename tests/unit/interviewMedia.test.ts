import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resolveRecordingHref = vi.fn()
const publicMedia = vi.fn()
const release = vi.fn()
vi.mock('@/server/interviews/disk', async (importOriginal) => ({ ...await importOriginal<typeof import('@/server/interviews/disk')>(), resolveRecordingHref }))
vi.mock('@/server/learning-upstream', async (importOriginal) => ({ ...await importOriginal<typeof import('@/server/learning-upstream')>(), upstreamLearningMedia: publicMedia }))
vi.mock('@/server/learning-stream-limits', async (importOriginal) => ({ ...await importOriginal<typeof import('@/server/learning-stream-limits')>(), acquireLearningStream: vi.fn(() => release) }))

const { streamRecordingMedia } = await import('@/server/interviews/media')
const fetchMock = vi.fn()
const source = { diskPath: 'disk:/LMS interviews/23/45-7a3dc8a9-5b54-415b-a719-a4610b1408f2.mp4' }
const HREF = 'https://downloader.disk.yandex.ru/disk/secret-capability'
const request = (options: RequestInit = {}) => new Request('https://learn.mentorcareer.ru/api/interviews/45/stream', options)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  resolveRecordingHref.mockResolvedValue(HREF)
  fetchMock.mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '3' } }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('personal video stream', () => {
  it('proxies bytes without exposing a capability and prohibits browser/SW caching', async () => {
    const response = await streamRecordingMedia(request(), source, 23)
    expect(response.status).toBe(200)
    expect(response.headers.get('Location')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Vary')).toBe('Cookie, Authorization')
    expect(response.headers.get('Content-Type')).toBe('video/mp4')
    expect(response.headers.get('Content-Security-Policy')).toBe("sandbox; default-src 'none'")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(release).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
  it('preserves partial content and sends only Range to the storage endpoint', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([2, 3]), { status: 206, headers: { 'Content-Range': 'bytes 1-2/3', 'Content-Length': '2', 'Accept-Ranges': 'bytes' } }))
    const response = await streamRecordingMedia(request({ headers: { Range: 'bytes=1-2', Cookie: 'secret-session' } }), source, 23)
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 1-2/3')
    expect(response.headers.get('Content-Length')).toBe('2')
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Accept-Encoding': 'identity', Range: 'bytes=1-2' })
    await response.arrayBuffer()
  })
  it.each(['bytes=-', 'bytes=0-1,4-8', 'items=1-2', `bytes=${'1'.repeat(101)}-`])('rejects malformed Range %s before storage access', async (range) => {
    const response = await streamRecordingMedia(request({ headers: { Range: range } }), source, 23)
    expect(response.status).toBe(416)
    expect(resolveRecordingHref).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('HEAD returns upstream length without a stream or lost concurrency slot', async () => {
    const response = await streamRecordingMedia(request({ method: 'HEAD' }), source, 23)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Length')).toBe('3')
    expect(await response.text()).toBe('')
    expect(fetchMock.mock.calls[0][1].method).toBe('HEAD')
    expect(release).toHaveBeenCalledTimes(1)
  })
  it.each([403, 410])('refreshes an expired capability once after%s with the original Range', async (status) => {
    resolveRecordingHref.mockResolvedValueOnce(HREF).mockResolvedValueOnce(`${HREF}-new`)
    fetchMock.mockResolvedValueOnce(new Response(null, { status })).mockResolvedValueOnce(new Response(new Uint8Array([3]), { status: 206, headers: { 'Content-Range': 'bytes 2-2/3' } }))
    const response = await streamRecordingMedia(request({ headers: { Range: 'bytes=2-' } }), source, 23)
    expect(response.status).toBe(206)
    expect(resolveRecordingHref.mock.calls.map((call) => call[2])).toEqual([false, true])
    expect(fetchMock.mock.calls.map((call) => call[1].headers.Range)).toEqual(['bytes=2-', 'bytes=2-'])
    await response.arrayBuffer()
  })
  it('caps repeated403 retries and returns a private error', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 403 }))
    const response = await streamRecordingMedia(request(), source, 23)
    expect(response.status).toBe(502)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('validates redirect targets before making a second request', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }))
    await expect(streamRecordingMedia(request(), source, 23)).rejects.toMatchObject({ reason: 'invalid_source' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('rejects malicious initial download capabilities', async () => {
    resolveRecordingHref.mockResolvedValue('https://evil.example/leak')
    await expect(streamRecordingMedia(request(), source, 23)).rejects.toMatchObject({ reason: 'invalid_source' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('handles416 with original content range and no body', async () => {
    fetchMock.mockResolvedValue(new Response('error body', { status: 416, headers: { 'Content-Range': 'bytes */3' } }))
    const response = await streamRecordingMedia(request({ headers: { Range: 'bytes=9-' } }), source, 23)
    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */3')
    expect(await response.text()).toBe('')
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('does not serve compressed byte ranges using stale lengths', async () => {
    fetchMock.mockResolvedValue(new Response('compressed', { headers: { 'Content-Encoding': 'gzip' } }))
    const response = await streamRecordingMedia(request(), source, 23)
    expect(response.status).toBe(502)
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('never serves HTML on the authenticated app origin', async () => {
    fetchMock.mockResolvedValue(new Response('<script>evil()</script>', { headers: { 'Content-Type': 'text/html' } }))
    const response = await streamRecordingMedia(request(), source, 23)
    expect(response.headers.get('Content-Type')).toBe('video/mp4')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    await response.arrayBuffer()
  })
  it('releases a concurrency slot when playback cancels', async () => {
    const response = await streamRecordingMedia(request(), source, 23)
    await response.body?.cancel()
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('enforces the metadata/header deadline and releases the slot after timeout', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }))
    const result = streamRecordingMedia(request(), source, 23)
    const failure = expect(result).rejects.toMatchObject({ reason: 'upstream_timeout' })
    await vi.advanceTimersByTimeAsync(15000)
    await failure
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('aborting a request interrupts the upstream fetch', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    }))
    const result = streamRecordingMedia(request({ signal: controller.signal }), source, 23)
    const failure = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    controller.abort()
    await failure
    expect(release).toHaveBeenCalled()
  })
})

describe('shared recordings', () => {
  it('reuses the existing protected lesson stream with an independently authorized user', async () => {
    publicMedia.mockResolvedValue(new Response('video'))
    const req = request()
    const response = await streamRecordingMedia(req, { publicKey: 'https://disk.yandex.com/d/GnyK5icpAuUnnQ', publicPath: '/Frontend React/a.mp4' }, 23)
    expect(response.status).toBe(200)
    expect(publicMedia).toHaveBeenCalledWith(req, 23, { publicKey: 'https://disk.yandex.com/d/GnyK5icpAuUnnQ', path: '/Frontend React/a.mp4' })
  })
  it('rejects unsupported sources before calling the generic proxy', async () => {
    await expect(streamRecordingMedia(request(), { publicKey: 'https://evil.example/public' }, 23)).rejects.toMatchObject({ statusCode: 400 })
    expect(publicMedia).not.toHaveBeenCalled()
  })
  it('rejects an invalid caller and unsupported HTTP method without fetching', async () => {
    await expect(streamRecordingMedia(request(), source, 0)).rejects.toMatchObject({ statusCode: 401 })
    expect((await streamRecordingMedia(request({ method: 'POST' }), source, 23)).status).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
