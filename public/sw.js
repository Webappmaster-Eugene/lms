/* Only the public offline shell is cached. Lessons, APIs and media always use the network. */
const SHELL_CACHE = 'mentorcareer-shell-v1'
const SHELL = ['/offline.html', '/images/pwa/icon-192.png', '/images/pwa/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('mentorcareer-shell-') && key !== SHELL_CACHE) await caches.delete(key)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (SHELL.includes(url.pathname) && !url.search) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)))
  } else if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => {
      return (await caches.match('/offline.html')) || new Response('Нет подключения', { status: 503 })
    }))
  }
})

function destination(value) {
  try {
    const url = new URL(typeof value === 'string' ? value : '/', self.location.origin)
    if (url.origin !== self.location.origin || url.username || url.password) return '/'
    let path = url.pathname
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const decoded = decodeURIComponent(path)
      if (decoded === path) break
      path = decoded
    }
    if (/^\/(?:api|admin)(?:\/|$)/i.test(path) || path.startsWith('//') || path.includes('\\') || [...path].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return '/'
    return url.pathname + url.search + url.hash
  } catch { return '/' }
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {}
    try { data = event.data?.json() || {} } catch { /* An invalid payload must still display a visible notification. */ }
    await self.registration.showNotification(
      typeof data.title === 'string' ? data.title.slice(0, 120) : 'MentorCareer',
      {
        body: typeof data.message === 'string' ? data.message.slice(0, 300) : 'У вас новое уведомление',
        icon: '/images/pwa/icon-192.png',
        badge: '/images/pwa/icon-192.png',
        tag: typeof data.tag === 'string' ? data.tag.slice(0, 100) : undefined,
        data: { url: destination(data.link) },
      },
    )
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) client.postMessage({ type: 'LMS_NOTIFICATION' })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(destination(event.notification.data?.url), self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows.find((window) => new URL(window.url).origin === self.location.origin)
    if (client) {
      await client.navigate(target)
      await client.focus()
    } else await self.clients.openWindow(target)
  })())
})
