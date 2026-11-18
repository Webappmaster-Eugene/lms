import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { BOOTCAMP_PATH, CONSENT_VERSION, FACTS, FAQ, GROUP_LIMIT, NAVIGATION, OFFER_VERSION, PRICE, PROGRAM_KEY, PROGRAM_WEEKS, SAMPLE_PATH, SUMMARY, WEEKS } from '../../landing/src/data/react-next-bootcamp'
import { CONSENT_VERSION as CURRENT_CONSENT } from '../../landing/src/data/bootcamp'
import { REACT_NEXT_BOOTCAMP } from '@/lib/react-next-bootcamp-setup'

const read = (path: string) => readFileSync(new URL(`../../landing/${path}`, import.meta.url), 'utf8')
const page = read('src/pages/bootcamp/react-next.astro')

describe('React + Next.js: опубликованные условия и вход в общую платформу', () => {
  it('сохраняет выбранные цену, размер группы и последовательность недель', () => {
    expect(PROGRAM_KEY).toBe('react-next')
    expect(PRICE.value).toBe(20_000)
    expect(GROUP_LIMIT).toBe(10)
    expect(WEEKS).toBe(20)
    expect(PROGRAM_WEEKS.map((week) => week.number)).toEqual(Array.from({ length: 21 }, (_, index) => index))
    expect(new Set(PROGRAM_WEEKS.map((week) => week.slug)).size).toBe(21)
    expect(PROGRAM_WEEKS[10]?.title).toContain('React')
    expect(PROGRAM_WEEKS[11]?.topic).toContain('App Router')
    expect(PROGRAM_WEEKS[20]?.topic).toContain('Защита')
    expect(SUMMARY).toContain('настоящим backend Node.js-буткемпа')
  })

  it('не заимствует даты и дни занятий из Node.js-программы', () => {
    expect(SUMMARY).toContain('Дата старта пока не объявлена')
    const frontendPages = ['react-next.astro', ...['program', 'format', 'payment', 'offer', 'quality', 'sample'].map((name) => `react-next/${name}.astro`)]
    for (const path of frontendPages) {
      const source = read(`src/pages/bootcamp/${path}`)
      expect(source, path).not.toMatch(/startDate|endDate|START_ISO|LAST_CLASS|PREP_START|byDay|суббот|воскресень|феврал|июл[ья]/i)
    }
    expect(JSON.stringify({ FACTS, FAQ, SUMMARY })).not.toMatch(/суббот|воскресень|2027-/i)
  })

  it('условия, которые увидит кандидат, совпадают с настройкой оплаты программы', () => {
    expect(PROGRAM_KEY).toBe(REACT_NEXT_BOOTCAMP.key)
    expect(PRICE.value * 100).toBe(REACT_NEXT_BOOTCAMP.priceKopecks)
    expect(OFFER_VERSION).toBe(REACT_NEXT_BOOTCAMP.offerVersion)
    expect(REACT_NEXT_BOOTCAMP.landingUrl).toBe(`https://info.mentorcareer.ru${BOOTCAMP_PATH}`)
    expect(REACT_NEXT_BOOTCAMP.offerUrl).toBe(`https://info.mentorcareer.ru${NAVIGATION.offerPath}`)
  })

  it('отправляет ключ программы существующим клиентом и с действующим согласием', () => {
    expect(CONSENT_VERSION).toBe(CURRENT_CONSENT)
    expect(page).toContain('data-lead-form data-program={PROGRAM_KEY}')
    expect(page).toContain('data-program-title="React + Next.js"')
    expect(page).toContain('data-consent-version={CONSENT_VERSION}')
    expect(page).toContain('src="../../scripts/bootcamp-form.ts"')
    expect(page).toContain('Сейчас набор ещё не открыт')
    expect(page).toContain('role="status"')
    expect(page).toContain('data-done-email')
    expect(page).not.toMatch(/robokassa\.ru|solutionCode|PAYLOAD_SECRET|LMS_ADMIN_PASSWORD/)
  })

  it('каждая ссылка навигации ведёт в соответствующую программу', () => {
    expect(BOOTCAMP_PATH).toBe('/bootcamp/react-next/')
    for (const [key, value] of Object.entries(NAVIGATION)) {
      if (key.endsWith('Path') || key === 'path') expect(value).toMatch(/^\/bootcamp\/react-next\//)
    }
    expect(read('src/layouts/ReactNextLayout.astro')).toContain('navigation={NAVIGATION}')
    expect(read('src/pages/index.astro')).toContain('href="/bootcamp/react-next/"')
  })

  it('публикует только отрывок соседнего примера, без закрытых ответов', () => {
    expect(SAMPLE_PATH).toBe('/bootcamp/react-next/sample/')
    const excerpt = read('src/data/react-next-sample.md')
    expect(excerpt).toContain('ConditionList')
    expect(excerpt).toContain('Компонент - функция с ответственностью')
    expect(excerpt).not.toMatch(/^## (Практикум|Самопроверка|Ответы)/m)
    expect(excerpt).not.toMatch(/solutionCode|grader\/|reference\/src/)
    expect(read('src/pages/bootcamp/react-next/sample.astro')).toContain('его решение здесь не приводится')
  })

  it('оферта не исключает включённое итоговое техническое собеседование', () => {
    const offer = read('src/pages/bootcamp/react-next/offer.astro')
    expect(OFFER_VERSION).toBe('2026-11-18')
    expect(offer).toContain('Техническое собеседование по пройденной программе входит в цену')
    expect(offer).toContain('сообщаются заказчику письмом до оплаты')
    expect(JSON.stringify({ FACTS, FAQ, SUMMARY })).not.toMatch(/[—–]/)
  })
})
