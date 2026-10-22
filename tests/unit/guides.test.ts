import { describe, expect, it } from 'vitest'

import { guideHeadings, guideReadingMinutes } from '@/lib/guides'

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
  it('считает слова всего документа и округляет до минут', () => {
    const words = Array.from({ length: 480 }, (_, i) => `слово${i}`).join(' ')
    expect(guideReadingMinutes(doc(heading('h2', 'Раздел'), paragraph(words)))).toBe(3)
  })

  it('короткий или пустой гайд — не меньше минуты', () => {
    expect(guideReadingMinutes(doc(paragraph('Коротко')))).toBe(1)
    expect(guideReadingMinutes(null)).toBe(1)
  })
})
