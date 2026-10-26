import { describe, expect, it } from 'vitest'

import { BootcampLeadError, describeLeadSource, parseBootcampLead } from '@/lib/bootcamp-leads'

const valid = { program: 'nodejs', email: '  Ivan.Petrov@Mail.RU ', name: '  Иван   Петров ', consent: true, consentVersion: '2026-10-26' }

function error(body: unknown): string {
  try {
    parseBootcampLead(body)
  } catch (caught) {
    expect(caught).toBeInstanceOf(BootcampLeadError)
    return (caught as Error).message
  }
  throw new Error('заявка неожиданно прошла проверку')
}

describe('предзапись на буткемп: разбор формы', () => {
  it('нормализует адрес и имя, источник пустой', () => {
    expect(parseBootcampLead(valid)).toEqual({
      program: 'nodejs', email: 'ivan.petrov@mail.ru', name: 'Иван Петров', consentVersion: '2026-10-26', trap: false,
      source: { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null, referrerHost: null },
    })
  })

  it('имя необязательно', () => {
    expect(parseBootcampLead({ ...valid, name: '   ' }).name).toBeNull()
    expect(parseBootcampLead({ ...valid, name: undefined }).name).toBeNull()
  })

  it('без согласия, с неизвестной программой или версией согласия — отказ с объяснением', () => {
    expect(error({ ...valid, consent: 'true' })).toMatch(/согласие/)
    expect(error({ ...valid, program: 'python' })).toMatch(/программы нет/)
    expect(error({ ...valid, consentVersion: '../policy' })).toMatch(/версию согласия/)
    expect(error([valid])).toMatch(/неверном формате/)
  })

  it.each(['', 'ivan', 'ivan@mail', '@mail.ru', 'ivan @mail.ru', `${'a'.repeat(250)}@mail.ru`, 'ivan@ma\nil.ru', 'ivan..petrov@mail.ru', 'ivan@-mail.ru'])('отклоняет email «%s»', (email) => {
    expect(error({ ...valid, email })).toMatch(/email/i)
  })

  it('отклоняет длинное имя и служебные символы в нём', () => {
    expect(error({ ...valid, name: 'И'.repeat(101) })).toMatch(/до 100 знаков/)
    expect(error({ ...valid, name: 'Иван\u0000' })).toMatch(/служебных символов/)
    expect(error({ ...valid, name: 42 })).toMatch(/текстом/)
    // Смена направления текста подменила бы видимое имя в письме команде.
    expect(error({ ...valid, name: 'Иван\u202eвонтеП' })).toMatch(/служебных символов/)
  })

  it('метки рекламы обрезает, а не отказывает; из источника берёт только хост', () => {
    const lead = parseBootcampLead({
      ...valid,
      utm: { utm_source: ' telegram ', utm_medium: 'post\u0007x', utm_campaign: 'c'.repeat(300), utm_content: 7, extra: 'drop' },
      referrer: 'https://habr.com/ru/articles/1?email=ivan@mail.ru',
    })
    expect(lead.source).toEqual({ utmSource: 'telegram', utmMedium: 'post x', utmCampaign: 'c'.repeat(100), utmContent: null, utmTerm: null, referrerHost: 'habr.com' })
    expect(parseBootcampLead({ ...valid, referrer: 'javascript:alert(1)' }).source.referrerHost).toBeNull()
    expect(parseBootcampLead({ ...valid, utm: 'utm_source=x' }).source.utmSource).toBeNull()
  })

  it('заполненное скрытое поле помечает отправку робота', () => {
    expect(parseBootcampLead({ ...valid, website: 'https://spam.example' }).trap).toBe(true)
    expect(parseBootcampLead({ ...valid, website: '' }).trap).toBe(false)
  })

  it('источник для письма команде', () => {
    expect(describeLeadSource({ utmSource: 'habr', utmMedium: 'article', utmCampaign: null, referrerHost: 'habr.com' })).toBe('habr / article')
    expect(describeLeadSource({ referrerHost: 'nadtocheev.ru' })).toBe('переход с nadtocheev.ru')
    expect(describeLeadSource(null)).toBe('прямой заход')
  })
})
