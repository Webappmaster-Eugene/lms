import { expect, test, type Page } from '@playwright/test'

import { stateOf } from '../env'

/**
 * Курс целиком на проде: «Осталось ~», отметка каждого урока, «Курс пройден!»,
 * сертификат со своей страницей, копированием ссылки и печатью в PDF,
 * «Ближайшие достижения» в профиле. Берётся самый короткий курс каталога.
 */
test.use({ storageState: stateOf('student'), permissions: ['clipboard-read', 'clipboard-write'] })

async function shortestCourse(page: Page): Promise<{ title: string; href: string }> {
  await page.goto('/courses')
  const cards = page.locator('a[href^="/courses/"]').filter({ has: page.locator('h3') })
  await expect(cards.first()).toBeVisible()
  let best: { title: string; href: string; lessons: number } | null = null
  for (const card of await cards.all()) {
    const lessons = Number((await card.innerText()).match(/(\d+)\s+урок/)?.[1] ?? 0)
    if (lessons >= 2 && (!best || lessons < best.lessons)) {
      best = { title: (await card.locator('h3').innerText()).trim(), href: (await card.getAttribute('href')) ?? '', lessons }
    }
  }
  if (!best) throw new Error('В каталоге нет курса хотя бы с двумя уроками')
  expect(best.lessons, 'самый короткий курс не должен быть огромным — прогон отмечает все его уроки').toBeLessThanOrEqual(15)
  return best
}

test('самый короткий курс от первого урока до сертификата', async ({ page }) => {
  test.setTimeout(180_000)
  const course = await shortestCourse(page)

  await page.goto(course.href)
  await page.getByRole('link', { name: /Начать курс|Продолжить с урока/ }).click()
  await expect(page).toHaveURL(/\/lessons\//)

  let first = true
  for (let step = 0; step < 20; step += 1) {
    const mark = page.getByRole('button', { name: 'Отметить пройденным' })
    if (await mark.isVisible()) {
      await mark.click()
      await expect(page.getByRole('button', { name: 'Урок пройден' })).toBeVisible()
    }
    if (first) {
      // После первого урока курс называет, сколько осталось.
      first = false
      const lesson = page.url()
      await page.goto(course.href)
      await expect(page.getByText(/^Осталось ~/)).toBeVisible()
      await page.goto(lesson)
      continue
    }
    // После отметки кнопка перерисовывается (router.refresh) — переходим по адресу, а не кликом.
    const next = page.getByRole('link', { name: /Следующий урок:/ })
    if (await next.isVisible()) {
      await page.goto((await next.getAttribute('href')) as string)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      continue
    }
    break
  }
  await expect(page.getByText('Курс пройден!')).toBeVisible()

  await page.goto(course.href)
  await expect(page.getByText('Курс пройден.')).toBeVisible()
  await expect(page.getByText(/^Осталось ~/)).toHaveCount(0)

  // Сертификат выдаёт хук после бонуса за курс — даём ему мгновение.
  await expect(async () => {
    await page.goto('/certificates')
    await expect(page.getByText(course.title).first()).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await page.getByRole('link').filter({ hasText: course.title }).first().click()
  await expect(page).toHaveURL(/\/certificates\/\d+$/)
  await expect(page.getByText('Сертификат MentorCareer')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Тест Ученик')
  await expect(page.getByText(`«${course.title}»`)).toBeVisible()
  await expect(page.getByText(/^MC-C-/)).toBeVisible()

  const certificateUrl = page.url()
  await page.getByRole('button', { name: 'Скопировать ссылку' }).click()
  await expect(page.getByRole('button', { name: 'Ссылка скопирована' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(certificateUrl)

  // «Скачать PDF» открывает печать браузера — подменяем её, чтобы не ждать диалога.
  await page.evaluate(() => {
    ;(window as unknown as { printed: boolean }).printed = false
    window.print = () => {
      ;(window as unknown as { printed: boolean }).printed = true
    }
  })
  await page.getByRole('button', { name: 'Скачать PDF' }).click()
  expect(await page.evaluate(() => (window as unknown as { printed: boolean }).printed)).toBe(true)
})

test('профиль: ближайшие достижения с прогрессом', async ({ page }) => {
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'Ближайшие достижения' })).toBeVisible()
  await expect(page.getByRole('progressbar', { name: /Прогресс к достижению/ }).first()).toBeVisible()
})
