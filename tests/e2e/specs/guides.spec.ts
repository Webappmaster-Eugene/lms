import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { CONTENT, NOT_FOUND_HEADING } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

/**
 * Раздел «Гайды»: список с категориями, оглавление, Markdown-вёрстка, скачивание .md, «Сохранённое»,
 * отзыв, черновики и выборочный доступ. По сиду оба гайда студенту назначены отдельно (первый он
 * уже открывал), а у leader доступа к гайдам нет при открытых курсах.
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

  test('Markdown свёрстан: таблица, цитата, врезка, код в строке и подсвеченный блок кода с кнопкой копирования', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(`/guides/${CONTENT.guide.slug}`)
    await expect(page.getByRole('table')).toContainText('Отдельный профиль')
    await expect(page.locator('blockquote')).toContainText('первую неделю не меняйте устройство')
    const warning = page.locator('aside[data-callout="warning"]')
    await expect(warning).toContainText('Внимание')
    await expect(warning).toContainText('Не входите в аккаунт с телефона.')
    await expect(warning).not.toContainText('[!WARNING]')
    await expect(page.locator('p code', { hasText: 'pnpm dev' })).toBeVisible()
    await expect(page.locator('pre.shiki')).toContainText('pnpm install')
    await page.getByRole('button', { name: 'Копировать' }).click()
    await expect(page.getByRole('button', { name: 'Скопировано' })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('pnpm install')
  })

  test('список: категории фильтруют гайды, у непрочитанного — «Новое», у открытого — «Прочитан»', async ({ page }) => {
    await page.goto('/guides')
    const filters = page.getByRole('navigation', { name: 'Категории гайдов' })
    await expect(filters.getByRole('link')).toHaveText(['Все', 'Карьера', 'ИИ в работе'])
    await expect(page.getByRole('link', { name: new RegExp(CONTENT.aiGuide.title) }).getByText('Новое', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(CONTENT.guide.title) }).getByText('Прочитан')).toBeVisible()

    await filters.getByRole('link', { name: 'ИИ в работе' }).click()
    await expect(page).toHaveURL(/\/guides\?category=ai$/)
    await expect(filters.getByRole('link', { name: 'ИИ в работе' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('link', { name: new RegExp(CONTENT.aiGuide.title) })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(CONTENT.guide.title) })).toHaveCount(0)
  })

  test('на широком экране оглавление сбоку и подсвечивает текущий раздел', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.goto(`/guides/${CONTENT.guide.slug}`)
    const side = page.getByRole('navigation', { name: 'Содержание гайда' })
    await expect(side).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Содержание', exact: true })).toBeHidden()
    const [, , last] = CONTENT.guide.sections
    await side.getByRole('link', { name: last }).click()
    await expect(side.getByRole('link', { name: last })).toHaveAttribute('aria-current', 'location')
    // Прокрутили к концу — оглавление едет вместе со страницей и остаётся на экране.
    await expect(side).toBeInViewport()
  })

  test('отвечает «Гайд помог?», оставляет комментарий, после перезагрузки ответ на месте', async ({ page }) => {
    await page.goto(`/guides/${CONTENT.guide.slug}`)
    const feedback = page.getByRole('region', { name: 'Гайд помог?' })
    await feedback.getByRole('button', { name: 'Нет' }).click()
    await expect(feedback.getByRole('button', { name: 'Нет' })).toHaveAttribute('aria-pressed', 'true')
    await feedback.getByLabel('Что было непонятно или устарело? Ментор поправит гайд.').fill('Не понял, где взять прокси')
    await feedback.getByRole('button', { name: 'Отправить' }).click()
    await expect(feedback.getByRole('status')).toHaveText('Отзыв отправлен')

    await page.reload()
    await expect(feedback.getByRole('button', { name: 'Нет' })).toHaveAttribute('aria-pressed', 'true')
    await expect(feedback.getByRole('textbox')).toHaveValue('Не понял, где взять прокси')
  })

  test('скачивает гайд файлом .md с названием, текстом и ссылкой на источник', async ({ page }) => {
    await page.goto(`/guides/${CONTENT.guide.slug}`)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Скачать .md' }).click()])
    expect(download.suggestedFilename()).toBe(`${CONTENT.guide.slug}.md`)
    const file = await readFile(await download.path(), 'utf8')
    expect(file.startsWith(`# ${CONTENT.guide.title}\n\n> ${CONTENT.guide.summary}`)).toBe(true)
    expect(file).toContain(`## ${CONTENT.guide.sections[0]}`)
    expect(file).toMatch(new RegExp(`Источник: http\\S+/guides/${CONTENT.guide.slug} · данные проверены 22 октября 2026 г\\.`))
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

  test('не видит раздела в меню, список объясняет, где взять доступ, прямая ссылка — что гайд закрыт', async ({ page }) => {
    await page.goto('/courses')
    await expect(page.locator('aside').last().getByRole('link', { name: 'Курсы', exact: true })).toBeVisible()
    await expect(page.locator('aside').last().getByRole('link', { name: 'Гайды', exact: true })).toHaveCount(0)

    await page.goto('/guides')
    await expect(page.getByText('Вам пока не открыт ни один гайд')).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(CONTENT.guide.title) })).toHaveCount(0)

    await page.goto(`/guides/${CONTENT.guide.slug}`)
    await expect(page.getByRole('heading', { name: 'Этот гайд вам пока не открыт', level: 1 })).toBeVisible()
    // Название закрытого гайда не раскрывается.
    await expect(page.getByText(CONTENT.guide.title)).toHaveCount(0)
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
    // Черновик админ скачивает для проверки, но в «Сохранённое» его не кладут и отзыв не спрашивают.
    await expect(page.getByText('Черновик.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Скачать .md' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'В сохранённое' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Гайд помог?' })).toHaveCount(0)
  })
})
