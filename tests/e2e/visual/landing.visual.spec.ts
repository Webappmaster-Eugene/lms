import { test } from '@playwright/test'

import { LANDING_URL } from '../fixtures/env'
import { snap, WIDTHS } from './stabilize'

/**
 * Скриншоты лендинга. Тёмной темы у лендинга нет (одна палитра, без
 * prefers-color-scheme) — снимаем только её на 375 и 1440.
 */
test.skip(process.platform !== 'linux', 'эталоны сняты в контейнере Playwright — запускайте pnpm test:visual')
test.use({ baseURL: LANDING_URL })

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('главная', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/')
      await snap(page, `landing-${width}`)
    })

    test('404', async ({ page }) => {
      await page.goto('/no-such-page')
      await snap(page, `landing-404-${width}`)
    })
  })
}
