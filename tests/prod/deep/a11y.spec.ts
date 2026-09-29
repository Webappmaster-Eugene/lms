import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { stateOf } from '../env'

/**
 * Доступность и вёрстка на проде — с его настоящим контентом из CMS, а не с
 * сидом: axe (WCAG 2.1 A/AA, serious и critical) в обеих темах и отсутствие
 * горизонтальной прокрутки на телефоне.
 */
test.use({ storageState: stateOf('student') })

type Violation = { id: string; impact?: string | null; help: string; nodes: { target: unknown[] }[] }

async function audit(page: Page, name: string): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  await test.info().attach(`axe-${name}.json`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  return (results.violations as Violation[])
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact} ${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)
}

/** Страницы платформы; курс, урок и роадмап — первые из каталога прода. */
async function pages(page: Page): Promise<[string, string][]> {
  await page.goto('/courses')
  const course = await page.locator('a[href^="/courses/"]').filter({ has: page.locator('h3') }).first().getAttribute('href')
  await page.goto(course ?? '/courses')
  const lesson = await page.locator('a[href^="/lessons/"]').first().getAttribute('href')
  await page.goto('/roadmaps')
  const roadmap = await page.locator('main a[href^="/roadmaps/"]').first().getAttribute('href')
  return [
    ['дашборд', '/'],
    ['курсы', '/courses'],
    ['курс', course ?? '/courses'],
    ['урок', lesson ?? '/courses'],
    ['роадмапы', '/roadmaps'],
    ['роадмап', roadmap ?? '/roadmaps'],
    ['тренажёр', '/trainer'],
    ['задачи', '/trainer/tasks'],
    ['заметки', '/notes'],
    ['вопросы', '/questions'],
    ['сохранённое', '/saved'],
    ['сертификаты', '/certificates'],
    ['профиль', '/profile'],
    ['лидерборд', '/leaderboard'],
    ['помощь', '/help'],
  ]
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe, тема ${theme}: нет нарушений serious и critical`, async ({ page }) => {
    test.setTimeout(180_000)
    const list = await pages(page)
    await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme)
    const problems: string[] = []
    for (const [name, path] of list) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      problems.push(...(await audit(page, `${theme}-${name}`)).map((p) => `${name} (${path}): ${p}`))
    }
    expect(problems).toEqual([])
  })
}

test.describe('телефон 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('нет горизонтальной прокрутки, нижняя навигация на месте', async ({ page }) => {
    test.setTimeout(180_000)
    const list = await pages(page)
    const overflow: string[] = []
    for (const [name, path] of list) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
      if (scroll > client) overflow.push(`${name} (${path}): ширина ${scroll} при экране ${client}`)
      await expect(page.locator('nav').filter({ hasText: 'Главная' }), name).toBeVisible()
    }
    expect(overflow).toEqual([])
  })
})
