import { existsSync } from 'node:fs'
import { chromium, defineConfig, devices } from '@playwright/test'

import { APP_URL, LANDING_URL } from './tests/e2e/fixtures/env'

/**
 * E2E, API-over-HTTP, контент/a11y и скриншотные тесты.
 *
 * Приложение поднимает scripts/e2e-server.mjs: одноразовая БД, миграции,
 * детерминированный сид, production-сборка и `next start`. Лендинг —
 * scripts/landing-server.mjs (astro build + preview).
 *
 * Скриншоты сравниваются только с эталонами, снятыми в Linux-контейнере
 * mcr.microsoft.com/playwright той же версии (scripts/visual-docker.mjs и CI):
 * рендер шрифтов на macOS отличается, и сравнение было бы шумом.
 */
const CI = Boolean(process.env.CI)
const APP_PORT = new URL(APP_URL).port || '3100'
const LANDING_PORT = new URL(LANDING_URL).port || '3101'

/**
 * Локально на macOS браузер Playwright может быть не скачан — тогда берём
 * установленный Google Chrome. В CI и в контейнере всегда штатный chromium.
 */
function browserChannel(): string | undefined {
  if (CI || process.env.PW_CHANNEL === 'chromium') return undefined
  if (process.env.PW_CHANNEL) return process.env.PW_CHANNEL
  try {
    return existsSync(chromium.executablePath()) ? undefined : 'chrome'
  } catch {
    return 'chrome'
  }
}

const channel = browserChannel()
const desktop = { ...devices['Desktop Chrome'], channel }

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // Сценарии меняют общую базу (прохождение урока, публикация курса) — один воркер.
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Антиалиасинг текста между запусками одного контейнера почти стабилен,
      // но не бит-в-бит: небольшой допуск, анимации выключены.
      maxDiffPixelRatio: 0.002,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  snapshotPathTemplate: '{testDir}/visual/__screenshots__/{testFileName}/{arg}{ext}',
  reporter: CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['github']]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: APP_URL,
    // APIRequestContext has no browser Fetch Metadata; cookie calls need the canonical Origin.
    extraHTTPHeaders: { Origin: APP_URL },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Видео нужен ffmpeg из поставки Playwright — локально его может не быть.
    video: CI ? 'retain-on-failure' : 'off',
  },
  projects: [
    { name: 'setup', testMatch: /fixtures\/auth\.setup\.ts/, use: desktop },
    {
      name: 'e2e',
      testMatch: /specs\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: desktop,
    },
    {
      name: 'api',
      testMatch: /api\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: desktop,
    },
    {
      name: 'content',
      testMatch: /content\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: desktop,
    },
    {
      name: 'visual',
      testMatch: /visual\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: desktop,
    },
  ],
  webServer: process.env.PW_NO_WEBSERVER
    ? undefined
    : [
        {
          command: 'node scripts/e2e-server.mjs',
          url: `${APP_URL}/api/health`,
          // Сервер каждый раз со свежей базой: сценарии меняют данные, и повторный
          // прогон на старой базе давал бы другой результат. E2E_REUSE_SERVER=1 —
          // для отладки против уже запущенного сервера.
          reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
          timeout: 15 * 60_000,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { E2E_APP_PORT: APP_PORT },
        },
        {
          command: 'node scripts/landing-server.mjs',
          url: LANDING_URL,
          // Лендинг статичен — уже запущенный можно переиспользовать.
          reuseExistingServer: !CI,
          timeout: 5 * 60_000,
          env: { E2E_LANDING_PORT: LANDING_PORT },
        },
      ],
})
