import { describe, expect, it } from 'vitest'

import { lexicalPlainText } from '@/lib/lexical-text'
import { PLATFORM_SECTIONS } from '@/lib/platform-sections'

const paragraph = (...children: unknown[]) => ({ type: 'paragraph', version: 1, children })
const text = (value: string) => ({ type: 'text', text: value, version: 1 })

describe('плоский текст описания', () => {
  it('склеивает абзацы и текст внутри ссылок, убирая лишние пробелы', () => {
    const doc = { root: { type: 'root', children: [
      paragraph(text('Первый  абзац '), { type: 'link', fields: { url: '/courses' }, children: [text('со ссылкой')] }),
      paragraph(),
      paragraph(text('Второй абзац.')),
    ] } }
    expect(lexicalPlainText(doc)).toBe('Первый абзац со ссылкой Второй абзац.')
  })
  it('пункты списка и перенос строки остаются отдельными словами', () => {
    const item = (value: string) => ({ type: 'listitem', version: 1, children: [text(value)] })
    const doc = { root: { type: 'root', children: [
      { type: 'list', listType: 'bullet', version: 1, children: [item('HTML'), item('CSS')] },
      paragraph(text('Первая строка'), { type: 'linebreak', version: 1 }, text('вторая строка')),
    ] } }
    expect(lexicalPlainText(doc)).toBe('HTML CSS Первая строка вторая строка')
  })
  it.each([null, undefined, 'строка', 42, {}, { root: null }, { root: { children: 'нет' } }])('не падает на значении без документа: %j', (value) => {
    expect(lexicalPlainText(value)).toBe('')
  })
})

describe('справочник разделов платформы', () => {
  it('у каждого пункта меню есть уникальный адрес и содержательное пояснение', () => {
    expect(new Set(PLATFORM_SECTIONS.map((section) => section.href)).size).toBe(PLATFORM_SECTIONS.length)
    for (const section of PLATFORM_SECTIONS) {
      expect(section.label.length, section.href).toBeGreaterThan(2)
      expect(section.hint.length, section.href).toBeGreaterThanOrEqual(30)
      expect(section.hint, section.href).not.toMatch(/[.!]$/)
    }
  })
})
