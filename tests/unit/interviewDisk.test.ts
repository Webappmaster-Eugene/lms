import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_RECORDING_BYTES } from '@/lib/interviews/types'

const publicHref = vi.fn()
const invalidateHref = vi.fn()
vi.mock('@/lib/yandex-disk-href', () => ({ resolveHref: publicHref, invalidateHref }))

const { assertPrivateRecordingPath, createUpload, fetchSharedRecordings, finishUpload, InterviewStorageError, recordingFormat, removePrivateFile, resolveRecordingHref, safeInterviewUploadHref, uploadPrivateFile } = await import('@/server/interviews/disk')
const fetchMock = vi.fn()
const PATH = 'disk:/LMS interviews/23/45-7a3dc8a9-5b54-415b-a719-a4610b1408f2.mp4'
const UPLOAD = 'https://uploader54j.disk.yandex.net/upload-target/secret'
const DOWNLOAD = 'https://downloader.disk.yandex.ru/disk/private-capability'
const json = (body: unknown, status = 200) => Response.json(body, { status })
const link = () => json({ href: UPLOAD, method: 'PUT', templated: false })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('YANDEX_DISK_TOKEN', 'unit-secret')
  vi.stubEnv('YANDEX_INTERVIEWS_ROOT', '')
  const state = globalThis as typeof globalThis & { __lmsInterviewDiskHrefs?: Map<string, unknown> }
  state.__lmsInterviewDiskHrefs?.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('private storage boundary', () => {
  it.each([
    'disk:/other/23/45-7a3dc8a9-5b54-415b-a719-a4610b1408f2.mp4',
    'disk:/LMS interviews/23/../other.mp4', 'disk:/LMS interviews/23',
    `${PATH}/../../../private`, PATH.replace('.mp4', '.html'), PATH.replace('/23/', '/0/'),
  ])('rejects a path outside an exact reserved file: %s', (path) => {
    expect(() => assertPrivateRecordingPath(path)).toThrow('Некорректный путь')
  })
  it('never issues destructive requests for an unreserved path', async () => {
    await expect(removePrivateFile('disk:/')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('fails closed for invalid storage roots', () => {
    vi.stubEnv('YANDEX_INTERVIEWS_ROOT', 'disk:/../secret')
    expect(() => assertPrivateRecordingPath(PATH)).toThrow('настройка')
  })
  it('requires a token only for personal storage', async () => {
    vi.stubEnv('YANDEX_DISK_TOKEN', '')
    await expect(resolveRecordingHref({ diskPath: PATH })).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
    publicHref.mockResolvedValue(DOWNLOAD)
    await expect(resolveRecordingHref({ publicKey: 'https://disk.yandex.com/d/abc', publicPath: '/a.mp4' })).resolves.toBe(DOWNLOAD)
  })
  it('validates MIME and extension as one pair', () => {
    expect(recordingFormat('.MP4', 'video/mp4')).toEqual({ extension: 'mp4', mimeType: 'video/mp4' })
    expect(recordingFormat('mkv', 'video/matroska')).toEqual({ extension: 'mkv', mimeType: 'video/x-matroska' })
    expect(() => recordingFormat('mp4', 'text/html')).toThrow()
    expect(() => recordingFormat('html', 'video/mp4')).toThrow()
    expect(() => recordingFormat('mp4', 'video/webm')).toThrow()
  })
})

describe('private uploads', () => {
  it('creates only its own directories and reserves a unique non-overwriting target', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 })).mockResolvedValueOnce(new Response(null, { status: 201 })).mockResolvedValueOnce(link())
    const result = await createUpload({ ownerId: 23, recordingId: 45, size: 5, mimeType: 'video/mp4', extension: 'mp4' })
    expect(result.diskPath).toMatch(/^disk:\/LMS interviews\/23\/45-[0-9a-f-]+\.mp4$/)
    expect(result.uploadHref).toBe(UPLOAD)
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('path')).toBe('disk:/LMS interviews')
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('path')).toBe('disk:/LMS interviews/23')
    expect(new URL(fetchMock.mock.calls[2][0]).searchParams.get('overwrite')).toBe('false')
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('OAuth unit-secret')
  })
  it('does not confuse an existing file with an existing folder on409', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 })).mockResolvedValueOnce(json({ type: 'file', size: 100 }))
    await expect(createUpload({ ownerId: 23, recordingId: 45, size: 5, mimeType: 'video/mp4', extension: 'mp4' })).rejects.toMatchObject({ statusCode: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it.each([-1, 0, MAX_RECORDING_BYTES + 1, 4.5])('rejects invalid expected size %s before external access', async (size) => {
    await expect(createUpload({ ownerId: 23, recordingId: 45, size, mimeType: 'video/mp4', extension: 'mp4' })).rejects.toMatchObject({ statusCode: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([
    'https://evil.example/upload-target/a', 'http://uploader54j.disk.yandex.net/upload-target/a',
    'https://uploader54j.disk.yandex.net.evil.example/upload-target/a',
    'https://unit:secret@uploader54j.disk.yandex.net/upload-target/a',
    'https://uploader54j.disk.yandex.net:8080/upload-target/a',
    'https://downloader.disk.yandex.ru/upload-target/a',
    'https://uploader54j.disk.yandex.net/private-path',
  ])('rejects a non-upload capability %s', (href) => expect(() => safeInterviewUploadHref(href)).toThrow())
  it('uploads bounded raw bytes with no OAuth header and verifies metadata separately', async () => {
    fetchMock.mockResolvedValueOnce(link()).mockImplementationOnce(async (_url, init: RequestInit) => {
      const bytes = await new Response(init.body).arrayBuffer()
      expect(Array.from(new Uint8Array(bytes))).toEqual([1, 2, 3])
      expect(new Headers(init.headers).has('Authorization')).toBe(false)
      expect(new Headers(init.headers).get('Content-Length')).toBe('3')
      return new Response(null, { status: 201 })
    }).mockResolvedValueOnce(json({ type: 'file', size: 3, mime_type: 'video/mp4' }))
    await uploadPrivateFile(new Request('http://localhost/api/upload', { method: 'PUT', body: new Uint8Array([1, 2, 3]) }), { diskPath: PATH, expectedSize: 3, mimeType: 'video/mp4' })
    await expect(finishUpload({ diskPath: PATH, expectedSize: 3, expectedMime: 'video/mp4' })).resolves.toEqual({ size: 3, mimeType: 'video/mp4' })
  })
  it('rejects mismatched content length before requesting a capability', async () => {
    await expect(uploadPrivateFile(new Request('http://localhost/upload', { method: 'PUT', body: 'long', headers: { 'Content-Length': '4' } }), { diskPath: PATH, expectedSize: 3, mimeType: 'video/mp4' })).rejects.toMatchObject({ statusCode: 400 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it.each([2, 4])('rejects the actual streamed byte count %s rather than trusting browser metadata', async (length) => {
    fetchMock.mockResolvedValueOnce(link()).mockImplementationOnce(async (_url, init: RequestInit) => {
      await new Response(init.body).arrayBuffer()
      return new Response(null, { status: 201 })
    })
    await expect(uploadPrivateFile(new Request('http://localhost/upload', { method: 'PUT', body: new Uint8Array(length) }), { diskPath: PATH, expectedSize: 3, mimeType: 'video/mp4' })).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects a partial remote file even if the upload request claimed success', async () => {
    fetchMock.mockResolvedValue(json({ type: 'file', size: 2, mime_type: 'video/mp4' }))
    await expect(finishUpload({ diskPath: PATH, expectedSize: 3 })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('rejects active remote content', async () => {
    fetchMock.mockResolvedValue(json({ type: 'file', size: 3, mime_type: 'text/html' }))
    await expect(finishUpload({ diskPath: PATH, expectedSize: 3 })).rejects.toThrow('Поддерживаются видео')
  })
})

describe('download capabilities stay server-side', () => {
  it('reuses private href until a retry explicitly requires a fresh capability', async () => {
    fetchMock.mockImplementation(async () => json({ href: DOWNLOAD }))
    await expect(resolveRecordingHref({ diskPath: PATH })).resolves.toBe(DOWNLOAD)
    await resolveRecordingHref({ diskPath: PATH })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await resolveRecordingHref({ diskPath: PATH }, undefined, true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('never follows an API redirect carrying the OAuth token', async () => {
    fetchMock.mockResolvedValue(json({ href: DOWNLOAD }))
    await resolveRecordingHref({ diskPath: PATH })
    expect(fetchMock.mock.calls[0][1].redirect).toBe('error')
  })
  it('does not cache arbitrary download hosts', async () => {
    fetchMock.mockResolvedValueOnce(json({ href: 'https://evil.example/private' })).mockResolvedValueOnce(json({ href: DOWNLOAD }))
    await expect(resolveRecordingHref({ diskPath: PATH })).rejects.toThrow()
    await expect(resolveRecordingHref({ diskPath: PATH })).resolves.toBe(DOWNLOAD)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('deletion invalidates a cached capability and404 cleanup is idempotent', async () => {
    fetchMock.mockResolvedValueOnce(json({ href: DOWNLOAD })).mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(json({ href: DOWNLOAD }))
    await resolveRecordingHref({ diskPath: PATH })
    await removePrivateFile(PATH)
    await resolveRecordingHref({ diskPath: PATH })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE')
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('path')).toBe(PATH)
  })
  it('awaits an asynchronous deletion instead of reporting success on202', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(json({ href: 'https://cloud-api.yandex.net/v1/disk/operations/own-operation-123' }, 202))
      .mockResolvedValueOnce(json({ status: 'in-progress' })).mockResolvedValueOnce(json({ status: 'success' }))
    const result = removePrivateFile(PATH)
    await vi.advanceTimersByTimeAsync(500)
    await result
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(new URL(fetchMock.mock.calls[2][0]).pathname).toBe('/v1/disk/operations/own-operation-123')
    vi.useRealTimers()
  })
  it('keeps the record available for cleanup when the remote deletion job fails', async () => {
    fetchMock.mockResolvedValueOnce(json({ href: 'https://cloud-api.yandex.net/v1/disk/operations/own-operation-123' }, 202))
      .mockResolvedValueOnce(json({ status: 'failed' }))
    await expect(removePrivateFile(PATH)).rejects.toThrow('не смог удалить')
  })
  it('bounds an indefinitely pending deletion and keeps it eligible for retry', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
      setTimeout(() => controller.abort(), delay)
      return controller.signal
    })
    fetchMock.mockImplementation(async (_url, init: RequestInit) => init.method === 'DELETE'
      ? json({ href: 'https://cloud-api.yandex.net/v1/disk/operations/own-operation-123' }, 202)
      : json({ status: 'in-progress' }))
    const failure = expect(removePrivateFile(PATH)).rejects.toMatchObject({ statusCode: 503 })
    await vi.advanceTimersByTimeAsync(20500)
    await failure
  })
  it('rejects an operation href outside the exact authenticated API operation endpoint', async () => {
    fetchMock.mockResolvedValueOnce(json({ href: 'https://evil.example/v1/disk/operations/test' }, 202))
    await expect(removePrivateFile(PATH)).rejects.toThrow('Некорректный адрес')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('honours cancellation even for a cache hit', async () => {
    fetchMock.mockResolvedValue(json({ href: DOWNLOAD }))
    await resolveRecordingHref({ diskPath: PATH })
    const controller = new AbortController()
    controller.abort()
    await expect(resolveRecordingHref({ diskPath: PATH }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('shared library folder import', () => {
  it('walks folders concurrently with at most four requests in flight', async () => {
    let active = 0
    let peak = 0
    fetchMock.mockImplementation(async (raw: string | URL) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active--
      const path = new URL(raw).searchParams.get('path')
      const items = path ? [{ type: 'file', name: 'a.mp4', path: `${path}/a.mp4`, size: 3 }]
        : Array.from({ length: 5 }, (_, index) => ({ type: 'dir', name: `React ${index}`, path: `/React ${index}` }))
      return json({ _embedded: { items, total: items.length } })
    })
    expect(await fetchSharedRecordings()).toHaveLength(10)
    expect(peak).toBe(4)
  })
  it('paginates nested React/Node folders, preserves categories and ignores unrelated formats', async () => {
    fetchMock.mockImplementation(async (raw: string | URL) => {
      const url = new URL(raw)
      const path = url.searchParams.get('path')
      const offset = url.searchParams.get('offset')
      const mentor = url.searchParams.get('public_key')?.includes('GnyK')
      const items = !path
        ? [{ type: 'dir', name: 'Frontend React', path: '/Frontend React' }, { type: 'dir', name: 'Backend Nodejs', path: '/Backend Nodejs' }, { type: 'dir', name: 'unrelated', path: '/unrelated' }]
        : path === '/Frontend React'
          ? offset === '0' ? [{ type: 'dir', name: 'nested', path: '/Frontend React/nested' }] : [{ type: 'file', name: 'second.webm', path: '/Frontend React/second.webm', size: 7 }]
          : path.includes('nested') ? [{ type: 'file', name: 'Interview.mp4', path: '/Frontend React/nested/Interview.mp4', size: 5 }, { type: 'file', name: 'notes.html', path: '/Frontend React/nested/notes.html' }]
            : [{ type: 'file', name: `${mentor ? 'mentor' : 'student'}.mov`, path: '/Backend Nodejs/test.mov', size: 9 }]
      return json({ _embedded: { items, total: path === '/Frontend React' ? 2 : items.length } })
    })
    const records = await fetchSharedRecordings()
    expect(records).toHaveLength(6)
    expect(records.filter((record) => record.category === 'mentor')).toHaveLength(3)
    expect(records.filter((record) => record.directionSlug === 'react')).toHaveLength(4)
    expect(records.some((record) => record.publicPath.endsWith('.html'))).toBe(false)
    expect(fetchMock.mock.calls.some(([url]) => new URL(url).searchParams.get('offset') === '1')).toBe(true)
    expect(fetchMock.mock.calls.some(([url]) => new URL(url).searchParams.get('path') === '/unrelated')).toBe(false)
  })
  it('fails rather than silently truncating a library at the configured file limit', async () => {
    fetchMock.mockImplementation(async (raw: string | URL) => {
      const items = new URL(raw).searchParams.has('path')
        ? [1, 2].map((id) => ({ type: 'file', name: `${id}.mp4`, path: `/React/${id}.mp4`, size: 3 }))
        : [{ type: 'dir', name: 'React', path: '/React' }]
      return json({ _embedded: { items, total: items.length } })
    })
    await expect(fetchSharedRecordings({ maxFiles: 1 })).rejects.toThrow('Слишком много записей')
  })
  it('does not loop forever when the API reports total but returns an empty page', async () => {
    fetchMock.mockImplementation(async () => json({ _embedded: { items: [], total: 1 } }))
    await expect(fetchSharedRecordings()).rejects.toThrow('неполный список')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('отказы Яндекс Диска', () => {
  it.each([
    [404, 404, 'Запись не найдена на Яндекс Диске'],
    [401, 503, 'Доступ к хранилищу собеседований не настроен'],
    [403, 503, 'Доступ к хранилищу собеседований не настроен'],
    [507, 503, 'В хранилище собеседований закончилось место'],
    [429, 429, 'Яндекс Диск временно недоступен. Повторите попытку позже'],
    [500, 502, 'Яндекс Диск временно недоступен. Повторите попытку позже'],
  ])('ответ API %s превращается в статус %s без тела ответа диска', async (remote, statusCode, message) => {
    fetchMock.mockResolvedValue(new Response('{"description":"OAuth unit-secret"}', { status: remote }))
    const error = await finishUpload({ diskPath: PATH, expectedSize: 3 }).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ statusCode, message })
    expect(JSON.stringify(error)).not.toContain('unit-secret')
  })
  it('различает таймаут и обрыв соединения, не раскрывая сетевых деталей', async () => {
    fetchMock.mockRejectedValue(new TypeError('connect ECONNREFUSED 10.0.0.1:443'))
    await expect(finishUpload({ diskPath: PATH, expectedSize: 3 })).rejects.toMatchObject({ statusCode: 502, message: 'Не удалось подключиться к Яндекс Диску' })
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort())
    await expect(finishUpload({ diskPath: PATH, expectedSize: 3 })).rejects.toMatchObject({ statusCode: 502, message: 'Яндекс Диск не ответил вовремя. Повторите попытку' })
  })
  it('отмену вызывающим не выдаёт за сбой диска', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(resolveRecordingHref({ diskPath: PATH }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('уже существующая папка (409 и тип dir) не мешает резервированию', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 409 })).mockResolvedValueOnce(json({ type: 'dir' }))
      .mockResolvedValueOnce(new Response(null, { status: 201 })).mockResolvedValueOnce(link())
    const result = await createUpload({ ownerId: 23, recordingId: 45, size: 5, mimeType: 'video/mp4', extension: 'mp4' })
    expect(result.uploadHref).toBe(UPLOAD)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})

describe('сбои потоковой загрузки', () => {
  const upload = (request = new Request('http://localhost/upload', { method: 'PUT', body: new Uint8Array(3) })) => uploadPrivateFile(request, { diskPath: PATH, expectedSize: 3, mimeType: 'video/mp4' })
  it('ошибка размера, всплывшая из потока внутри fetch, отдаётся как есть', async () => {
    fetchMock.mockResolvedValueOnce(link()).mockRejectedValueOnce(new TypeError('fetch failed', { cause: new InterviewStorageError('Размер загружаемого видео изменился', 400) }))
    await expect(upload()).rejects.toMatchObject({ statusCode: 400, message: 'Размер загружаемого видео изменился' })
  })
  it('обрыв загрузки браузером не выдаётся за сбой диска', async () => {
    const controller = new AbortController()
    fetchMock.mockResolvedValueOnce(link()).mockImplementationOnce(async () => {
      controller.abort()
      throw new TypeError('fetch failed')
    })
    const request = new Request('http://localhost/upload', { method: 'PUT', body: new Uint8Array(3), signal: controller.signal })
    await expect(upload(request)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('прочий сетевой сбой — 502 с предложением повторить, без адреса загрузки', async () => {
    fetchMock.mockResolvedValueOnce(link()).mockRejectedValueOnce(new TypeError(`fetch failed ${UPLOAD}`))
    const error = await upload().catch((reason: unknown) => reason)
    expect(error).toMatchObject({ statusCode: 502, message: 'Не удалось загрузить видео. Повторите попытку' })
    expect((error as Error).message).not.toContain('upload-target')
  })
  it('отказ хранилища при приёме файла передаётся статусом', async () => {
    fetchMock.mockResolvedValueOnce(link()).mockImplementationOnce(async (_url, init: RequestInit) => {
      await new Response(init.body).arrayBuffer()
      return new Response(null, { status: 507 })
    })
    await expect(upload()).rejects.toMatchObject({ statusCode: 503, message: 'В хранилище собеседований закончилось место' })
  })
})

describe('удаление: подтверждение операции', () => {
  const ACCEPTED = 'https://cloud-api.yandex.net/v1/disk/operations/own-operation-123'
  it.each([{}, { href: 42 }, { href: 'не адрес' }])('202 без корректной ссылки на операцию (%j) — ошибка, а не тихий успех', async (body) => {
    fetchMock.mockResolvedValueOnce(json(body, 202))
    await expect(removePrivateFile(PATH)).rejects.toThrow('Яндекс Диск не подтвердил удаление записи')
  })
  it('сбой сети при опросе операции до истечения срока передаётся как есть', async () => {
    fetchMock.mockResolvedValueOnce(json({ href: ACCEPTED }, 202)).mockRejectedValueOnce(new TypeError('socket hang up'))
    await expect(removePrivateFile(PATH)).rejects.toMatchObject({ statusCode: 502, message: 'Не удалось подключиться к Яндекс Диску' })
  })
  it('срок, истёкший во время опроса, даёт 503 «ещё не завершено» для повтора позже', async () => {
    const controller = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    fetchMock.mockResolvedValueOnce(json({ href: ACCEPTED }, 202)).mockImplementationOnce(async () => {
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(removePrivateFile(PATH)).rejects.toMatchObject({ statusCode: 503, message: 'Удаление записи ещё не завершено. Повторите попытку позже' })
  })
})

describe('кэш ссылок на скачивание', () => {
  const pathFor = (index: number) => `disk:/LMS interviews/23/${index}-7a3dc8a9-5b54-415b-a719-a4610b1408f2.mp4`
  it('держит не больше 500 ссылок и вытесняет самую старую', async () => {
    fetchMock.mockImplementation(async () => json({ href: DOWNLOAD }))
    for (let index = 1; index <= 501; index++) await resolveRecordingHref({ diskPath: pathFor(index) })
    expect(fetchMock).toHaveBeenCalledTimes(501)
    await resolveRecordingHref({ diskPath: pathFor(2) })
    expect(fetchMock).toHaveBeenCalledTimes(501)
    await resolveRecordingHref({ diskPath: pathFor(1) })
    expect(fetchMock).toHaveBeenCalledTimes(502)
  })
  it('устаревшие через 5 минут ссылки запрашиваются заново', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    fetchMock.mockImplementation(async () => json({ href: DOWNLOAD }))
    await resolveRecordingHref({ diskPath: pathFor(1) })
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1)
    await resolveRecordingHref({ diskPath: pathFor(1) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('для общей записи повтор с fresh сбрасывает старую ссылку публичного ресурса', async () => {
    publicHref.mockResolvedValueOnce('https://downloader.disk.yandex.ru/disk/old').mockResolvedValueOnce(DOWNLOAD)
    const href = await resolveRecordingHref({ publicKey: 'https://disk.yandex.com/d/abc', publicPath: '/a.mp4' }, undefined, true)
    expect(href).toBe(DOWNLOAD)
    expect(invalidateHref).toHaveBeenCalledWith({ publicKey: 'https://disk.yandex.com/d/abc', path: '/a.mp4' }, 'https://downloader.disk.yandex.ru/disk/old')
  })
  it('общая запись без источника или со ссылкой на вложенный путь не разрешается', async () => {
    await expect(resolveRecordingHref({})).rejects.toMatchObject({ statusCode: 404 })
    await expect(resolveRecordingHref({ publicKey: 'https://evil.example/d/abc' })).rejects.toMatchObject({ statusCode: 400 })
    expect(publicHref).not.toHaveBeenCalled()
  })
})
