import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CONTENT } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

async function openAdminMenu(page: Page) {
  const sidebar = page.locator('aside.nav')
  await expect(sidebar).toHaveClass(/nav--nav-hydrated/)
  if (await sidebar.getAttribute('inert') !== null) {
    await page.locator('button.nav-toggler:visible').click()
  }
  await expect(sidebar).not.toHaveAttribute('inert')
}

test.describe('переходы администратора', () => {
  test.use({ storageState: storageStateOf('admin') })

  test('меню → админка → редактор → карта → настройки → редактор → платформа', async ({ page }, testInfo) => {
    await page.goto('/')
    const menu = page.locator('aside').last()
    const adminLink = menu.getByRole('link', { name: 'Админка', exact: true })
    await expect(adminLink).toBeVisible()
    await expect(menu.getByRole('link', { name: 'Редактор роадмапов', exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('admin-menu-desktop.png') })
    await adminLink.focus()
    await expect(adminLink).toBeFocused()
    await adminLink.press('Enter')
    await expect(page).toHaveURL(/\/admin$/)
    await openAdminMenu(page)
    await page.getByRole('navigation', { name: 'Переходы администратора' }).getByRole('link', { name: 'Редактор роадмапов', exact: true }).click()
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
    await expect(adminLink).toBeVisible()
  })

  test('меню на телефоне → админка → контент → импорт', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const moreButton = page.getByRole('button', { name: 'Ещё', exact: true })
    await moreButton.click()
    const menu = page.getByRole('dialog', { name: 'Меню платформы', exact: true })
    await expect(menu).toBeVisible()
    await expect(menu).toHaveAttribute('aria-modal', 'true')
    await expect(menu.getByRole('button', { name: 'Закрыть меню', exact: true })).toBeFocused()
    await expect(menu.getByRole('link', { name: 'Редактор роадмапов', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(moreButton).toBeFocused()
    await moreButton.click()
    await expect(menu.getByRole('link', { name: 'Админка', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('admin-menu-mobile.png') })
    await menu.getByRole('link', { name: 'Админка', exact: true }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(menu).toHaveCount(0)
    await openAdminMenu(page)
    const adminMenu = page.getByRole('navigation', { name: 'Переходы администратора' })
    await adminMenu.locator('summary').filter({ hasText: 'Настройки контента в CMS' }).click()
    await adminMenu.getByRole('link', { name: 'Импорт из Яндекс.Диска', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/import-yandex$/)
    await expect(page.getByRole('heading', { name: 'Импорт из Яндекс.Диска', exact: true })).toBeVisible()
    await expect(menu).toHaveCount(0)
  })

  test('на странице карты есть переход прямо к её редактору', async ({ page }) => {
    await page.goto(`/roadmaps/${CONTENT.roadmap.slug}`)
    await page.getByRole('link', { name: 'Редактировать карту' }).click()
    await expect(page).toHaveURL(/\/admin\/roadmap-editor\/\d+$/)
    await expect(page.getByRole('heading', { name: CONTENT.roadmap.title })).toBeVisible()
  })
})

test('ученик видит карту без управления и кнопок редактирования', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: APP_URL, storageState: storageStateOf('student') })
  try {
    const page = await context.newPage()
    await page.goto(`/roadmaps/${CONTENT.roadmap.slug}`)
    await expect(page.getByRole('heading', { name: CONTENT.roadmap.title })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Редактировать карту' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Редактор роадмапов' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'CMS и настройки' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Админка', exact: true })).toHaveCount(0)
    await page.goto('/admin/roadmap-editor')
    await expect(page.getByRole('heading', { name: 'Визуальный редактор роадмапов' })).toHaveCount(0)
  } finally {
    await context.close()
  }
})
