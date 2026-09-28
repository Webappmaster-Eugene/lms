import { defineConfig, devices } from '@playwright/test'

/**
 * Проверка прода после выката: те же сценарии ученика и ментора, что в e2e,
 * но против живого learn.mentorcareer.ru и его данных.
 *
 * Запуск только через `pnpm test:prod` (scripts/prod-test-accounts.mjs):
 * он заводит временных ученика и администратора, передаёт их через env и
 * удаляет вместе со всеми записями после прогона, даже упавшего.
 */
const PROD_URL = process.env.PROD_BASE_URL ?? 'https://learn.mentorcareer.ru'

export default defineConfig({
  testDir: './tests/prod',
  outputDir: './test-results/prod',
  fullyParallel: false,
  // Сценарии идут по порядку: вопрос ученика → ответ ментора → ответ у ученика.
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env.PW_CHANNEL ?? 'chrome',
    baseURL: PROD_URL,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'prod-setup', testMatch: /auth\.setup\.ts/ },
    { name: 'prod', testMatch: /.*\.spec\.ts/, dependencies: ['prod-setup'] },
  ],
})
