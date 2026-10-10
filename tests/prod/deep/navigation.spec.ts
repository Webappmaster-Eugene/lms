import { expect, test } from '@playwright/test'

import { stateOf } from '../env'

/** Полоса загрузки при переходе и стрелки уроков на проде. */
test.use({ storageState: stateOf('student') })

test('при переходе по меню сверху видна полоса загрузки, по приходе страницы — исчезает', async ({ page }) => {
  // Устанавливаем перехват до открытия страницы: иначе Next уже мог закешировать prefetch.
  let release = () => {}
  const navigation = new Promise<void>((resolve) => { release = resolve })
  await page.route(/_rsc=/, async (route) => {
    await navigation
    await route.continue()
  })
  await page.goto('/')
  const bar = page.locator('div[aria-hidden="true"].fixed.top-0')
  try {
    await page.locator('aside').last().getByRole('link', { name: 'Курсы', exact: true }).click()
    await expect(bar).toBeVisible()
  } finally { release() }
  await expect(page).toHaveURL(/\/courses$/)
  await expect(bar).toHaveCount(0, { timeout: 15_000 })
})
