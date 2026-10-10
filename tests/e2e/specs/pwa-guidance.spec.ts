import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CONTENT } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'
import { PUBLIC_FONT_PATHS } from '../../../src/lib/public-fonts'

test.use({ storageState: storageStateOf('student'), viewport: { width: 390, height: 844 } })

test('шрифты доступны до входа и кэшируются без обращения к Google', async ({ page, playwright }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/')
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(2)
  await page.evaluate(() => document.fonts.ready)
  expect(requests.some((url) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url))).toBe(false)
  const guest = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL, storageState: { cookies: [], origins: [] } })
  try {
    for (const path of PUBLIC_FONT_PATHS.filter((path) => path.endsWith('.woff2'))) {
      const response = await guest.get(path, { maxRedirects: 0 })
      expect(response.status(), path).toBe(200)
      expect(response.headers()['cache-control']).toContain('immutable')
      expect((await response.body()).subarray(0, 4).toString()).toBe('wOF2')
    }
    const unknown = await guest.get('/fonts/inter/private.woff2', { maxRedirects: 0 })
    expect(unknown.status()).toBe(307)
  } finally { await guest.dispose() }
})

test('первый мобильный вход объясняет установку, закрывается и не повторяется', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true })
    const state = window as Window & { __permissionRequests?: number }
    state.__permissionRequests = 0
    if ('Notification' in window) Notification.requestPermission = () => {
      state.__permissionRequests = (state.__permissionRequests ?? 0) + 1
      return Promise.resolve('denied')
    }
  })
  await page.goto('/')
  const explanation = page.getByRole('dialog', { name: 'Учиться удобнее с телефона' })
  await expect(explanation).toBeVisible()
  await expect(explanation.getByRole('link', { name: 'Установка приложения' })).toHaveAttribute('href', '/settings/app')
  expect(await page.evaluate(() => (window as Window & { __permissionRequests?: number }).__permissionRequests)).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const accessibility = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(accessibility.violations).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('pwa-install-explanation.png') })
  await explanation.getByRole('button', { name: 'Продолжить в браузере' }).click()
  await expect(explanation).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('lms:pwa-install-explained:v1'))).toBe('seen')
  await page.reload()
  await page.waitForTimeout(1800)
  await expect(explanation).toHaveCount(0)
  const navigation = page.getByRole('navigation', { name: 'Основная навигация' })
  await expect(navigation.getByRole('link', { name: 'Роадмапы' })).toHaveAttribute('href', '/roadmaps')
  await expect(navigation.getByRole('link', { name: 'Рейтинг' })).toHaveCount(0)
})

test('iPhone получает инструкцию добавления на экран Домой', async ({ browser }) => {
  const context = await browser.newContext({
    storageState: storageStateOf('student'), viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    isMobile: true, hasTouch: true,
  })
  try {
    const page = await context.newPage()
    await page.goto(test.info().project.use.baseURL ?? 'http://localhost:3100')
    const explanation = page.getByRole('dialog', { name: 'Учиться удобнее с телефона' })
    await expect(explanation).toBeVisible()
    await expect(explanation.getByText(/На iPhone или iPad/)).toBeVisible()
    await expect(explanation.getByText(/iOS 16.4/)).toBeVisible()
    await explanation.getByRole('button', { name: 'Закрыть подсказку об установке' }).click()
    await expect(explanation).toHaveCount(0)
  } finally { await context.close() }
})

test('после восстановления сети плашка исчезает даже при устаревшем navigator.onLine', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('lms:pwa-install-explained:v1', 'seen'))
  await page.goto(`/lessons/${CONTENT.lessons[0].slug}`)
  await page.getByRole('button', { name: 'Ещё', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Меню платформы' })
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  const response = await page.request.get('/api/connectivity')
  expect(response.status()).toBe(204)
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(response.headers()['x-lms-connectivity']).toBe('1')
  const banner = page.getByRole('status').filter({ hasText: 'Нет подключения' })
  try {
    await context.setOffline(true)
    await expect(banner).toBeVisible()
    await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { value: false, configurable: true }))
    await context.setOffline(false)
    await expect(banner).toHaveCount(0)
    expect(await page.evaluate(() => navigator.onLine)).toBe(false)
    await expect(page.getByRole('heading', { name: CONTENT.lessons[0].title, exact: true })).toBeVisible()
  } finally { await context.setOffline(false) }
})
