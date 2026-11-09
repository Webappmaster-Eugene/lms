import { describe, expect, it } from 'vitest'

import {
  STARTER_TEMPLATES, TEMPLATE_TITLE_MAX, fillTemplate, matchTemplates, suggestTemplateTitle, templateFromText,
} from '@/lib/reply-templates'

const item = (id: number, title: string, content: string, usageCount = 0) => ({ id, title, content, usageCount })

describe('подстановка в заготовку', () => {
  it('{имя} и {урок} заменяются в любом регистре и сколько угодно раз', () => {
    expect(fillTemplate('{имя}, посмотрите «{урок}». {ИМЯ}, {Урок}', { name: 'Анна', lesson: 'Хуки' }))
      .toBe('Анна, посмотрите «Хуки». Анна, Хуки')
  })

  it('без значения метка остаётся, чтобы ментор её увидел до отправки', () => {
    expect(fillTemplate('{имя}, урок «{урок}»', { name: '  ', lesson: null })).toBe('{имя}, урок «{урок}»')
  })

  it('спецсимволы замены в имени не срабатывают', () => {
    expect(fillTemplate('Привет, {имя}', { name: '$& $1' })).toBe('Привет, $& $1')
  })

  it('прочие фигурные скобки не трогаются', () => {
    expect(fillTemplate('const a = {имя: 1}; {name}', { name: 'Анна' })).toBe('const a = {имя: 1}; {name}')
  })
})

describe('сохранение ответа заготовкой', () => {
  it('имя ученика и урок становятся метками, имя - только целым словом', () => {
    expect(templateFromText('Ян, это есть в уроке «Хуки (useEffect)». В январе Яна... ян', { name: 'Ян', lesson: 'Хуки (useEffect)' }))
      .toBe('{имя}, это есть в уроке «{урок}». В январе Яна... ян')
  })

  it('без значений текст не меняется', () => {
    expect(templateFromText('Пришлите код', { name: null, lesson: '' })).toBe('Пришлите код')
  })

  it('название - первая непустая строка, длинная обрезается многоточием', () => {
    expect(suggestTemplateTitle('\n  Пришлите код целиком  \nи ошибку')).toBe('Пришлите код целиком')
    const title = suggestTemplateTitle('а'.repeat(100))
    expect(title).toHaveLength(60)
    expect(title.endsWith('…')).toBe(true)
  })
})

describe('поиск заготовок', () => {
  const items = [
    item(1, 'Пришлите код', 'Код целиком и ошибку', 2),
    item(2, 'Закройте вопрос', 'Если помогло - нажмите «Вопрос решён»', 5),
    item(3, 'Ещё раз урок', 'Посмотрите урок ещё раз', 0),
    item(4, 'Ошибка окружения', 'Пришлите версию Node и код из консоли', 9),
  ]

  it('пустой запрос - все, частые выше', () => {
    expect(matchTemplates(items, '').map((t) => t.id)).toEqual([4, 2, 1, 3])
  })

  it('совпадение в названии выше совпадения только в тексте', () => {
    expect(matchTemplates(items, 'код').map((t) => t.id)).toEqual([1, 4])
  })

  it('все слова запроса, без учёта регистра и разницы ё/е', () => {
    expect(matchTemplates(items, 'ЕЩЕ урок').map((t) => t.id)).toEqual([3])
    expect(matchTemplates(items, 'код нет такого')).toEqual([])
  })

  it('при равной частоте - по названию', () => {
    expect(matchTemplates([item(1, 'Б', ''), item(2, 'А', '')], '').map((t) => t.id)).toEqual([2, 1])
  })
})

describe('примеры заготовок', () => {
  it('влезают в пределы коллекции и пишутся коротким дефисом', () => {
    for (const starter of STARTER_TEMPLATES) {
      expect(starter.title.length).toBeLessThanOrEqual(TEMPLATE_TITLE_MAX)
      expect(starter.content).not.toMatch(/[—–]/)
    }
  })
})
