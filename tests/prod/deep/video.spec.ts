import { expect, test } from '@playwright/test'

import { stateOf } from '../env'

/**
 * Видео на проде: место остановки запоминается, «С начала» сбрасывает.
 * Ролик идёт с Яндекс.Диска через наш прокси; если метаданные не пришли
 * за разумное время (сеть, формат), проверка пропускается с пояснением.
 */
test.use({ storageState: stateOf('student') })

test('видео продолжается с места остановки, «С начала» сбрасывает', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/courses')
  const courses = await page.locator('a[href^="/courses/"]').filter({ has: page.locator('h3') }).evaluateAll((as) =>
    as.slice(0, 6).map((a) => new URL((a as HTMLAnchorElement).href).pathname),
  )
  let lesson: string | null = null
  for (const course of courses) {
    await page.goto(course)
    await page.getByRole('link', { name: /Начать курс|Продолжить с урока/ }).click()
    await expect(page).toHaveURL(/\/lessons\//)
    if ((await page.locator('video').count()) > 0) {
      lesson = new URL(page.url()).pathname
      break
    }
  }
  test.skip(!lesson, 'в первых курсах каталога нет урока с видео')

  const loaded = await page
    .locator('video')
    .first()
    .evaluate(
      (video: HTMLVideoElement) =>
        new Promise<boolean>((resolve) => {
          if (video.readyState >= 1 && Number.isFinite(video.duration)) return resolve(true)
          video.addEventListener('loadedmetadata', () => resolve(true), { once: true })
          setTimeout(() => resolve(false), 25_000)
        }),
    )
  test.skip(!loaded, 'метаданные ролика не пришли за 25 с — продолжение не проверить')

  await page.locator('video').first().evaluate((video: HTMLVideoElement) => {
    video.currentTime = 65
    video.dispatchEvent(new Event('pause'))
  })
  await page.reload()
  await expect(page.getByText('Продолжили с 1:05')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: /С начала/ }).click()
  await expect(page.getByText(/Продолжили с/)).toHaveCount(0)
  expect(await page.locator('video').first().evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(2)
})
