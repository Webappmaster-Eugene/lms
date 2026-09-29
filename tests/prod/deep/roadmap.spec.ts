import { expect, test } from '@playwright/test'

import { stateOf } from '../env'

/** Роадмап на проде: поиск по карте, панель темы, «К моему шагу», список по этапам, легенда. */
test.use({ storageState: stateOf('student') })

test('карта: поиск открывает тему, Esc закрывает, пустой поиск назван', async ({ page }) => {
  await page.goto('/roadmaps')
  await page.locator('main a[href^="/roadmaps/"]').first().click()
  await expect(page.getByRole('tab', { name: 'Карта' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Обозначения' })).toContainText('Пройдена')

  const topic = await page.locator('datalist option').first().getAttribute('value')
  expect(topic).toBeTruthy()
  // У поля есть подсказки (list), поэтому его роль — combobox, а не searchbox.
  const search = page.getByRole('combobox', { name: 'Найти тему или курс на карте' })
  await search.fill(topic as string)
  await search.press('Enter')
  const panel = page.getByRole('complementary', { name: `Тема «${topic}»` })
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  await search.fill('zzzqqq-нет-такой-темы')
  await search.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Ничего не нашлось' })).toBeVisible()
})

test('«К моему шагу» ведёт к теме ученика, список по этапам открывается', async ({ page }) => {
  await page.goto('/roadmaps')
  const roadmaps = await page.locator('main a[href^="/roadmaps/"]').evaluateAll((as) =>
    as.map((a) => new URL((a as HTMLAnchorElement).href).pathname),
  )
  // У ученика уже есть прогресс: шаг показывается на роадмапе, где он учится.
  let found = false
  for (const href of [...new Set(roadmaps)]) {
    await page.goto(href)
    await expect(page.getByRole('tab', { name: 'Карта' })).toBeVisible()
    const step = page.getByRole('button', { name: 'К моему шагу' })
    if (!(await step.isVisible())) continue
    found = true
    await step.click()
    await expect(page.getByRole('complementary', { name: /^Тема «/ })).toBeVisible()
    break
  }
  // Кнопка есть, только если курсы ученика привязаны к темам роадмапа — на проде это зависит от данных.
  test.skip(!found, 'ни на одном роадмапе нет шага для этого ученика — курсы прогона не привязаны к темам')

  await page.getByRole('tab', { name: 'Список по этапам' }).click()
  await expect(page.getByRole('tab', { name: 'Список по этапам' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('main h3').first()).toBeVisible()
})
