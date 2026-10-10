import { expect, test } from '@playwright/test'
import { APP_URL, storageStateOf } from '../fixtures/env'

const origin = new URL(APP_URL).origin
const secureLocalOrigin = origin.startsWith('http:') && ['host.docker.internal', 'localhost', '127.0.0.1'].includes(new URL(origin).hostname)
test.use({
  storageState: storageStateOf('student'),
  channel: 'chromium',
  permissions: ['notifications'],
  launchOptions: { args: secureLocalOrigin ? [`--unsafely-treat-insecure-origin-as-secure=${origin}`] : [] },
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lms:pwa-install-explained:v1', 'seen'))
})

test('native push event displays a notification and refreshes the open inbox', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page)
  let registrationId = ''
  cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
    const registration = registrations.find(item => item.scopeURL === origin + '/' && !item.isDeleted)
    if (registration) registrationId = registration.registrationId
  })
  await cdp.send('ServiceWorker.enable')
  await page.goto('/settings/app')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => registrationId).not.toBe('')
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.getByRole('button', { name: 'Уведомления', exact: true }).click()
  const inbox = page.getByRole('dialog', { name: 'Уведомления', exact: true })
  await expect(inbox).toBeVisible()
  await expect(inbox.getByText('Загружаем уведомления…')).toHaveCount(0)
  await page.evaluate(() => {
    const state = window as Window & { __pushMessages?: number }
    state.__pushMessages = 0
    window.addEventListener('lms:notification', () => { state.__pushMessages = (state.__pushMessages ?? 0) + 1 })
  })
  const refreshed = page.waitForRequest(request => request.url().includes('/api/notifications') && request.method() === 'GET')
  // DevTools injects a browser push event; external FCM/APNs delivery is a separate device check.
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin, registrationId,
    data: JSON.stringify({ title: 'Проверка PWA', message: 'Можно продолжить учёбу', link: '/learning-history', tag: 'pwa-native-test' }),
  })
  await refreshed
  await expect.poll(() => page.evaluate(() => (window as Window & { __pushMessages?: number }).__pushMessages)).toBe(1)
  await expect.poll(() => page.evaluate(async () => {
    const notifications = await (await navigator.serviceWorker.ready).getNotifications({ tag: 'pwa-native-test' })
    return notifications.map(notification => ({ title: notification.title, body: notification.body, url: notification.data.url }))
  })).toEqual([{ title: 'Проверка PWA', body: 'Можно продолжить учёбу', url: '/learning-history' }])
  await page.evaluate(async () => { for (const notification of await (await navigator.serviceWorker.ready).getNotifications()) notification.close() })
})

test('native worker displays a push with no application window and safely handles malformed data', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page)
  let registrationId = ''
  cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
    const registration = registrations.find(item => item.scopeURL === origin + '/' && !item.isDeleted)
    if (registration) registrationId = registration.registrationId
  })
  await cdp.send('ServiceWorker.enable')
  await page.goto('/settings/app')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => registrationId).not.toBe('')
  await page.goto('about:blank')
  expect(context.pages().every(window => !window.url().startsWith(origin))).toBe(true)
  await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId, data: 'invalid JSON' })
  await page.goto('/settings/app')
  await expect.poll(() => page.evaluate(async () => {
    const notifications = await (await navigator.serviceWorker.ready).getNotifications()
    return notifications.map(notification => ({ title: notification.title, body: notification.body, url: notification.data.url }))
  })).toEqual([{ title: 'MentorCareer', body: 'У вас новое уведомление', url: '/' }])
  await page.evaluate(async () => { for (const notification of await (await navigator.serviceWorker.ready).getNotifications()) notification.close() })
})

test('a native worker update waits for consent and reloads only after the update button', async ({ page }) => {
  await page.goto('/settings/app')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.evaluate(() => { (window as Window & { __beforePwaUpdate?: boolean }).__beforePwaUpdate = true })
  // Chromium's worker update fetch bypasses Playwright page routing. A changed
  // script URL starts a real update of the same root registration instead.
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js?e2e-update=1', { scope: '/', updateViaCache: 'none' }) })
  await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration('/'))?.waiting))).toBe(true)
  const update = page.getByRole('button', { name: 'Обновить', exact: true })
  await expect(update).toBeVisible()
  expect(await page.evaluate(() => (window as Window & { __beforePwaUpdate?: boolean }).__beforePwaUpdate)).toBe(true)
  await Promise.all([page.waitForEvent('domcontentloaded'), update.click()])
  expect(await page.evaluate(() => (window as Window & { __beforePwaUpdate?: boolean }).__beforePwaUpdate)).toBeUndefined()
  await expect(page.getByRole('heading', { name: 'Приложение', exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(origin + '/sw.js?e2e-update=1')
})
