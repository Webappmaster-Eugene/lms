import { expect, type Locator, type Page } from '@playwright/test'

export type Theme = 'light' | 'dark'
export const WIDTHS = [375, 1440] as const

/** Тема next-themes хранится в localStorage — ставим её до загрузки страницы. */
export async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem('theme', value)
    } catch {
      // Хранилище недоступно — останется системная тема, её задаёт emulateMedia.
    }
  }, theme)
}

/**
 * Перед снимком: сеть затихла, шрифты загружены, картинки декодированы,
 * мигающих курсоров и переходов нет.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    await document.fonts.ready
    // Ленивые картинки за пределами экрана сами не загрузятся, а снимок во всю высоту.
    for (const img of document.images) img.loading = 'eager'
    await Promise.all(
      [...document.images].filter((img) => !img.complete).map((img) => new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true })
        img.addEventListener('error', resolve, { once: true })
      })),
    )
  })
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }',
  })
}

/** Динамика, которую маскируем: даты, текущий год в подвале, курсор редактора. */
export function dynamicParts(page: Page): Locator[] {
  return [
    page.locator('time'),
    page.locator('[data-dynamic]'),
    page.getByText(/©\s*\d{4}/),
    page.locator('.monaco-editor .cursors-layer'),
  ]
}

export async function snap(page: Page, name: string): Promise<void> {
  await settle(page)
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, mask: dynamicParts(page) })
}
