import { SITE_URL } from '../config'
import { BOOTCAMP_PATH, COURSE_DESCRIPTION, COURSE_NAME, LAST_CLASS_ISO, PREP_START, PRICE, PROGRAM, PROGRAM_KEY, START_ISO, WEEKLY_HOURS } from './bootcamp'
import { OPERATOR } from './privacy'

/**
 * Фид курсов для Яндекса (Вебмастер, «Услуги и предложения», «Образование»), формат YML:
 * https://yandex.ru/support/webmaster/search-appearance/education.html. Собирается из тех же
 * данных, что и страница: Яндекс сверяет цену и дату фида с сайтом и при расхождении снимает
 * предложение.
 */

/** Рубрикатор курсов Яндекса: 101 «Веб-разработка» внутри 100 «Программирование». */
export const FEED_CATEGORY_ID = 101
/** Значение из справочника Яндекса; в его документации в слове «c» латинская буква, в образце фида - кириллица. */
export const FEED_FORMAT = 'В группе с наставником'

type Param = { name: string; value: string | number | boolean; attrs?: Record<string, string | number> }

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** «1-2» - две недели, «13-16» - четыре. */
export function weeksIn(range: string): number {
  const [from, to = from] = range.split('-').map(Number)
  if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) throw new Error(`Неверный диапазон недель: ${range}`)
  return to - from + 1
}

/** Этапы «Плана»: учебные недели без недели подготовки, часы по нижней границе нагрузки. */
export function feedPlan() {
  return PROGRAM.filter(({ weeks }) => weeks !== '0').map(({ weeks, topic }, index) => ({
    order: index + 1,
    unit: topic,
    hours: weeksIn(weeks) * WEEKLY_HOURS,
    text: `Недели ${weeks}`,
  }))
}

/** Календарные месяцы потока с округлением вверх: 13 февраля - 4 июля это 5 месяцев. */
export function feedMonths(): number {
  const days = (Date.parse(LAST_CLASS_ISO) - Date.parse(START_ISO)) / 86_400_000 + 1
  return Math.ceil(days / (365.25 / 12))
}

function params(): Param[] {
  return [
    { name: 'Ближайшая дата', value: START_ISO },
    { name: 'Продолжительность', value: feedMonths(), attrs: { unit: 'месяц' } },
    ...feedPlan().map(({ order, unit, hours, text }) => ({ name: 'План', value: text, attrs: { order, unit, hours } })),
    { name: 'Формат обучения', value: FEED_FORMAT },
    { name: 'Тип обучения', value: 'Курс' },
    // На входе нужен уверенный JavaScript, TypeScript и Git: курс не для новичков.
    { name: 'Сложность', value: 'Для опытных' },
    { name: 'Часы в неделю', value: WEEKLY_HOURS },
    // Занятия в субботу и воскресенье, сдача задачи каждую неделю, методички к каждой неделе.
    { name: 'Есть вебинары', value: true },
    { name: 'Есть домашние работы', value: true },
    { name: 'Есть текстовые уроки', value: true },
  ]
}

function param({ name, value, attrs = {} }: Param): string {
  const extra = Object.entries(attrs).map(([key, item]) => ` ${key}="${escape(String(item))}"`).join('')
  return `        <param name="${escape(name)}"${extra}>${escape(String(value))}</param>`
}

/** Дата выгрузки в часовом поясе UTC без миллисекунд: 2026-11-03T12:00:00+00:00. */
const feedDate = (now: Date) => `${now.toISOString().slice(0, 19)}+00:00`

export function coursesFeed(now = new Date()): string {
  const pageUrl = new URL(BOOTCAMP_PATH, SITE_URL).href
  const description = `${COURSE_DESCRIPTION} Перед стартом неделя подготовки с ${PREP_START}.`
  return `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${feedDate(now)}">
  <shop>
    <name>MentorCareer</name>
    <url>${escape(`${SITE_URL}/`)}</url>
    <email>${escape(OPERATOR.email)}</email>
    <picture>${escape(new URL('/apple-touch-icon.png', SITE_URL).href)}</picture>
    <currencies>
      <currency id="RUR" rate="1"/>
    </currencies>
    <offers>
      <offer id="${escape(PROGRAM_KEY)}">
        <name>${escape(COURSE_NAME)}</name>
        <url>${escape(pageUrl)}</url>
        <categoryId>${FEED_CATEGORY_ID}</categoryId>
        <price>${PRICE.value}</price>
        <currencyId>RUR</currencyId>
        <description>${escape(description)}</description>
${params().map(param).join('\n')}
      </offer>
    </offers>
  </shop>
</yml_catalog>
`
}
