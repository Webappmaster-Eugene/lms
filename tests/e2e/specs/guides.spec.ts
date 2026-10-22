import { expect, test } from '@playwright/test'

import { CONTENT, NOT_FOUND_HEADING } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

/**
 * Раздел «Гайды»: список, оглавление, черновики и выборочный доступ. По сиду гайд студенту
 * назначен отдельно, а у leader доступа к гайдам нет при открытых курсах.
 */
test.describe('ученик', () => {
  test.use({ storageState: storageStateOf('student') })

  test('находит гайд в меню и переходит по оглавлению к разделу', async ({ page }) => {
    await page.goto('/')
    await page.locator('aside').last().getByRole('link', { name: 'Гайды', exact: true }).click()
    await expect(page).toHaveURL(/\/guides$/)
    await expect(page.getByText(CONTENT.draftGuide.title)).toHaveCount(0)

    await page.getByRole('link', { name: new RegExp(CONTENT.guide.title) }).click()
    await expect(page).toHaveURL(new RegExp(`/guides/${CONTENT.guide.slug}$`))
    await expect(page.getByRole('heading', { name: CONTENT.guide.title, level: 1 })).toBeVisible()
    await expect(page.getByText(CONTENT.guide.summary)).toBeVisible()

    const contents = page.getByRole('navigation', { name: 'Содержание' })
    await expect(contents.getByRole('link')).toHaveText([...CONTENT.guide.sections])
    const [, , last] = CONTENT.guide.sections
    await contents.getByRole('link', { name: last }).click()
    await expect(page).toHaveURL(/#section-3$/)
    await expect(page.getByRole('heading', { name: last, level: 2 })).toBeInViewport()

    await page.getByRole('link', { name: 'Все гайды' }).click()
    await expect(page).toHaveURL(/\/guides$/)
  })

  test('черновик гайда по прямой ссылке отвечает 404', async ({ page }) => {
    const response = await page.goto(`/guides/${CONTENT.draftGuide.slug}`)
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
  })
})

test.describe('ученик без назначенных гайдов', () => {
  test.use({ storageState: storageStateOf('leader') })

  test('не видит раздела в меню, список объясняет, где взять доступ, прямая ссылка — 404', async ({ page }) => {
    await page.goto('/courses')
    await expect(page.locator('aside').last().getByRole('link', { name: 'Курсы', exact: true })).toBeVisible()
    await expect(page.locator('aside').last().getByRole('link', { name: 'Гайды', exact: true })).toHaveCount(0)

    await page.goto('/guides')
    await expect(page.getByText('Вам пока не открыт ни один гайд')).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(CONTENT.guide.title) })).toHaveCount(0)

    const response = await page.goto(`/guides/${CONTENT.guide.slug}`)
    expect(response?.status()).toBe(404)
  })
})

test.describe('администратор', () => {
  test.use({ storageState: storageStateOf('admin') })

  test('видит черновик с пометкой и открывает его до публикации', async ({ page }) => {
    await page.goto('/guides')
    const draft = page.getByRole('link', { name: new RegExp(CONTENT.draftGuide.title) })
    await expect(draft.getByText('Черновик', { exact: true })).toBeVisible()
    await draft.click()
    await expect(page.getByRole('heading', { name: CONTENT.draftGuide.title, level: 1 })).toBeVisible()
    await expect(page.getByText('Черновик — ученики его пока не видят')).toBeVisible()
  })
})
