import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { CONTENT, NOT_FOUND_HEADING } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

/**
 * Раздел «Гайды»: список, оглавление, Markdown-вёрстка, скачивание .md, «Сохранённое», черновики
 * и выборочный доступ. По сиду гайд студенту назначен отдельно, а у leader доступа к гайдам нет
 * при открытых курсах. Черновик хранится в старом формате Lexical.
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

  test('Markdown свёрстан: таблица, врезка, код в строке и подсвеченный блок кода', async ({ page }) => {
    await page.goto(`/guides/${CONTENT.guide.slug}`)
    await expect(page.getByRole('table')).toContainText('Отдельный профиль')
    await expect(page.locator('blockquote')).toContainText('первую неделю не меняйте устройство')
    await expect(page.locator('p code', { hasText: 'pnpm dev' })).toBeVisible()
    await expect(page.locator('pre.shiki')).toContainText('pnpm install')
  })

  test('скачивает гайд файлом .md с названием, текстом и ссылкой на источник', async ({ page }) => {
    await page.goto(`/guides/${CONTENT.guide.slug}`)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Скачать .md' }).click()])
    expect(download.suggestedFilename()).toBe(`${CONTENT.guide.slug}.md`)
    const file = await readFile(await download.path(), 'utf8')
    expect(file.startsWith(`# ${CONTENT.guide.title}\n\n> ${CONTENT.guide.summary}`)).toBe(true)
    expect(file).toContain(`## ${CONTENT.guide.sections[0]}`)
    expect(file).toMatch(new RegExp(`Источник: http\\S+/guides/${CONTENT.guide.slug}`))
  })

  test('сохраняет гайд и находит его в «Сохранённом»', async ({ page }) => {
    await page.goto(`/guides/${CONTENT.guide.slug}`)
    await page.getByRole('button', { name: 'В сохранённое' }).click()
    await expect(page.getByRole('button', { name: 'В сохранённом' })).toHaveAttribute('aria-pressed', 'true')

    await page.goto('/saved')
    await page.getByRole('button', { name: /Гайды/ }).click()
    await expect(page.getByRole('link', { name: CONTENT.guide.title })).toHaveAttribute('href', `/guides/${CONTENT.guide.slug}`)
    await page.getByRole('button', { name: `Убрать «${CONTENT.guide.title}» из сохранённого` }).click()
    await expect(page.getByRole('link', { name: CONTENT.guide.title })).toHaveCount(0)
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
    expect((await page.request.get(`/guides/${CONTENT.guide.slug}/download`)).status()).toBe(404)
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
    // Старый Lexical-гайд читается, но файлом не скачивается; черновик в «Сохранённое» не кладут.
    await expect(page.getByText('Черновик.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Скачать .md' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'В сохранённое' })).toHaveCount(0)
  })
})
