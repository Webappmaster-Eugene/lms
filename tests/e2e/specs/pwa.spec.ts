import { expect, test } from '@playwright/test'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

const localUrl = new URL(APP_URL)
// Docker's host alias is HTTP during E2E. Production keeps the browser's real HTTPS requirement.
const secureLocalOrigin = localUrl.protocol === 'http:' && ['host.docker.internal', 'localhost', '127.0.0.1'].includes(localUrl.hostname)
test.use({
  storageState: storageStateOf('student'),
  // Chromium's headless shell ignores the local secure-origin override; full Chromium honors it.
  channel: 'chromium',
  launchOptions: { args: secureLocalOrigin ? [`--unsafely-treat-insecure-origin-as-secure=${localUrl.origin}`] : [] },
})

interface PushPreferences {
  remindersEnabled: boolean
  pushEnabled: boolean
  timezone: string
  reminderHour: number
}

test('retries a native worker after an interrupted initial installation and network recovery without reload', async ({ page, context }) => {
  let scriptRequests = 0
  const response = await page.request.get('/sw.js')
  expect(response.status()).toBe(200)
  const source = await response.text()
  await context.route('**/sw.js', async route => {
    scriptRequests++
    // Keep the native lifecycle and application worker; fail only its first install.
    const interruption = "\nself.addEventListener('install', event => event.waitUntil(new Promise((resolve, reject) => setTimeout(() => reject(new Error('Interrupted precache')), 500))))"
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: source + (scriptRequests === 1 ? interruption : '') })
  })
  await page.addInitScript(() => {
    localStorage.setItem('lms:pwa-install-explained:v1', 'seen')
    const state = window as Window & { __initialWorkerState?: ServiceWorkerState }
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker)
    navigator.serviceWorker.register = async (...args) => {
      const registration = await register(...args)
      const worker = registration.installing
      worker?.addEventListener('statechange', () => { state.__initialWorkerState = worker.state })
      return registration
    }
  })
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => (window as Window & { __initialWorkerState?: ServiceWorkerState }).__initialWorkerState)).toBe('redundant')
  const offlineBanner = page.getByRole('status').filter({ hasText: 'Нет подключения' })
  try {
    await context.setOffline(true)
    await expect(offlineBanner).toBeVisible()
    await context.setOffline(false)
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active)), { timeout: 30_000 }).toBe(true)
    await expect(page.getByRole('status')).toHaveCount(0)
    expect(scriptRequests).toBeGreaterThanOrEqual(2)
  } finally { await context.setOffline(false) }
})

test('manifest and public PNG icons are installable resources with real pixel dimensions', async ({ page }) => {
  await page.goto('/')
  const manifestLink = page.locator('link[rel="manifest"]')
  await expect(manifestLink).toHaveAttribute('href', /manifest\.webmanifest/)
  const href = await manifestLink.getAttribute('href')
  expect(href).toBeTruthy()
  const manifestResponse = await page.request.get(new URL(href ?? '', APP_URL).href)
  expect(manifestResponse.status()).toBe(200)
  const manifest = await manifestResponse.json() as { start_url: string; scope: string; display: string; icons: Array<{ src: string; type: string; sizes: string; purpose?: string }> }
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBe('/')
  expect(manifest.scope).toBe('/')
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable' && icon.sizes === '512x512')).toBe(true)
  const pngIcons = manifest.icons.filter((icon) => icon.type === 'image/png')
  expect(pngIcons.length).toBeGreaterThanOrEqual(2)
  for (const icon of pngIcons) {
    const response = await page.request.get(new URL(icon.src, APP_URL).href)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')
    const bytes = await response.body()
    expect(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true)
    const [width, height] = icon.sizes.split('x').map(Number)
    expect(bytes.readUInt32BE(16)).toBe(width)
    expect(bytes.readUInt32BE(20)).toBe(height)
  }
})

test('real service worker provides generic offline navigation and never caches private lessons or API/media', async ({ page, context }) => {
  await page.goto(`/lessons/${CONTENT.lessons[0].slug}`)
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true)
  await expect(page.getByRole('heading', { name: CONTENT.lessons[0].title, exact: true })).toBeVisible()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  const me = await page.evaluate(async () => (await fetch('/api/users/me', { credentials: 'include' })).status)
  expect(me).toBe(200)
  await page.evaluate(async () => { await fetch('/api/protected-media/nonexistent-e2e-video.mp4', { credentials: 'include' }) })

  async function cachedPaths() {
    return page.evaluate(async () => {
      const urls: string[] = []
      for (const key of await caches.keys()) {
        const cache = await caches.open(key)
        for (const request of await cache.keys()) urls.push(new URL(request.url).pathname)
      }
      return urls
    })
  }
  const before = await cachedPaths()
  expect(before).toContain('/offline.html')
  expect(before.every((path) => path === '/offline.html' || /^\/images\/pwa\/[^/]+\.png$/.test(path))).toBe(true)
  try {
    await context.setOffline(true)
    await page.goto(`/lessons/${CONTENT.lessons[1].slug}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Сейчас нет подключения' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Попробовать снова' })).toBeVisible()
    await expect(page.getByRole('heading', { name: CONTENT.lessons[0].title, exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: CONTENT.lessons[1].title, exact: true })).toHaveCount(0)
    expect(await cachedPaths()).toEqual(before)
  } finally {
    await context.setOffline(false)
  }
  await page.getByRole('button', { name: 'Попробовать снова' }).click()
  await expect(page.getByRole('heading', { name: CONTENT.lessons[1].title, exact: true })).toBeVisible()
})

test('notification preferences persist after reload without asking for push permission on mount', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as Window & { __pwaPermissionRequests?: number }
    state.__pwaPermissionRequests = 0
    if ('Notification' in window) {
      const original = Notification.requestPermission.bind(Notification)
      Notification.requestPermission = (...args) => {
        state.__pwaPermissionRequests = (state.__pwaPermissionRequests ?? 0) + 1
        return original(...args)
      }
    }
  })
  const baselineResponse = await page.request.get(`${APP_URL}/api/push/settings`)
  expect(baselineResponse.status()).toBe(200)
  const baseline = (await baselineResponse.json()).preferences as PushPreferences
  try {
    await page.goto('/settings/notifications')
    await expect(page.getByRole('heading', { name: 'Уведомления', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Сохранить настройки' })).toBeEnabled()
    expect(await page.evaluate(() => (window as Window & { __pwaPermissionRequests?: number }).__pwaPermissionRequests)).toBe(0)
    await page.getByRole('checkbox', { name: /Напоминать, если я давно не учился/ }).setChecked(false)
    await page.getByRole('checkbox', { name: /Разрешить push на подключённых устройствах/ }).setChecked(false)
    await page.getByRole('combobox', { name: 'Время напоминания' }).selectOption('10')
    await page.getByRole('combobox', { name: 'Часовой пояс' }).selectOption('Asia/Novosibirsk')
    const saved = page.waitForResponse((response) => response.url().endsWith('/api/push/settings') && response.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'Сохранить настройки' }).click()
    expect((await saved).status()).toBe(200)
    await expect(page.getByRole('status').filter({ hasText: 'Настройки сохранены.' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Сохранить настройки' })).toBeEnabled()
    await expect(page.getByRole('checkbox', { name: /Напоминать, если я давно не учился/ })).not.toBeChecked()
    await expect(page.getByRole('checkbox', { name: /Разрешить push на подключённых устройствах/ })).not.toBeChecked()
    await expect(page.getByRole('combobox', { name: 'Время напоминания' })).toHaveValue('10')
    await expect(page.getByRole('combobox', { name: 'Часовой пояс' })).toHaveValue('Asia/Novosibirsk')
    expect(await page.evaluate(() => (window as Window & { __pwaPermissionRequests?: number }).__pwaPermissionRequests)).toBe(0)
  } finally {
    expect((await page.request.patch(`${APP_URL}/api/push/settings`, { data: baseline })).status()).toBe(200)
  }
})

test('phone browser and simulated standalone mode give appropriate installation guidance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/settings/app')
  await expect(page.getByText(/Android:/)).toBeVisible()
  await expect(page.getByText(/iPhone:/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }) })
  await page.reload()
  await expect(page.getByText('Вы уже открыли установленное приложение')).toBeVisible()
  // This verifies application UI in a browser simulation, not OS installation or physical push delivery.
  await expect(page.getByText(/Android:/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Настроить уведомления' })).toHaveAttribute('href', '/settings/notifications')
})
