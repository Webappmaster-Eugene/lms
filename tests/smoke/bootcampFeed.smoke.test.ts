// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { SITE_URL } from '../../landing/src/config'
import { BOOTCAMP_PATH, COURSE_NAME, FACTS, LAST_CLASS, LAST_CLASS_ISO, PRICE, PROGRAM, PROGRAM_KEY, START, START_ISO, WEEKLY_HOURS, WEEKS } from '../../landing/src/data/bootcamp'
import { coursesFeed, FEED_CATEGORY_ID, feedPlan, weeksIn } from '../../landing/src/data/courses-feed'
import { OPERATOR } from '../../landing/src/data/privacy'

/**
 * Фид курсов Яндекса собирается из данных страницы. Яндекс сверяет цену и дату с сайтом
 * и при расхождении снимает предложение, а «План» меньше чем из трёх этапов не показывает.
 */
const feed = new DOMParser().parseFromString(coursesFeed(new Date('2026-11-03T09:30:00Z')), 'application/xml')
const offer = feed.querySelector('offer')
const text = (selector: string) => feed.querySelector(selector)?.textContent ?? null
const params = (name: string) => [...feed.querySelectorAll('offer > param')].filter((node) => node.getAttribute('name') === name)
const param = (name: string) => {
  const found = params(name)
  expect(found, `param «${name}»`).toHaveLength(1)
  return found[0]!
}
// В окружении jsdom глобальный URL - из jsdom, и readFileSync его не принимает: путь строкой.
const landing = (path: string) => join(process.cwd(), 'landing', path)

describe('фид курсов Яндекса', () => {
  it('корректный XML с датой выгрузки и одним курсом', () => {
    expect(feed.querySelector('parsererror')).toBeNull()
    expect(feed.documentElement.tagName).toBe('yml_catalog')
    expect(feed.documentElement.getAttribute('date')).toBe('2026-11-03T09:30:00+00:00')
    expect(feed.querySelectorAll('offer')).toHaveLength(1)
    expect(offer?.getAttribute('id')).toBe(PROGRAM_KEY)
  })

  it('площадка: обязательные поля, логотип - квадратный PNG от 100 px из public', () => {
    expect(text('shop > name')).toBe('MentorCareer')
    expect(text('shop > url')).toBe(`${SITE_URL}/`)
    expect(text('shop > email')).toBe(OPERATOR.email)
    expect(feed.querySelector('currency')?.getAttribute('id')).toBe('RUR')
    const picture = new URL(text('shop > picture') ?? '')
    expect(picture.origin).toBe(SITE_URL)
    const png = readFileSync(landing(`public${picture.pathname}`))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)]
    expect(width).toBe(height)
    expect(width).toBeGreaterThanOrEqual(100)
  })

  it('цена, адрес, название и даты те же, что на странице', () => {
    expect(text('offer > url')).toBe(new URL(BOOTCAMP_PATH, SITE_URL).href)
    expect(text('offer > name')).toBe(COURSE_NAME)
    expect(text('offer > categoryId')).toBe(String(FEED_CATEGORY_ID))
    expect(text('offer > price')).toBe(String(PRICE.value))
    expect(text('offer > currencyId')).toBe('RUR')
    expect(text('offer > description')?.length).toBeGreaterThan(50)
    expect(param('Ближайшая дата').textContent).toBe(START_ISO)
    // ISO-даты и текст страницы описывают одни и те же дни.
    expect(START).toMatch(new RegExp(`^${Number(START_ISO.slice(8))} `))
    expect(LAST_CLASS).toMatch(new RegExp(`^${Number(LAST_CLASS_ISO.slice(8))} `))
    expect(Date.parse(LAST_CLASS_ISO)).toBeGreaterThan(Date.parse(START_ISO))
    const duration = param('Продолжительность')
    expect(duration.getAttribute('unit')).toBe('месяц')
    expect(duration.textContent).toBe('5')
    expect(FACTS.find(({ term }) => term === 'Длительность')?.value).toContain(`${WEEKS} недель`)
  })

  it('план: этапы учебных недель по порядку, часы сходятся с нагрузкой', () => {
    const plan = params('План')
    expect(plan.length).toBeGreaterThanOrEqual(3)
    expect(plan.map((node) => Number(node.getAttribute('order')))).toEqual(plan.map((_, index) => index + 1))
    for (const node of plan) {
      expect(node.getAttribute('unit')?.trim()).not.toBe('')
      expect(Number(node.getAttribute('hours'))).toBeGreaterThan(0)
    }
    const studyWeeks = PROGRAM.filter(({ weeks }) => weeks !== '0')
    expect(plan.map((node) => node.getAttribute('unit'))).toEqual(studyWeeks.map(({ topic }) => topic))
    expect(studyWeeks.reduce((sum, { weeks }) => sum + weeksIn(weeks), 0)).toBe(WEEKS)
    expect(feedPlan().reduce((sum, { hours }) => sum + hours, 0)).toBe(WEEKS * WEEKLY_HOURS)
  })

  it('значения параметров из справочника Яндекса', () => {
    // В справочнике слово «с» кириллицей: с латинской «c» значение не распознаётся.
    expect(param('Формат обучения').textContent).toBe('В группе с наставником')
    expect(param('Формат обучения').textContent).not.toMatch(/[a-z]/i)
    expect(param('Тип обучения').textContent).toBe('Курс')
    expect(param('Сложность').textContent).toBe('Для опытных')
    expect(param('Часы в неделю').textContent).toBe(String(WEEKLY_HOURS))
    for (const name of ['Есть вебинары', 'Есть домашние работы', 'Есть текстовые уроки']) expect(param(name).textContent).toBe('true')
    // На странице нет ни трудоустройства, ни документа об обучении: в фиде их тоже нет.
    expect(params('С трудоустройством')).toHaveLength(0)
    expect(params('Результат обучения')).toHaveLength(0)
  })

  it('без длинных тире, как весь текст сайта', () => {
    expect(coursesFeed()).not.toMatch(/[—–]/)
  })

  it('фид отдаётся маршрутом лендинга и не попадает в карту сайта', () => {
    expect(readFileSync(landing('src/pages/yandex-courses.xml.ts'), 'utf8')).toContain('coursesFeed()')
    expect(readFileSync(landing('src/pages/sitemap.xml.ts'), 'utf8')).not.toContain('yandex-courses')
  })
})
