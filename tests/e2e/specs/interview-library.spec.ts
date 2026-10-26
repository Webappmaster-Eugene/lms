import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { NOT_FOUND_HEADING } from '../fixtures/data'
import { APP_URL, storageStateOf } from '../fixtures/env'

/**
 * Хранилища записей (Яндекс Диска) в e2e нет: /api/interviews/<id>/stream отвечает 503, и плеер после
 * повторов показывает «Видео сейчас не загружается». Сценарии про воспроизведение подменяют ответ потока
 * тестовым роликом — так, как его отдал бы Диск; путь без хранилища проверяет отдельный тест.
 */
const RECORDING = new URL('../fixtures/resume-test.webm', import.meta.url)

// These fixtures are local; no paid model calls or real private storage operations.
test('библиотека и личный отчёт на телефоне: фильтры, приватность, навигация и доступность', async ({ browser }, testInfo) => {
  const learner = await browser.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('student'), viewport: { width: 320, height: 780 } })
  const stranger = await browser.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('leader'), viewport: { width: 320, height: 780 } })
  try {
    const page = await learner.newPage()
    await page.addInitScript(() => { localStorage.setItem('lms:pwa-install-explained:v1', 'seen'); localStorage.setItem('theme', 'light') })
    await page.goto('/interviews?direction=react&category=personal')
    await expect(page.getByRole('heading', { name: 'Собеседования', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /Мой тестовый React собес/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Чужая личная запись/ })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('interviews-320-light.png'), fullPage: true })
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await page.screenshot({ path: testInfo.outputPath('interviews-320-dark.png'), fullPage: true })
    const recording = await readFile(RECORDING)
    await page.route('**/api/interviews/*/stream**', (route) => route.fulfill({ status: 200, contentType: 'video/webm', body: recording }))
    await page.getByRole('link', { name: /Мой тестовый React собес/ }).click()
    await expect(page.getByRole('heading', { name: 'Мой тестовый React собес', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Итог разбора' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Скачать отчёт' })).toHaveAttribute('href', /\/api\/interviews\/\d+\/report/)
    await expect(page.getByRole('button', { name: /Сделать новый разбор|Анализировать мой собес/ })).toHaveCount(0)
    // На iPhone запись играет на странице, а не уходит в полноэкранный плеер системы.
    const video = page.getByLabel('Собеседование: Мой тестовый React собес', { exact: true })
    await expect(video).toHaveAttribute('playsinline', '')
    await video.scrollIntoViewIfNeeded()
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(1)
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    // Цвета плеера меняются с transition-colors: проверка контраста посреди перехода видит промежуточный цвет.
    await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation instanceof CSSTransition).map((animation) => animation.finished)))
    expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([])
    const detailUrl = page.url()
    const privateId = Number(new URL(detailUrl).pathname.split('/').at(-1))
    expect((await stranger.request.get(`/api/interviews/${privateId}`)).status()).toBe(404)
    expect((await stranger.request.get(`/api/interviews/${privateId}/stream`)).status()).toBe(404)
    expect((await stranger.request.get(`/api/interviews/${privateId}/report`)).status()).toBe(404)
    const strangerPage = await stranger.newPage()
    expect((await strangerPage.goto(detailUrl))?.status()).toBe(404)
    await expect(strangerPage.getByRole('heading', { name: NOT_FOUND_HEADING })).toBeVisible()
    await expect(strangerPage.getByText('Мой тестовый React собес')).toHaveCount(0)
    const report = await learner.request.get(`/api/interviews/${privateId}/report`)
    expect(report.status()).toBe(200)
    expect((await report.json()).provider).toBe('sovetnik')
    expect(report.headers()['cache-control']).toBe('private, no-store')
    await page.getByRole('button', { name: 'Ещё', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Собеседования', exact: true })).toBeVisible()
    await page.getByRole('dialog').getByRole('link', { name: 'Собеседования', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Мои собесы', exact: true }).click()
    await expect(page.getByRole('link', { name: /Мой тестовый React собес/ })).toBeVisible()
  } finally { await Promise.all([learner.close(), stranger.close()]) }
})

// Local dummy semantic evaluator config enables the queue UI; no external job is created.
test('Оценка ответов: явное согласие и настоящая постановка личной записи в очередь', async ({ browser }) => {
  const learner = await browser.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('student'), viewport: { width: 390, height: 844 } })
  try {
    const page = await learner.newPage()
    await page.addInitScript(() => localStorage.setItem('lms:pwa-install-explained:v1', 'seen'))
    await page.goto('/interviews?direction=react&category=personal')
    await page.getByRole('link', { name: /Мой новый собес/ }).click()
    const button = page.getByRole('button', { name: 'Анализировать мой собес', exact: true })
    if (await button.isDisabled()) { test.skip(true, 'Сервис оценки собеседований не настроен в тестовом окружении'); return }
    await button.click()
    const dialog = page.getByRole('dialog')
    const consent = dialog.getByRole('checkbox')
    const submit = dialog.getByRole('button', { name: 'Получить разбор', exact: true })
    await expect(submit).toBeDisabled()
    await expect(dialog).toBeVisible()
    await expect(consent).not.toBeChecked()
    await dialog.getByLabel('Целевой грейд').selectOption('senior')
    await dialog.getByLabel('Формат собеседования').selectOption('live_coding')
    // UTF-8 text fits the character limit while exceeding the old 24 KiB HTTP body bound.
    const vacancy = `React, TypeScript, архитектура\n${'я'.repeat(14000)}`
    await dialog.getByLabel('Вакансия или требования (необязательно)').fill(`  ${vacancy}  `)
    await dialog.getByLabel('Как вас называют в записи (необязательно)').fill('  Александр  ')
    await consent.check()
    const submitted = page.waitForResponse((response) => response.url().endsWith('/analyze') && response.request().method() === 'POST')
    await submit.click()
    const result = await submitted
    expect(result.status()).toBe(202)
    expect(result.request().postDataJSON()).toEqual({ consent: true, targetGrade: 'senior', interviewFormat: 'live_coding', vacancyText: vacancy, candidateName: 'Александр' })
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('Разбор в очереди', { exact: true })).toBeVisible()
    const id = new URL(page.url()).pathname.split('/').at(-1)
    const stored = await learner.request.get(`/api/interviews/${id}`)
    expect((await stored.json()).recording.analysisStatus).toBe('queued')
  } finally { await learner.close() }
})

test('запись без хранилища: после повторов честное сообщение и кнопка «Попробовать снова»', async ({ browser }) => {
  const learner = await browser.newContext({ baseURL: APP_URL, extraHTTPHeaders: { Origin: APP_URL }, storageState: storageStateOf('student'), viewport: { width: 390, height: 844 } })
  try {
    const page = await learner.newPage()
    await page.addInitScript(() => localStorage.setItem('lms:pwa-install-explained:v1', 'seen'))
    await page.goto('/interviews?direction=react&category=personal')
    await page.getByRole('link', { name: /Мой тестовый React собес/ }).click()
    await expect(page.getByRole('heading', { name: 'Мой тестовый React собес', exact: true })).toBeVisible()
    // Плеер дважды повторяет загрузку (через 2 и 5 секунд) и только потом сдаётся.
    const failure = page.getByRole('alert').filter({ hasText: 'Видео сейчас не загружается' })
    await expect(failure).toBeVisible({ timeout: 30_000 })
    await expect(failure).toContainText('сообщите название записи в поддержку')
    await expect(failure.getByRole('button', { name: 'Попробовать снова' })).toBeVisible()
    await expect(page.locator('video')).toHaveCount(0)
    // Отчёт разбора не зависит от хранилища видео.
    await expect(page.getByRole('heading', { name: 'Итог разбора' })).toBeVisible()
  } finally { await learner.close() }
})
