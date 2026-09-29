import { expect, test, type Page } from '@playwright/test'

import { TRAINER_CATALOG, flattenCatalog } from '../../../src/data/trainer'
import { stateOf } from '../env'

/**
 * Тренажёр на проде: задача решается эталоном из каталога в репозитории —
 * тем же, что сид кладёт в базу. «Запустить» по Ctrl+Enter считает в браузере,
 * «Отправить» проверяет на сервере в изоляте, после решения — следующая задача.
 */
test.use({ storageState: stateOf('student') })

const SOLUTIONS = new Map(
  flattenCatalog(TRAINER_CATALOG)
    .filter(({ task }) => task.solutionCode && (task.languages ?? ['js']).includes('js'))
    .map(({ topic, task }) => [`/trainer/${topic.slug}/${task.slug}`, task.solutionCode as string]),
)

async function setCode(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => Boolean((window as unknown as { monaco?: unknown }).monaco))
  await page.evaluate((value) => {
    const monaco = (window as unknown as { monaco: { editor: { getModels: () => { setValue: (v: string) => void }[] } } }).monaco
    monaco.editor.getModels()[0].setValue(value)
  }, code)
}

test('задача решается: Ctrl+Enter запускает, «Отправить» засчитывает, дальше — следующая задача', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/trainer/tasks')
  const links = await page.locator('main a[href^="/trainer/"]').evaluateAll((as) =>
    as.map((a) => new URL((a as HTMLAnchorElement).href).pathname),
  )
  const path = links.find((href) => SOLUTIONS.has(href))
  expect(path, 'на проде нет ни одной задачи из каталога репозитория').toBeTruthy()

  await page.goto(path as string)
  const js = page.getByRole('group', { name: 'Язык решения' }).getByRole('button', { name: 'JavaScript' })
  if (await js.isVisible()) await js.click()
  await setCode(page, SOLUTIONS.get(path as string) as string)

  await page.locator('.monaco-editor textarea').first().focus()
  await page.keyboard.press('Control+Enter')
  await expect(page.getByText('Все тесты пройдены')).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByText(/Задача решена/).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Следующая нерешённая в теме:|Все задачи темы решены\./)).toBeVisible()

  await page.reload()
  await expect(page.getByText('Решено', { exact: true }).first()).toBeVisible()

  await page.goto('/trainer/tasks')
  await expect(page.locator(`main a[href="${path}"]`).first()).toBeVisible()
})
