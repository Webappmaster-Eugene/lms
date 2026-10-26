import { expect, test, type Locator } from '@playwright/test'

import { CONTENT } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

test.use({ storageState: storageStateOf('admin') })

async function preFont(root: Locator) {
  return root.locator('pre').first().evaluate(async (element) => {
    await document.fonts.ready
    return getComputedStyle(element).fontFamily
  })
}

async function typography(root: Locator) {
  return root.evaluate(async (element) => {
    await document.fonts.ready
    return ['h2', 'p', 'ul', 'li', 'code', 'blockquote', 'th', 'td', 'pre', 'pre code'].map((selector) => {
      const node = element.querySelector(selector)
      if (!node) throw new Error(`Не найден ${selector}`)
      const style = getComputedStyle(node)
      return [selector, ...['font-family', 'font-size', 'font-weight', 'line-height', 'margin-top', 'margin-bottom', 'padding-left', 'padding-right', 'list-style-type', 'border-radius'].map((name) => style.getPropertyValue(name))]
    })
  })
}

test('Markdown: исправление списков, отмена, Enter, сохранение и одинаковое оформление превью и статьи', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const slug = `editor-parity-${Date.now()}`
  await page.goto('/admin/collections/guides/create')
  await page.locator('#field-title').fill('Проверка Markdown')
  await page.locator('#field-summary').fill('Проверка оформления из редактора')
  await page.locator('#field-slug').fill(slug)
  await page.getByRole('group', { name: 'Вид редактора' }).getByRole('button', { name: 'Рядом' }).click()
  const editor = page.locator('#field-markdown')
  const source = '## Раздел\n\nАбзац с `кодом`.\n\n• Первый\n• Второй\n\n> Цитата\n\n| Шаг | Итог |\n| --- | --- |\n| Один | Готово |\n\n```bash\npnpm install\n```\n\n- [x] Готово'
  await editor.fill(source)
  const fix = page.getByRole('button', { name: 'Преобразовать символы • в Markdown-списки' })
  await fix.click()
  await expect(editor).toHaveValue(source.replaceAll('• ', '- '))
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor).toHaveValue(source)
  await fix.click()

  await editor.focus()
  await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(element.value.length, element.value.length))
  await page.keyboard.press('Enter')
  await expect(editor).toHaveValue(/- \[x\] Готово\n- \[ \] $/)
  await page.keyboard.type('Продолжение')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(editor).toHaveValue(/- \[ \] Продолжение\n\n$/)

  const preview = page.getByLabel('Предпросмотр гайда').locator('.guide-prose')
  await expect(preview.locator('pre.shiki')).toContainText('pnpm install')
  await expect(preview.locator('ul').first().locator('li')).toHaveText(['Первый', 'Второй'])
  const before = await typography(preview)
  const markdown = await editor.inputValue()
  await page.getByRole('button', { name: 'Save', exact: true }).first().click()
  await expect(page).toHaveURL(/\/admin\/collections\/guides\/\d+/)
  const id = page.url().match(/guides\/(\d+)/)?.[1]
  if (!id) throw new Error('Гайд не сохранился')
  try {
    const stored = await request.get(`/api/guides/${id}`)
    expect((await stored.json()).markdown).toBe(markdown)
    await page.goto(`/guides/${slug}`)
    const article = page.locator('article .guide-prose')
    await expect(article.getByRole('heading', { name: 'Раздел' })).toBeVisible()
    await expect(article.locator('pre.shiki')).toContainText('pnpm install')
    expect(await typography(article)).toEqual(before)
  } finally {
    await request.delete(`/api/guides/${id}`)
  }
})

// В админке Payload нет preflight Tailwind, поэтому шрифт блока кода задаёт сам guide-prose.css.
test('у блока кода (pre) одинаковый font-family в превью CMS и в статье', async ({ page, request }) => {
  const found = await request.get(`/api/guides?where[slug][equals]=${CONTENT.guide.slug}&depth=0`)
  const id = (await found.json()).docs[0].id as number
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`/admin/collections/guides/${id}`)
  await page.getByRole('group', { name: 'Вид редактора' }).getByRole('button', { name: 'Рядом' }).click()
  const preview = page.getByLabel('Предпросмотр гайда').locator('.guide-prose')
  await expect(preview.locator('pre.shiki')).toContainText('pnpm install')
  const inEditor = await preFont(preview)
  await page.goto(`/guides/${CONTENT.guide.slug}`)
  const article = page.locator('article .guide-prose')
  await expect(article.locator('pre.shiki')).toContainText('pnpm install')
  expect(await preFont(article)).toBe(inEditor)
})
