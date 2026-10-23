import { describe, expect, it } from 'vitest'

import {
  GUIDE_NEW_DAYS,
  defaultGuideReviewBy,
  guideIsNew,
  guideReadingMinutes,
  guideReviewHorizon,
  guideReviewState,
} from '@/lib/guides'

const DAY = 24 * 60 * 60 * 1000

describe('время чтения гайда', () => {
  const words = Array.from({ length: 480 }, (_, i) => `слово${i}`).join(' ')

  it('считает текст, а не разметку и адреса ссылок', () => {
    const links = Array.from({ length: 200 }, (_, i) => `[ссылка](https://example.com/${'очень/длинный/адрес/'.repeat(5)}${i})`).join(' ')
    expect(guideReadingMinutes(`## Раздел\n\n${words}\n\n${links}`)).toBe(4)
  })

  it('короткий или пустой гайд — не меньше минуты', () => {
    expect(guideReadingMinutes('Коротко')).toBe(1)
    expect(guideReadingMinutes('   ')).toBe(1)
    expect(guideReadingMinutes(null)).toBe(1)
  })
})

describe('пересмотр гайда', () => {
  const now = Date.parse('2026-10-23T12:00:00.000Z')

  it('срок по умолчанию — через 90 дней после проверки', () => {
    expect(defaultGuideReviewBy('2026-10-22T12:00:00.000Z')).toBe('2027-01-20T12:00:00.000Z')
  })

  it('прошедший срок — просрочен, ближайшие две недели — скоро, дальше — в порядке', () => {
    expect(guideReviewState(new Date(now - DAY).toISOString(), now)).toBe('overdue')
    expect(guideReviewState(new Date(now).toISOString(), now)).toBe('overdue')
    expect(guideReviewState(new Date(now + 10 * DAY).toISOString(), now)).toBe('soon')
    expect(guideReviewState(new Date(now + 15 * DAY).toISOString(), now)).toBe('ok')
  })

  it('без срока или с испорченной датой — состояния нет', () => {
    expect(guideReviewState(null, now)).toBeNull()
    expect(guideReviewState('не дата', now)).toBeNull()
  })

  it('граница списка «пора пересмотреть» — через 14 дней', () => {
    expect(guideReviewHorizon(now)).toBe(new Date(now + 14 * DAY).toISOString())
  })
})

describe('«Новое» в списке гайдов', () => {
  const now = Date.parse('2026-10-23T12:00:00.000Z')
  const daysAgo = (days: number) => new Date(now - days * DAY).toISOString()

  it('недавно опубликованный и не открытый гайд — новый', () => {
    expect(guideIsNew(daysAgo(1), false, now)).toBe(true)
  })

  it('открытый, давний или ещё не опубликованный — не новый', () => {
    expect(guideIsNew(daysAgo(1), true, now)).toBe(false)
    expect(guideIsNew(daysAgo(GUIDE_NEW_DAYS), false, now)).toBe(false)
    expect(guideIsNew(null, false, now)).toBe(false)
    expect(guideIsNew('не дата', false, now)).toBe(false)
  })
})
