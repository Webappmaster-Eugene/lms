import { expect, test, type Page } from '@playwright/test'

import { CONTENT, SUM_SOLUTION } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'

/**
 * Тренажёр: каталог → тема → задача, редактор Monaco, «Запустить» в браузерной
 * песочнице, «Отправить» на сервер, баллы и разбор после решения.
 */
test.use({ storageState: storageStateOf('doer') })

const TASK_URL = `/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`

/**
 * Замена всего кода в Monaco через его модель: набор с клавиатуры ломают
 * автоотступы и автозакрытие скобок. Редактор при этом шлёт обычное событие
 * изменения, и компонент получает код так же, как при вводе руками.
 */
async function setCode(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible()
  await page.waitForFunction(() => Boolean((window as unknown as { monaco?: unknown }).monaco))
  await page.evaluate((value) => {
    const monaco = (window as unknown as { monaco: { editor: { getModels: () => { setValue: (v: string) => void }[] } } }).monaco
    monaco.editor.getModels()[0].setValue(value)
  }, code)
  await expect(page.locator('.monaco-editor .view-lines').first()).toContainText(code.split('\n')[1].trim())
}

test('каталог и тема ведут к задаче с условием и тестами', async ({ page }) => {
  await page.goto('/trainer')
  await expect(page.getByRole('heading', { name: 'Тренажёр кода' })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(CONTENT.topic.title) }).first().click()
  await expect(page).toHaveURL(new RegExp(`/trainer/${CONTENT.topic.slug}$`))
  await page.getByRole('link', { name: new RegExp(CONTENT.task.title) }).first().click()
  await expect(page).toHaveURL(new RegExp(`${TASK_URL}$`))
  await expect(page.getByRole('heading', { name: CONTENT.task.title })).toBeVisible()
  await expect(page.getByText('sum(a, b)').first()).toBeVisible()

  await page.getByRole('button', { name: 'Тесты' }).click()
  await expect(page.getByText('положительные числа')).toBeVisible()
  // Скрытый кейс в списке тестов не раскрывается.
  await expect(page.getByText('-4, 4')).toHaveCount(0)
})

test('поиск в каталоге задач находит задачу по названию', async ({ page }) => {
  await page.goto('/trainer/tasks')
  await page.getByLabel('Поиск задач').fill('Сумма двух')
  await expect(page.getByRole('link', { name: new RegExp(CONTENT.task.title) }).first()).toBeVisible()
  await page.getByLabel('Поиск задач').fill('несуществующая задача xyz')
  await expect(page.getByRole('link', { name: new RegExp(CONTENT.task.title) })).toHaveCount(0)
})

test('разбор закрыт до решения', async ({ page }) => {
  await page.goto(TASK_URL)
  await page.getByRole('button', { name: 'Разбор' }).click()
  await expect(page.getByText(/Решение откроется/)).toBeVisible()
})

test('«Запустить» с неверным кодом показывает упавший тест, прогресс не пишется', async ({ page }) => {
  await page.goto(TASK_URL)
  await setCode(page, 'function sum(a, b) {\n  return a - b\n}\n')
  await page.getByRole('button', { name: 'Запустить' }).click()
  await expect(page.getByText('Часть тестов не пройдена')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Решено').first()).toHaveCount(0)
})

test('«Отправить» верное решение: серверный вердикт, баллы, открытый разбор', async ({ page }) => {
  await page.goto(TASK_URL)
  await setCode(page, SUM_SOLUTION)
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByText('Все тесты пройдены')).toBeVisible()
  await expect(page.getByText(/Задача решена! \+10 XP/)).toBeVisible()

  await page.getByRole('button', { name: 'Разбор' }).click()
  await expect(page.getByText('Достаточно оператора')).toBeVisible()

  await page.goto('/profile')
  await expect(page.getByText('Задача тренажёра решена').first()).toBeVisible()
})

test('повторная отправка решённой задачи баллов не даёт', async ({ page }) => {
  await page.goto(TASK_URL)
  await setCode(page, SUM_SOLUTION)
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByText('Задача решена — баллы уже начислены ранее')).toBeVisible()
})

test('TypeScript: ошибка типов видна до отправки', async ({ page }) => {
  await page.goto(TASK_URL)
  await page.getByRole('group', { name: 'Язык решения' }).getByRole('button', { name: 'TypeScript' }).click()
  await setCode(page, 'function sum(a: number, b: number): number {\n  return "строка"\n}\n')
  await page.getByRole('button', { name: 'Запустить' }).click()
  await expect(page.getByText('Код не компилируется')).toBeVisible()
})
