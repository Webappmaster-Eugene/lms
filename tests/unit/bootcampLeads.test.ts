import { describe, expect, it } from 'vitest'

import { BootcampLeadError, describeLeadSource, isLeadTrap, leadBodyFromForm, leadResumeKind, leadResumeName, normalizeLeadTelegram, parseBootcampLead } from '@/lib/bootcamp-leads'
import { LEAD_ANSWERS, LEAD_DOCX, LEAD_DOCX_WITH_MACROS, LEAD_DOCX_WORD_ONLINE, LEAD_PDF, LEAD_PDF_NEAR_LIMIT, leadFormData } from '../fixtures/bootcampLead'
import { zipOf } from '../fixtures/zip'

const valid = { ...LEAD_ANSWERS, program: 'nodejs', email: '  Ivan.Petrov@Mail.RU ', name: '  Иван   Петров ', consent: true, consentVersion: '2026-10-26' }

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
      program: 'nodejs', email: 'ivan.petrov@mail.ru', name: 'Иван Петров', consentVersion: '2026-10-26',
      telegram: '@ivan_petrov', reason: 'switch-or-grow', problem: LEAD_ANSWERS.problem, story: LEAD_ANSWERS.story, goal: LEAD_ANSWERS.goal,
      urgency: 'soon', hoursPerWeek: '10-20', links: null, fillSeconds: 20,
      source: { utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null, referrerHost: null, ymClientId: null },
    })
  })

  it('имя обязательно', () => {
    expect(error({ ...valid, name: '   ' })).toMatch(/Как к вам обращаться/)
    expect(error({ ...valid, name: undefined })).toMatch(/Как к вам обращаться/)
  })

  // Есть ли программа и принимает ли она заявки, проверяет сервер по CMS (интеграционный тест заявок).
  it('без согласия, с ключом программы не в том формате или версией согласия — отказ с объяснением', () => {
    expect(error({ ...valid, consent: 'true' })).toMatch(/согласие/)
    expect(error({ ...valid, program: 'Python!' })).toMatch(/программы нет/)
    expect(error({ ...valid, consentVersion: '../policy' })).toMatch(/версию согласия/)
    expect(error([valid])).toMatch(/неверном формате/)
  })

  it.each(['', 'ivan', 'ivan@mail', '@mail.ru', 'ivan @mail.ru', `${'a'.repeat(250)}@mail.ru`, 'ivan@ma\nil.ru', 'ivan..petrov@mail.ru', 'ivan@-mail.ru'])('отклоняет email «%s»', (email) => {
    expect(error({ ...valid, email })).toMatch(/email/i)
  })

  it('отклоняет длинное имя и служебные символы в нём', () => {
    expect(error({ ...valid, name: 'И'.repeat(101) })).toMatch(/до 100 знаков/)
    expect(error({ ...valid, name: 'Иван\u0000' })).toMatch(/служебных символов/)
    expect(error({ ...valid, name: 42 })).toMatch(/Как к вам обращаться/)
    // Смена направления текста подменила бы видимое имя в письме команде.
    expect(error({ ...valid, name: 'Иван\u202eвонтеП' })).toMatch(/служебных символов/)
  })

  it('метки рекламы обрезает, а не отказывает; из источника берёт только хост', () => {
    const lead = parseBootcampLead({
      ...valid,
      utm: { utm_source: ' telegram ', utm_medium: 'post\u0007x', utm_campaign: 'c'.repeat(300), utm_content: 7, extra: 'drop' },
      referrer: 'https://habr.com/ru/articles/1?email=ivan@mail.ru',
    })
    expect(lead.source).toEqual({ utmSource: 'telegram', utmMedium: 'post x', utmCampaign: 'c'.repeat(100), utmContent: null, utmTerm: null, referrerHost: 'habr.com', ymClientId: null })
    expect(parseBootcampLead({ ...valid, referrer: 'javascript:alert(1)' }).source.referrerHost).toBeNull()
    expect(parseBootcampLead({ ...valid, utm: 'utm_source=x' }).source.utmSource).toBeNull()
  })

  it('ClientID Метрики: цифры сохраняет, всё другое отбрасывает без отказа в заявке', () => {
    expect(parseBootcampLead({ ...valid, ymClientId: ' 1731234567123456789 ' }).source.ymClientId).toBe('1731234567123456789')
    for (const ymClientId of ['', 'abc', '17312345671234567890123456789012', '1731234567.5', 42, null, '<script>']) {
      expect(parseBootcampLead({ ...valid, ymClientId }).source.ymClientId, String(ymClientId)).toBeNull()
    }
  })

  it('форма multipart: ClientID приходит своим полем', () => {
    expect(parseBootcampLead(leadBodyFromForm(leadFormData({ ...valid, ymClientId: '1731234567123456789' }))).source.ymClientId).toBe('1731234567123456789')
  })

  it('заполненное скрытое поле помечает отправку робота', () => {
    expect(isLeadTrap({ website: 'https://spam.example' })).toBe(true)
    expect(isLeadTrap({ website: '  ' })).toBe(false)
    expect(isLeadTrap({})).toBe(false)
    expect(isLeadTrap(null)).toBe(false)
  })

  describe('анкета', () => {
    const fieldOf = (body: unknown) => {
      try {
        parseBootcampLead(body)
      } catch (caught) {
        return (caught as BootcampLeadError).field
      }
      throw new Error('заявка неожиданно прошла проверку')
    }

    it.each([
      ['коротко', 'Хочу работу.'],
      ['длинно, но одна буква', 'а '.repeat(80)],
      ['длинно, но знаки', '!?.,-+= '.repeat(20)],
      ['длинно, но мало разных слов', 'работа работа работа работа работа работа работа работа работа работа работа работа работа работа работа работа'],
      ['длинно, но одно слово', 'работа'.repeat(30)],
    ])('проблема и история не принимают ответ «%s»', (_label, answer) => {
      expect(fieldOf({ ...valid, problem: answer })).toBe('problem')
      expect(fieldOf({ ...valid, story: answer })).toBe('story')
    })

    it('пустой ответ объясняет, что написать, а слишком длинный - предел', () => {
      expect(error({ ...valid, problem: ' ' })).toMatch(/в чём сейчас проблема/)
      expect(error({ ...valid, story: undefined })).toMatch(/свою историю/)
      expect(error({ ...valid, goal: '' })).toMatch(/какой результат/)
      expect(error({ ...valid, problem: `${LEAD_ANSWERS.problem} `.repeat(30) })).toMatch(/до 3000 знаков/)
    })

    it('одна и та же запись в проблеме и истории - отказ на истории, регистр и пробелы не спасают', () => {
      const story = `  ${LEAD_ANSWERS.problem.toUpperCase().replace(/ /g, '   ')}  `
      expect(fieldOf({ ...valid, story })).toBe('story')
      expect(error({ ...valid, story })).toMatch(/совпадает/)
    })

    it('результат: от 20 знаков и трёх слов', () => {
      expect(fieldOf({ ...valid, goal: 'Оффер' })).toBe('goal')
      expect(fieldOf({ ...valid, goal: 'Оффероффероффероффероффер' })).toBe('goal')
      expect(parseBootcampLead({ ...valid, goal: 'Оффер в декабре этого года' }).goal).toBe('Оффер в декабре этого года')
    })

    it('абзацы сохраняет, невидимые знаки при вставке из документа убирает', () => {
      const problem = `${LEAD_ANSWERS.problem}\r\n\r\n\r\n\r\nВторой абзац\u2028и\u200b строка\u0007.`
      expect(parseBootcampLead({ ...valid, problem }).problem).toBe(`${LEAD_ANSWERS.problem}\n\nВторой абзац\nи строка.`)
    })

    it.each(['reason', 'urgency', 'hoursPerWeek'])('%s: только значение из списка', (field) => {
      expect(fieldOf({ ...valid, [field]: '' })).toBe(field)
      expect(fieldOf({ ...valid, [field]: 'admin' })).toBe(field)
    })

    it('слишком быстро или без замера - отказ, повтор возможен', () => {
      expect(error({ ...valid, fillMs: '14999' })).toMatch(/слишком быстро/)
      expect(error({ ...valid, fillMs: '0' })).toMatch(/слишком быстро/)
      expect(error({ ...valid, fillMs: undefined })).toMatch(/слишком быстро/)
      expect(error({ ...valid, fillMs: 'Infinity' })).toMatch(/слишком быстро/)
      expect(parseBootcampLead({ ...valid, fillMs: '15000' }).fillSeconds).toBe(15)
    })

    it.each([
      ['@ivan_petrov', '@ivan_petrov'], ['ivan_petrov', '@ivan_petrov'], ['https://t.me/ivan_petrov', '@ivan_petrov'], ['t.me/ivan_petrov/', '@ivan_petrov'],
      ['https://telegram.me/ivan_petrov', '@ivan_petrov'], ['+7 (916) 123-45-67', '+79161234567'], ['89161234567', '89161234567'],
    ])('Telegram %s принимается как %s', (input, expected) => {
      expect(normalizeLeadTelegram(input)).toBe(expected)
    })

    it.each(['', 'ivan', 'ivan@mail.ru', 'https://evil.test/ivan_petrov', '12345', '@1ivan_petrov', 42])('Telegram %s не принимается: почта и чужие адреса сюда не подходят', (input) => {
      expect(normalizeLeadTelegram(input)).toBeNull()
      expect(fieldOf({ ...valid, telegram: input })).toBe('telegram')
    })

    it('ссылки: без протокола дополняет, чужие схемы и лишние отклоняет', () => {
      expect(parseBootcampLead({ ...valid, links: 'github.com/ivan\nhttps://hh.ru/resume/1, http://site.ru' }).links).toBe('https://github.com/ivan\nhttps://hh.ru/resume/1\nhttp://site.ru/')
      expect(parseBootcampLead({ ...valid, links: '  ' }).links).toBeNull()
      expect(fieldOf({ ...valid, links: 'javascript:alert(1)' })).toBe('links')
      expect(fieldOf({ ...valid, links: 'ftp://site.ru' })).toBe('links')
      expect(fieldOf({ ...valid, links: 'просто-текст' })).toBe('links')
      expect(error({ ...valid, links: 'a.ru b.ru c.ru d.ru e.ru f.ru' })).toMatch(/не больше 5/)
      // Кириллица в адресе после кодирования длиннее в шесть раз: предел считается по готовой ссылке.
      expect(fieldOf({ ...valid, links: `site.ru/${'резюме'.repeat(10)}` })).toBe('links')
    })
  })

  it('форма multipart: флажок и метки рекламы приходят своими полями, файл в тело не попадает', () => {
    const form = leadFormData({ ...valid, utm: { utm_source: 'habr' } }, new File(['x'], 'cv.pdf'))
    const body = leadBodyFromForm(form)
    expect(body).toMatchObject({ consent: true, utm: { utm_source: 'habr' }, telegram: '@ivan_petrov' })
    expect(body.resume).toBeUndefined()
    expect(leadBodyFromForm(leadFormData({ ...valid, consent: false })).consent).toBe(false)
  })

  it('текст анкеты больше предела отклоняется до посимвольной проверки', () => {
    expect(() => leadBodyFromForm(leadFormData({ ...valid, problem: 'а'.repeat(70_000) }))).toThrow('слишком длинная')
  })

  describe('файл резюме', () => {
    const bytes = (text: string) => new TextEncoder().encode(text)

    it('тип определяется по содержимому, а не по имени', () => {
      expect(leadResumeKind(bytes(LEAD_PDF))?.extension).toBe('pdf')
      // Только заголовок: Payload такой файл не примет, поэтому отказываем сразу и с объяснением.
      expect(leadResumeKind(bytes('%PDF-1.7 обрывок'))).toBeNull()
      expect(leadResumeKind(LEAD_DOCX)?.extension).toBe('docx')
      expect(leadResumeKind(LEAD_DOCX_WORD_ONLINE)?.extension).toBe('docx')
      expect(leadResumeKind(new TextEncoder().encode(LEAD_PDF_NEAR_LIMIT))?.extension).toBe('pdf')
      // Строка с именем части есть, а самого документа нет: это обычный архив.
      expect(leadResumeKind(zipOf('word/document.xml', '<w:document/>'))).toBeNull()
      expect(leadResumeKind(LEAD_DOCX_WITH_MACROS)).toBeNull()
      expect(leadResumeKind(zipOf('xl/workbook.xml', '<workbook/>'))).toBeNull()
      expect(leadResumeKind(bytes('MZ исполняемый файл'))).toBeNull()
      expect(leadResumeKind(bytes(''))).toBeNull()
    })

    it('имя файла чистится от служебных знаков и путей', () => {
      expect(leadResumeName('../../etc/резюме\u0000 Ивана.pdf')).toBe('.._.._etc_резюме Ивана.pdf')
      expect(leadResumeName('a'.repeat(300))).toHaveLength(200)
    })
  })

  it('источник для письма команде', () => {
    expect(describeLeadSource({ utmSource: 'habr', utmMedium: 'article', utmCampaign: null, referrerHost: 'habr.com' })).toBe('habr / article')
    expect(describeLeadSource({ referrerHost: 'nadtocheev.ru' })).toBe('переход с nadtocheev.ru')
    expect(describeLeadSource(null)).toBe('прямой заход')
  })
})
