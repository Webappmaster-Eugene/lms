import { expect, type Page } from '@playwright/test'

/**
 * Замена всего кода в Monaco через его модель: набор с клавиатуры ломают
 * автоотступы и автозакрытие скобок. Редактор при этом шлёт обычное событие
 * изменения, и компонент получает код так же, как при вводе руками.
 */
export async function setCode(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible()
  await page.waitForFunction(() => Boolean((window as unknown as { monaco?: unknown }).monaco))
  await page.evaluate((value) => {
    const monaco = (window as unknown as { monaco: { editor: { getModels: () => { setValue: (v: string) => void }[] } } }).monaco
    monaco.editor.getModels()[0].setValue(value)
  }, code)
  await expect(page.locator('.monaco-editor .view-lines').first()).toContainText(code.split('\n')[1].trim())
}
