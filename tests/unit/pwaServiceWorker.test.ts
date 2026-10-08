import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')
const origin = 'https://learn.mentorcareer.ru'

interface WorkerEvent {
  waitUntil: (promise: Promise<unknown>) => void
  respondWith: (promise: Promise<Response>) => void
  request?: { url: string; method: string; mode: string }
  data?: { type?: string; json?: () => unknown }
  notification?: { close: () => void; data?: { url?: unknown } }
}

function worker() {
  const listeners = new Map<string, (event: WorkerEvent) => void>()
  const cache = { addAll: vi.fn(async (_paths: string[]) => undefined), put: vi.fn() }
  const offline = new Response('Обучение доступно после подключения к интернету')
  const caches = {
    open: vi.fn(async () => cache),
    match: vi.fn(async () => offline),
    keys: vi.fn(async () => ['mentorcareer-shell-v0', 'unrelated-app-cache']),
    delete: vi.fn(async () => true),
  }
  const fetch = vi.fn(async () => new Response('PRIVATE LESSON CONTENT'))
  const clients = {
    claim: vi.fn(async () => undefined),
    matchAll: vi.fn(async (): Promise<Array<{ url: string; postMessage: (data: unknown) => void; navigate: (url: string) => Promise<void>; focus: () => Promise<void> }>> => []),
    openWindow: vi.fn(async (_url: string) => undefined),
  }
  const skipWaiting = vi.fn()
  const showNotification = vi.fn(async (_title: string, _options: Record<string, unknown>) => undefined)
  runInNewContext(source, {
    URL, Response, caches, fetch,
    self: {
      location: { origin }, clients, skipWaiting,
      registration: { showNotification },
      addEventListener: (name: string, listener: (event: WorkerEvent) => void) => listeners.set(name, listener),
    },
  })
  async function emit(name: string, fields: Partial<WorkerEvent> = {}) {
    let response: Promise<Response> | undefined
    const tasks: Promise<unknown>[] = []
    const listener = listeners.get(name)
    if (!listener) throw new Error(`Missing service worker handler: ${name}`)
    listener({
      ...fields,
      waitUntil: (promise) => { tasks.push(promise) },
      respondWith: (promise) => { response = promise },
    })
    await Promise.all(tasks)
    return response ? await response : undefined
  }
  return { emit, cache, caches, clients, fetch, offline, skipWaiting, showNotification }
}

describe('public service worker: private learning data stays on the network', () => {
  it('installs only the public offline document and icons, without activating an update', async () => {
    const app = worker()
    await app.emit('install')
    const paths = app.cache.addAll.mock.calls.flatMap(([entries]) => entries)
    expect(paths).toContain('/offline.html')
    expect(paths.every((path) => path === '/offline.html' || /^\/images\/pwa\/[^/]+\.png$/.test(path))).toBe(true)
    expect(app.skipWaiting).not.toHaveBeenCalled()
  })

  it('cleans up its old shell cache and leaves other applications alone', async () => {
    const app = worker()
    await app.emit('activate')
    expect(app.caches.delete).toHaveBeenCalledWith('mentorcareer-shell-v0')
    expect(app.caches.delete).not.toHaveBeenCalledWith('unrelated-app-cache')
    expect(app.clients.claim).toHaveBeenCalledOnce()
  })

  it('does not cache a successful authenticated lesson navigation', async () => {
    const app = worker()
    const request = { url: `${origin}/lessons/private-lesson`, method: 'GET', mode: 'navigate' }
    const response = await app.emit('fetch', { request })
    expect(await response?.text()).toBe('PRIVATE LESSON CONTENT')
    expect(app.fetch).toHaveBeenCalledWith(request)
    expect(app.cache.put).not.toHaveBeenCalled()
    expect(app.caches.open).not.toHaveBeenCalled()
    expect(app.caches.match).not.toHaveBeenCalled()
  })

  it('offline navigation returns the generic document instead of a previous private lesson', async () => {
    const app = worker()
    app.fetch.mockRejectedValueOnce(new TypeError('Offline'))
    const response = await app.emit('fetch', { request: { url: `${origin}/lessons/private-lesson`, method: 'GET', mode: 'navigate' } })
    expect(response).toBe(app.offline)
    expect(app.caches.match).toHaveBeenCalledWith('/offline.html')
    expect(app.cache.put).not.toHaveBeenCalled()
  })

  it.each(['/api/users/me', '/api/learning-state', '/api/yandex-disk/stream?lesson=1&block=2', '/api/protected-media/video.mp4', '/courses/private-course?download=1'])(
    'does not intercept API/media/background requests: %s', async (path) => {
      const app = worker()
      const result = await app.emit('fetch', { request: { url: origin + path, method: 'GET', mode: 'cors' } })
      expect(result).toBeUndefined()
      expect(app.fetch).not.toHaveBeenCalled()
      expect(app.caches.match).not.toHaveBeenCalled()
    },
  )

  it('does not intercept mutations or another origin', async () => {
    const app = worker()
    await app.emit('fetch', { request: { url: `${origin}/api/users/logout`, method: 'POST', mode: 'cors' } })
    await app.emit('fetch', { request: { url: 'https://other.example/offline.html', method: 'GET', mode: 'navigate' } })
    expect(app.fetch).not.toHaveBeenCalled()
    expect(app.caches.match).not.toHaveBeenCalled()
  })

  it('updates only after the explicit activation message', async () => {
    const app = worker()
    await app.emit('message', { data: { type: 'LMS_NOTIFICATION' } })
    expect(app.skipWaiting).not.toHaveBeenCalled()
    await app.emit('message', { data: { type: 'ACTIVATE_UPDATE' } })
    expect(app.skipWaiting).toHaveBeenCalledOnce()
  })
})

describe('public service worker: visible and safe push notifications', () => {
  it('bounds untrusted text and informs open windows after displaying a notification', async () => {
    const app = worker()
    const postMessage = vi.fn()
    app.clients.matchAll.mockResolvedValue([{ url: origin, postMessage, navigate: vi.fn(), focus: vi.fn() }])
    await app.emit('push', { data: { json: () => ({ title: 't'.repeat(1000), message: 'b'.repeat(1000), tag: 'g'.repeat(1000), link: '/courses/backend#lesson' }) } })
    const [title, options] = app.showNotification.mock.calls[0]
    expect(title.length).toBeLessThanOrEqual(120)
    expect(String(options.body).length).toBeLessThanOrEqual(300)
    expect(String(options.tag).length).toBeLessThanOrEqual(100)
    expect(options.data).toEqual({ url: '/courses/backend#lesson' })
    expect(options.icon).toMatch(/^\/images\/pwa\//)
    expect(postMessage).toHaveBeenCalledWith({ type: 'LMS_NOTIFICATION' })
  })

  it('malformed JSON still displays a visible fallback notification', async () => {
    const app = worker()
    await app.emit('push', { data: { json: () => { throw new SyntaxError('Invalid JSON') } } })
    expect(app.showNotification).toHaveBeenCalledWith('MentorCareer', expect.objectContaining({ body: 'У вас новое уведомление', data: { url: '/' } }))
  })

  it.each(['https://foreign.example/steal', '//foreign.example/steal', 'javascript:alert(1)', '/api', '/api/users/logout', '/%61pi/foo', '/%2561pi/foo', '/admin/collections/users', `https://user:password@learn.mentorcareer.ru/profile`])(
    'rejects an unsafe notification destination: %s', async (link) => {
      const app = worker()
      await app.emit('push', { data: { json: () => ({ link }) } })
      expect(app.showNotification.mock.calls[0][1].data).toEqual({ url: '/' })
      const close = vi.fn()
      await app.emit('notificationclick', { notification: { close, data: { url: link } } })
      expect(close).toHaveBeenCalledOnce()
      expect(app.clients.openWindow).toHaveBeenCalledWith(origin + '/')
    },
  )

  it('navigates and focuses an existing same-origin window, including an old notification', async () => {
    const app = worker()
    const navigate = vi.fn(async (_url: string) => undefined)
    const focus = vi.fn(async () => undefined)
    app.clients.matchAll.mockResolvedValue([{ url: `${origin}/profile`, postMessage: vi.fn(), navigate, focus }])
    await app.emit('notificationclick', { notification: { close: vi.fn(), data: { url: '/courses/node?resume=1#lesson' } } })
    expect(navigate).toHaveBeenCalledWith(`${origin}/courses/node?resume=1#lesson`)
    expect(focus).toHaveBeenCalledOnce()
    expect(app.clients.openWindow).not.toHaveBeenCalled()
  })

  it('opens a new same-origin window if only an unrelated window exists', async () => {
    const app = worker()
    const focus = vi.fn(async () => undefined)
    app.clients.matchAll.mockResolvedValue([{ url: 'https://foreign.example/', postMessage: vi.fn(), navigate: vi.fn(), focus }])
    await app.emit('notificationclick', { notification: { close: vi.fn(), data: { url: '/profile' } } })
    expect(app.clients.openWindow).toHaveBeenCalledWith(`${origin}/profile`)
    expect(focus).not.toHaveBeenCalled()
  })
})
