import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { APP_URL, storageStateOf } from '../fixtures/env'

// These fixtures are local; no paid model calls or real private storage operations.
test('библиотека и личный отчёт на телефоне: фильтры, приватность, навигация и доступность', async ({ browser }, testInfo) => {
  const learner = await browser.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('student'), viewport: { width: 320, height: 780 } })
  const stranger = await browser.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('leader'), viewport: { width: 320, height: 780 } })
  try {
    const page = await learner.newPage()
    await page.addInitScript(() => { localStorage.setItem('lms:pwa-install-explained:v1', 'seen'); localStorage.setItem('theme', 'light') })
    await page.goto('/interviews?direction=react&category=personal')
    await expect(page.getByRole('heading', { name: 'Собеседования', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Мой тестовый React собес/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Чужая личная запись/ })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('interviews-320-light.png'), fullPage: true })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.screenshot({ path: testInfo.outputPath('interviews-320-dark.png'), fullPage: true })
    await page.getByRole('link', { name: /Мой тестовый React собес/ }).click()
    await expect(page.getByRole('heading', { name: 'Мой тестовый React собес', exact: true })).toBeVisible()
    await expect(page.getByText('Понятные ответы, стоит подробнее объяснять компромиссы.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Сделать новый разбор|Анализировать мой собес/ })).toHaveCount(0)
    expect(await page.locator('video').getAttribute('playsinline')).not.toBeNull()
    const detailUrl = page.url()
    const privateId = Number(new URL(detailUrl).pathname.split('/').at(-1))
    expect((await stranger.request.get(`/api/interviews/${privateId}`)).status()).toBe(404)
    expect((await stranger.request.get(`/api/interviews/${privateId}/stream`)).status()).toBe(404)
    await page.getByRole('button', { name: 'Ещё', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Собеседования', exact: true })).toBeVisible()
    await page.getByRole('dialog').getByRole('link', { name: 'Собеседования', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Мои собесы', exact: true }).click()
    await expect(page.getByRole('link', { name: /Мой тестовый React собес/ })).toBeVisible()
  } finally { await Promise.all([learner.close(), stranger.close()]) }
})
