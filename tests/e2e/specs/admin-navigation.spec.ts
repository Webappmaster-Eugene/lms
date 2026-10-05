import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CONTENT } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

async function openAdminMenu(page: Page) {
  const sidebar = page.locator('aside.nav')
  await expect(sidebar).toHaveClass(/nav--nav-hydrated/)
  if (await sidebar.getAttribute('inert') !== null) {
    await page.locator('#nav-toggler button').first().click()
  }
  await expect(sidebar).not.toHaveAttribute('inert')
}

test.describe('переходы администратора', () => {
  test.use({ storageState: storageStateOf('admin') })

  test('меню → редактор → карта → настройки → редактор → платформа', async ({ page }, testInfo) => {
    await page.goto('/')
    const menu = page.locator('aside').last().getByRole('navigation', { name: 'Меню платформы' })
    await expect(menu.getByRole('link', { name: 'Редактор роадмапов' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('admin-menu-desktop.png') })
    await menu.getByRole('link', { name: 'Редактор роадмапов' }).click()
    await expect(page.getByRole('heading', { name: 'Визуальный редактор роадмапов' })).toBeVisible()
    await page.getByRole('link', { name: new RegExp(CONTENT.roadmap.title) }).click()
    await expect(page).toHaveURL(/\/admin\/roadmap-editor\/\d+$/)
    await expect(page.getByRole('heading', { name: CONTENT.roadmap.title })).toBeVisible()
    await openAdminMenu(page)
    await expect(page.getByRole('navigation', { name: 'Переходы администратора' })).toBeVisible()
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
      const accessibility = await new AxeBuilder({ page }).include('.platform-admin-links').withRules(['color-contrast']).analyze()
      expect(accessibility.violations, `контраст меню в теме ${theme}`).toEqual([])
    }
    await page.screenshot({ path: testInfo.outputPath('roadmap-editor-menu.png') })

    await page.getByRole('link', { name: 'Настройки роадмапа', exact: true }).click()
    await expect(page.locator('#field-title')).toHaveValue(CONTENT.roadmap.title)
    await page.getByRole('link', { name: 'Открыть визуальный редактор' }).click()
    await expect(page).toHaveURL(/\/admin\/roadmap-editor\/\d+$/)

    const opened = page.waitForEvent('popup')
    await page.getByRole('link', { name: 'Открыть на платформе' }).click()
    const preview = await opened
    await expect(preview).toHaveURL(new RegExp(`/roadmaps/${CONTENT.roadmap.slug}$`))
    await expect(preview.getByRole('link', { name: 'Редактировать карту' })).toBeVisible()
    await preview.close()

    await page.getByRole('link', { name: 'Все роадмапы', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Визуальный редактор роадмапов' })).toBeVisible()
    await openAdminMenu(page)
    await page.getByRole('navigation', { name: 'Переходы администратора' }).getByRole('link', { name: 'Открыть платформу' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(menu.getByRole('link', { name: 'Редактор роадмапов' })).toBeVisible()
  })

  test('меню на телефоне → контент → импорт', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Ещё', exact: true }).click()
    const menu = page.locator('aside').first()
    await expect(menu.getByRole('link', { name: 'Редактор роадмапов' })).toBeVisible()
    await menu.locator('summary').filter({ hasText: 'Настройки контента в CMS' }).click()
    await page.screenshot({ path: testInfo.outputPath('admin-menu-mobile.png') })
    await menu.getByRole('link', { name: 'Импорт из Яндекс.Диска' }).click()
    await expect(page).toHaveURL(/\/admin\/import-yandex$/)
    await expect(page.getByRole('button', { name: 'Закрыть меню' })).not.toBeInViewport()
  })

  test('на странице карты есть переход прямо к её редактору', async ({ page }) => {
    await page.goto(`/roadmaps/${CONTENT.roadmap.slug}`)
    await page.getByRole('link', { name: 'Редактировать карту' }).click()
    await expect(page).toHaveURL(/\/admin\/roadmap-editor\/\d+$/)
    await expect(page.getByRole('heading', { name: CONTENT.roadmap.title })).toBeVisible()
  })
})

test('ученик видит карту без управления и кнопок редактирования', async ({ browser }) => {
  const context = await browser.newContext({ storageState: storageStateOf('student') })
  try {
    const page = await context.newPage()
    await page.goto(`/roadmaps/${CONTENT.roadmap.slug}`)
    await expect(page.getByRole('heading', { name: CONTENT.roadmap.title })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Редактировать карту' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Редактор роадмапов' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'CMS и настройки' })).toHaveCount(0)
    await page.goto('/admin/roadmap-editor')
    await expect(page.getByRole('heading', { name: 'Визуальный редактор роадмапов' })).toHaveCount(0)
  } finally {
    await context.close()
  }
})
