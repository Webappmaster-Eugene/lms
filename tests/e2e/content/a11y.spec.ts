import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { CONTENT } from '../fixtures/data'
import { LANDING_USE, storageStateOf } from '../fixtures/env'

/**
 * Доступность (axe-core, WCAG 2.1 A/AA): на ключевых страницах не должно быть
 * нарушений уровня serious и critical. Результат с деталями прикладывается к
 * отчёту Playwright.
 */
type Violation = { id: string; impact?: string | null; help: string; nodes: { target: unknown[] }[] }

async function audit(page: Page, name: string): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await test.info().attach(`axe-${name}.json`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  return (results.violations as Violation[])
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)
}

/**
 * Подтверждённые нарушения (см. отчёт). Тест помечен test.fail: когда нарушение
 * исправят, он сообщит «expected to fail, but passed» — запись нужно удалить.
 */
const KNOWN: Record<string, string> = {}

function knownViolation(key: string) {
  test.fail(key in KNOWN, KNOWN[key])
}

async function withTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme)
}

test.describe('платформа, публичные страницы', () => {
  for (const path of ['/login', '/forgot-password', '/reset-password']) {
    test(`${path}`, async ({ page }) => {
      await page.goto(path)
      expect(await audit(page, path)).toEqual([])
    })
  }
})

const INNER: [string, string][] = [
  ['дашборд', '/'],
  ['курсы', '/courses'],
  ['курс', `/courses/${CONTENT.course.slug}`],
  ['буткемп без назначения', '/bootcamp'],
  ['урок', `/lessons/${CONTENT.lessons[0].slug}`],
  ['тренажёр', '/trainer'],
  ['задача', `/trainer/${CONTENT.topic.slug}/${CONTENT.task.slug}`],
  ['роадмапы', '/roadmaps'],
  ['лидерборд', '/leaderboard'],
  ['профиль', '/profile'],
  ['заметки', '/notes'],
  ['вопросы', '/questions'],
  ['сохранённое', '/saved'],
  ['помощь', '/help'],
  ['гайды', '/guides'],
  ['гайд', `/guides/${CONTENT.guide.slug}`],
]

for (const theme of ['dark', 'light'] as const) {
  test.describe(`платформа, тема ${theme}`, () => {
    test.use({ storageState: storageStateOf('student') })

    for (const [name, path] of INNER) {
      test(name, async ({ page }) => {
        knownViolation(`${theme}-${name}`)
        await withTheme(page, theme)
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        expect(await audit(page, `${theme}-${name}`)).toEqual([])
      })
    }
  })
}

test.describe('лендинг', () => {
  test.use(LANDING_USE)

  for (const width of [375, 1440]) {
    test(`главная, ${width}px`, async ({ page }) => {
      knownViolation(`landing-${width}`)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      expect(await audit(page, `landing-${width}`)).toEqual([])
    })
  }

  test('подписи aria-label только у элементов с ролью', async ({ page }) => {
    // На span и div без роли подпись игнорируют VoiceOver и NVDA: вместо «Раздел 1 из 10»
    // звучало «ноль один». axe считает это «неполной» проверкой и в нарушения не выносит.
    await page.goto('/')
    expect(await page.locator('span[aria-label]:not([role]), div[aria-label]:not([role])').count()).toBe(0)
    await expect(page.locator('#start .chapter-number .sr-only')).toHaveText('Раздел 1 из 10')
  })

  test('страница 404', async ({ page }) => {
    await page.goto('/no-such-page')
    expect(await audit(page, 'landing-404')).toEqual([])
  })

  for (const width of [375, 1440]) {
    test(`буткемп Node.js с ошибками формы, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/bootcamp/nodejs/')
      // Проверяется и состояние с ошибками: подсказки должны быть связаны с полями.
      await page.getByRole('button', { name: 'Оставить заявку' }).click()
      await page.locator('.bc-faq summary').first().click()
      expect(await audit(page, `landing-bootcamp-${width}`)).toEqual([])
    })
  }

  for (const [name, path] of [['политика обработки персональных данных', '/privacy/'], ['согласие на обработку данных', '/consent/'], ['оплата буткемпа', '/bootcamp/nodejs/payment/'], ['качество буткемпа', '/bootcamp/nodejs/quality/']]) {
    test(name, async ({ page }) => {
      await page.goto(path)
      expect(await audit(page, `landing${path.replaceAll('/', '-').replace(/-$/, '')}`)).toEqual([])
    })
  }
})
