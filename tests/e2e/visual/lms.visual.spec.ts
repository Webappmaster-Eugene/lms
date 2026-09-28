import { test } from '@playwright/test'

import { CONTENT } from '../fixtures/data'
import { storageStateOf } from '../fixtures/env'
import { snap, useTheme, WIDTHS, type Theme } from './stabilize'

/**
 * Скриншоты платформы: ключевые страницы × 375/1440 × светлая/тёмная тема.
 * Данные — фиксированный сид, студент без прогресса (состояние меняет только
 * отдельный пользователь e2e-сценариев). Эталоны — только из Linux-контейнера.
 */
test.skip(process.platform !== 'linux', 'эталоны сняты в контейнере Playwright — запускайте pnpm test:visual')

const PUBLIC: [string, string][] = [
  ['login', '/login'],
  ['forgot-password', '/forgot-password'],
]

const INNER: [string, string][] = [
  ['dashboard', '/'],
  ['courses', '/courses'],
  ['course', `/courses/${CONTENT.course.slug}`],
  ['lesson', `/lessons/${CONTENT.lessons[0].slug}`],
  ['trainer', '/trainer'],
  ['trainer-topic', `/trainer/${CONTENT.topic.slug}`],
  ['trainer-task', `/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`],
  ['roadmaps', '/roadmaps'],
  ['leaderboard', '/leaderboard'],
  ['profile', '/profile'],
  ['help', '/help'],
  ['contacts', '/contacts'],
  ['certificates', '/certificates'],
  ['notes', '/notes'],
  ['questions', '/questions'],
  ['saved', '/saved'],
]

for (const theme of ['light', 'dark'] as Theme[]) {
  for (const width of WIDTHS) {
    test.describe(`${theme} ${width}px`, () => {
      test.use({ viewport: { width, height: 900 } })

      for (const [name, path] of PUBLIC) {
        test(name, async ({ page }) => {
          await useTheme(page, theme)
          await page.goto(path)
          await snap(page, `${name}-${theme}-${width}`)
        })
      }

      test.describe('студент', () => {
        test.use({ storageState: storageStateOf('student') })

        for (const [name, path] of INNER) {
          test(name, async ({ page }) => {
            await useTheme(page, theme)
            await page.goto(path)
            await snap(page, `${name}-${theme}-${width}`)
          })
        }

        test('404', async ({ page }) => {
          await useTheme(page, theme)
          await page.goto('/no-such-page')
          await snap(page, `not-found-${theme}-${width}`)
        })
      })
    })
  }
}
