import { expect, test } from '@playwright/test'

import { LANDING_USE } from '../fixtures/env'

test.use(LANDING_USE)

test('React + Next.js: страницы одной программы, честные условия и публичный пример', async ({ page }) => {
  await page.goto('/bootcamp/react-next/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Буткемп React + Next.js: два интерфейса одного продукта')
  await expect(page.locator('main')).toContainText('45 000 ₽ за весь поток')
  await expect(page.locator('main')).toContainText('до 10 человек')
  await expect(page.locator('main')).toContainText('Дата старта пока не объявлена')
  await expect(page.locator('[data-lead-form]')).toHaveAttribute('data-program', 'react-next')
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://info.mentorcareer.ru/bootcamp/react-next/')
  const schemas = await page.locator('script[type="application/ld+json"]').allTextContents()
  expect(schemas.join('')).not.toMatch(/startDate|endDate/)

  await page.locator('.bc-header-nav').getByRole('link', { name: 'Программа', exact: true }).click()
  await expect(page).toHaveURL(/\/bootcamp\/react-next\/program\/$/)
  await expect(page.locator('.bc-week')).toHaveCount(21)
  await expect(page.getByRole('heading', { name: 'Неделя 20. Защита и паспорт навыков' })).toBeVisible()
  await expect(page.locator('.bc-brand')).toHaveAttribute('href', '/bootcamp/react-next/')

  for (const path of ['format', 'payment', 'offer', 'quality', 'sample']) {
    const response = await page.goto(`/bootcamp/react-next/${path}/`)
    expect(response?.status(), path).toBe(200)
    await expect(page.locator('.bc-brand-product'), path).toHaveText('Буткемп React + Next.js')
    await expect(page.locator('main h1'), path).toBeVisible()
    await expect(page.locator('.bc-footer a').first(), path).toHaveAttribute('href', '/bootcamp/react-next/')
  }
  await expect(page.locator('main')).toContainText('ConditionList')
  await expect(page.locator('main')).not.toContainText('Ответы на самопроверку:')

  await page.goto('/bootcamp/nodejs/')
  await expect(page.locator('.bc-brand-product')).toHaveText('Буткемп Node.js')
  await expect(page.locator('.bc-brand')).toHaveAttribute('href', '/bootcamp/nodejs/')
  await expect(page.locator('.bc-header-nav').getByRole('link', { name: 'Программа', exact: true })).toHaveAttribute('href', '/bootcamp/nodejs/program/')
})

test('React + Next.js: мобильная страница без горизонтальной прокрутки и проверка формы', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/bootcamp/react-next/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Оставить заявку', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Имя', exact: true })).toBeFocused()
  await expect(page.locator('[data-error-for="name"]')).toBeVisible()
  await expect(page.locator('[data-done]')).toBeHidden()
  await page.goto('/bootcamp/react-next/sample/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
