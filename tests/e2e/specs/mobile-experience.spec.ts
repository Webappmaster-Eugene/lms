import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { CONTENT } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

test.use({ storageState: storageStateOf('student') })

test('название следующего шага роадмапа остаётся читаемым на узком экране', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto(`/roadmaps/${CONTENT.roadmap.slug}?view=list`)
  const title = page.locator('summary').getByText('Веб-основы', { exact: true })
  await expect(title).toBeVisible()
  const overflow = await title.evaluate((element) => {
    element.textContent = 'НаблюдаемостьИРазвёртываниеFullstackПриложения'.repeat(4)
    return element.scrollWidth - element.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('roadmap-long-title-320.png') })
})

const longTitle = 'Лиды, квалификация и онбординг: подробная инструкция к следующему уроку'

for (const width of [320, 390]) {
  for (const theme of ['light', 'dark']) {
    test.describe(`телефон ${width}px, ${theme}`, () => {
      test.use({ viewport: { width, height: 844 } })

      test('нижнее меню, фокус и содержание курса работают без перекрытий', async ({ page }, testInfo) => {
        await page.addInitScript((value) => localStorage.setItem('theme', value), theme)
        await page.goto(`/lessons/${CONTENT.lessons[1].slug}`)
        const bottom = page.getByRole('navigation', { name: 'Основная навигация' })
        await expect(bottom.getByRole('link', { name: 'Курсы' })).toHaveAttribute('aria-current', 'page')
        for (const control of await bottom.locator('a, button').all()) {
          const box = await control.boundingBox()
          expect(box?.width).toBeGreaterThanOrEqual(44)
          expect(box?.height).toBeGreaterThanOrEqual(44)
        }
        const more = bottom.getByRole('button', { name: 'Ещё' })
        await more.click()
        const menu = page.getByRole('dialog', { name: 'Меню платформы' })
        await expect(menu).toBeVisible()
        await expect(menu.getByRole('link', { name: 'Приложение', exact: true })).toHaveAttribute('href', '/settings/app')
        await expect(menu.getByRole('link', { name: 'Уведомления', exact: true })).toHaveAttribute('href', '/settings/notifications')
        for (let index = 0; index < 18; index++) {
          await page.keyboard.press('Tab')
          expect(await menu.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true)
        }
        expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
        const menuA11y = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa']).analyze()
        expect(menuA11y.violations).toEqual([])
        await page.screenshot({ path: testInfo.outputPath(`more-${theme}-${width}.png`) })
        await page.keyboard.press('Escape')
        await expect(menu).toHaveCount(0)
        await expect(more).toBeFocused()

        const contents = page.getByRole('button', { name: 'Показать содержание' })
        await contents.click()
        const sheet = page.getByRole('dialog', { name: 'Содержание курса' })
        await expect(sheet).toBeVisible()
        await expect(sheet.getByRole('link', { name: CONTENT.lessons[1].title })).toHaveAttribute('aria-current', 'page')
        const sheetBox = await sheet.boundingBox()
        expect(sheetBox?.x).toBe(0)
        expect(sheetBox?.width).toBe(width)
        expect((sheetBox?.y ?? 0) + (sheetBox?.height ?? 0)).toBeLessThanOrEqual(844)
        const courseA11y = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa']).analyze()
        expect(courseA11y.violations).toEqual([])
        await page.screenshot({ path: testInfo.outputPath(`course-${theme}-${width}.png`) })
        await sheet.getByRole('button', { name: 'Закрыть содержание' }).click()
        await expect(contents).toBeFocused()
        expect(await page.evaluate(() => document.body.style.overflow)).toBe('')

        // Stress the same real navigation with a title from the reported case.
        // Only the browser DOM changes; no course or student data is written.
        const navigation = page.getByRole('navigation', { name: 'Навигация по урокам' })
        await navigation.getByRole('link').last().locator('span').last().evaluate((element, value) => { element.textContent = value }, longTitle)
        await navigation.scrollIntoViewIfNeeded()
        for (const link of await navigation.getByRole('link').all()) {
          const box = await link.boundingBox()
          expect(box?.x).toBeGreaterThanOrEqual(0)
          expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`lesson-navigation-${theme}-${width}.png`) })

        const unbrokenTitle = 'ПолныйРазборКвалификацииНовыхУчеников'.repeat(8)
        await page.getByRole('heading', { level: 1 }).evaluate((element, value) => { element.textContent = value }, unbrokenTitle)
        await navigation.getByRole('link').last().locator('span').last().evaluate((element, value) => { element.textContent = value }, unbrokenTitle)
        const completion = page.getByRole('link', { name: /Следующий урок:/ })
        if (await completion.count()) {
          await completion.locator('span').first().evaluate((element, value) => { element.textContent = `Следующий урок: ${value}` }, unbrokenTitle)
        }
        const question = page.getByRole('textbox', { name: 'Вопрос к уроку', exact: true })
        await question.fill(`https://example.org/${'long-material-path-'.repeat(20)}`)
        const send = page.getByRole('button', { name: 'Отправить вопрос', exact: true })
        const sendBox = await send.boundingBox()
        expect(sendBox?.width).toBeGreaterThanOrEqual(44)
        expect(sendBox?.height).toBeGreaterThanOrEqual(44)
        expect((sendBox?.x ?? 0) + (sendBox?.width ?? 0)).toBeLessThanOrEqual(width)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      })
    })
  }
}

test('мобильный поиск принимает ввод сразу и возвращает фокус после закрытия', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const search = page.getByRole('button', { name: 'Поиск', exact: true })
  await search.click()
  const dialog = page.getByRole('dialog', { name: 'Поиск', exact: true })
  await expect(dialog.getByRole('combobox')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(search).toBeFocused()
})

test('изменение ориентации до desktop закрывает мобильное меню', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Ещё', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Меню платформы' })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.getByRole('dialog', { name: 'Меню платформы' })).toHaveCount(0)
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
  await expect(page.locator('aside').getByRole('link', { name: 'Курсы', exact: true })).toBeVisible()
})

test('уведомления помещаются в маленький экран и открывают полный список', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  const bell = page.getByRole('button', { name: 'Уведомления', exact: true })
  await bell.click()
  const panel = page.getByRole('dialog', { name: 'Уведомления', exact: true })
  await expect(panel).toBeVisible()
  const box = await panel.boundingBox()
  expect(box?.x).toBeGreaterThanOrEqual(0)
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320)
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(568 - 64)
  await expect(panel.getByRole('link', { name: 'Все уведомления' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('notifications-bell-small-phone.png') })
  await panel.getByRole('link', { name: 'Все уведомления' }).click()
  await expect(page).toHaveURL(/\/notifications$/)
  await expect(page.getByRole('heading', { name: 'Уведомления', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Приложение и напоминания', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const accessibility = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(accessibility.violations).toEqual([])
})
