import { describe, expect, it } from 'vitest'

import { guideContents, guideHeadings, guideReadingMinutes } from '@/lib/guides'

const text = (value: string) => ({ type: 'text', text: value, version: 1 })
const heading = (tag: string, value: string) => ({ type: 'heading', tag, version: 1, children: [text(value)] })
const paragraph = (value: string) => ({ type: 'paragraph', version: 1, children: [text(value)] })
const doc = (...children: unknown[]) => ({ root: { type: 'root', version: 1, children } })

describe('оглавление гайда', () => {
  it('берёт только заголовки второго уровня из корня и помнит их позицию среди узлов', () => {
    const content = doc(
      heading('h2', 'Что подготовить'),
      paragraph('Почта и компьютер'),
      heading('h3', 'Подраздел не попадает в оглавление'),
      heading('h2', 'Шаг 1. Браузер'),
      { type: 'quote', version: 1, children: [heading('h2', 'Вложенный заголовок')] },
    )
    expect(guideHeadings(content)).toEqual([
      { index: 0, id: 'section-1', title: 'Что подготовить' },
      { index: 3, id: 'section-2', title: 'Шаг 1. Браузер' },
    ])
  })

  it('пустой заголовок пропускается и не сбивает нумерацию якорей', () => {
    const content = doc(heading('h2', '  '), heading('h2', 'Первый настоящий'))
    expect(guideHeadings(content)).toEqual([{ index: 1, id: 'section-1', title: 'Первый настоящий' }])
  })

  it.each([null, undefined, 'строка', {}, { root: { children: 'нет' } }])('не падает на значении без документа: %j', (value) => {
    expect(guideHeadings(value)).toEqual([])
  })
})

describe('время чтения гайда', () => {
  const words = Array.from({ length: 480 }, (_, i) => `слово${i}`).join(' ')

  it('считает слова всего документа и округляет до минут', () => {
    expect(guideReadingMinutes({ content: doc(heading('h2', 'Раздел'), paragraph(words)) })).toBe(3)
  })

  it('у гайда в Markdown считает текст, а не разметку и адреса ссылок', () => {
    const links = Array.from({ length: 200 }, (_, i) => `[ссылка](https://example.com/${'очень/длинный/адрес/'.repeat(5)}${i})`).join(' ')
    expect(guideReadingMinutes({ markdown: `## Раздел\n\n${words}\n\n${links}`, content: doc(paragraph('Старый текст')) })).toBe(4)
  })

  it('короткий или пустой гайд — не меньше минуты', () => {
    expect(guideReadingMinutes({ content: doc(paragraph('Коротко')) })).toBe(1)
    expect(guideReadingMinutes({ content: null })).toBe(1)
    expect(guideReadingMinutes({ markdown: '   ', content: null })).toBe(1)
  })
})

describe('оглавление гайда в любом формате', () => {
  it('Markdown важнее старого Lexical, пустой Markdown — нет', () => {
    const legacy = doc(heading('h2', 'Старый раздел'))
    expect(guideContents({ markdown: '## Новый раздел\n\nТекст', content: legacy }).map((h) => h.title)).toEqual(['Новый раздел'])
    expect(guideContents({ markdown: ' \n', content: legacy }).map((h) => h.title)).toEqual(['Старый раздел'])
  })
})
