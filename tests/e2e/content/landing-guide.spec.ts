import { expect, test } from '@playwright/test'

import { LANDING_URL } from '../fixtures/env'

test.use({ baseURL: LANDING_URL })

test('инструкция содержит только ссылки на платформу и не рекламирует автора', async ({ page }) => {
  await page.goto('/')
  const external = await page.locator('a[href^="https:"]').evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).origin))
  expect(new Set(external)).toEqual(new Set(['https://learn.mentorcareer.ru']))
  const text = await page.locator('body').innerText()
  expect(text).not.toMatch(/Надточеев|оплата после|до оффера|записаться на|лет опыта/i)
  expect(await page.locator('img[src^="/guide/"]').count()).toBeGreaterThanOrEqual(10)
  await expect(page.getByText('Зелёные тесты после «Запустить» ещё не означают зачёт. Всегда завершайте решение успешной отправкой на сервер.')).toBeVisible()
})

test('шаги выбираются с экрана, показ можно остановить, увеличение закрывается с возвратом фокуса', async ({ page }) => {
  await page.goto('/#trainer')
  const guide = page.locator('#trainer [data-walkthrough]')
  const step = guide.getByRole('button', { name: 'Шаг 3: Получите зачёт: «Отправить»' })
  await step.click()
  await expect(step).toHaveAttribute('aria-pressed', 'true')
  await expect(guide.locator('[data-step="2"]')).toHaveAttribute('data-active', 'true')
  await guide.getByRole('button', { name: 'Показать шаги' }).click()
  await expect(guide.getByRole('button', { name: 'Остановить' })).toHaveAttribute('aria-pressed', 'true')
  await guide.getByRole('button', { name: 'Остановить' }).click()
  await expect(guide.getByRole('button', { name: 'Показать шаги' })).toHaveAttribute('aria-pressed', 'false')
  const zoom = guide.getByRole('button', { name: 'Увеличить' })
  await zoom.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').locator('img')).toHaveAttribute('src', /trainer\.webp$/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(zoom).toBeFocused()
})

test('чек-лист сохраняется после перезагрузки и не отправляет результат в LMS', async ({ page }) => {
  await page.goto('/#checklist')
  const writes: string[] = []
  page.on('request', request => {
    if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.url())
  })
  await page.getByRole('checkbox', { name: 'Войти в свой аккаунт', exact: true }).check()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Войти в свой аккаунт', exact: true })).toBeChecked()
  await expect(page.locator('.checklist-progress')).toHaveText('Выполнено 1 из 6')
  expect(writes).toEqual([])
})

test('мобильная версия не прокручивается по горизонтали, все разделы доступны без JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } })
  const page = await context.newPage()
  await page.goto(LANDING_URL)
  await expect(page.getByRole('heading', { name: 'Напишите код, проверьте и отправьте решение' })).toBeVisible()
  await expect(page.locator('#trainer .screen-steps')).toContainText('Отправьте решение на сервер')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.locator('#faq summary').filter({ hasText: 'Тесты зелёные, а задача не засчитана?' }).click()
  await expect(page.locator('#faq details[open]')).toContainText('Для зачёта нажмите «Отправить»')
  await context.close()
})
