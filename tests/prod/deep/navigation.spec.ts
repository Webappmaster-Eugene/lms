import { expect, test } from '@playwright/test'

import { stateOf } from '../env'

/** Полоса загрузки при переходе и стрелки уроков на проде. */
test.use({ storageState: stateOf('student') })

test('при переходе по меню сверху видна полоса загрузки, по приходе страницы — исчезает', async ({ page }) => {
  await page.goto('/')
  // Переход на проде быстрый — притормаживаем данные страницы, чтобы полосу было видно.
  await page.route(/_rsc=/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  const bar = page.locator('div[aria-hidden="true"].fixed.top-0')
  await page.locator('aside').last().getByRole('link', { name: 'Курсы', exact: true }).click()
  await expect(bar).toBeVisible()
  await expect(page).toHaveURL(/\/courses$/)
  await expect(bar).toHaveCount(0, { timeout: 15_000 })
})
