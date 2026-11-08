import { describe, expect, it } from 'vitest'

import { insertCode, insertText, rehypeTimestamps, TIMESTAMP_PROPERTY } from '@/lib/message-markdown'

/** Кнопки поля сообщения: вставка кода и метки времени на место выделения. */
describe('кнопка «Код»', () => {
  it('выделение в одну строку становится кодом в строке', () => {
    expect(insertCode('вызов fetch() падает', 6, 13)).toEqual({ value: 'вызов `fetch()` падает', selectionStart: 7, selectionEnd: 14 })
  })

  it('многострочное выделение - блоком на своих строках', () => {
    const value = 'Код:const a = 1\nconst b = 2 конец'
    const start = 4
    const end = value.indexOf(' конец')
    const edit = insertCode(value, start, end)

    expect(edit.value).toBe('Код:\n```\nconst a = 1\nconst b = 2\n```\n конец')
    expect(edit.value.slice(edit.selectionStart, edit.selectionEnd)).toBe('const a = 1\nconst b = 2')
  })

  it('без выделения - пустой блок с курсором внутри', () => {
    const edit = insertCode('Вот код\n', 8, 8)

    expect(edit.value).toBe('Вот код\n```\n\n```\n')
    expect(edit.selectionStart).toBe('Вот код\n```\n'.length)
    expect(edit.selectionEnd).toBe(edit.selectionStart)
  })
})

describe('вставка текста', () => {
  it('заменяет выделение и ставит курсор после вставки', () => {
    expect(insertText('на XX непонятно', 3, 5, '[1:05] ')).toEqual({ value: 'на [1:05]  непонятно', selectionStart: 10, selectionEnd: 10 })
  })
})

type Node = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: Node[] }

const text = (value: string): Node => ({ type: 'text', value })
const element = (tagName: string, children: Node[]): Node => ({ type: 'element', tagName, properties: {}, children })

describe('таймкоды в тексте сообщения', () => {
  it('«12:34» и «[1:02:05]» становятся переходами, остальной текст на месте', () => {
    const tree = { type: 'root', children: [element('p', [text('Смотрю [12:34], потом 1:02:05 - не ясно')])] }
    rehypeTimestamps()(tree as never)

    const children = (tree.children[0] as Node).children ?? []
    expect(children.map((node) => node.type === 'text' ? node.value : `<${node.properties?.[TIMESTAMP_PROPERTY]}>`)).toEqual([
      'Смотрю ', '<754>', ', потом ', '<3725>', ' - не ясно',
    ])
    expect(children[1]).toMatchObject({ tagName: 'a', properties: { href: '?t=754' }, children: [{ value: '12:34' }] })
  })

  it('в коде и ссылках время остаётся текстом', () => {
    const code = element('code', [text('timeout 10:30')])
    const link = element('a', [text('запись 12:00')])
    const tree = { type: 'root', children: [element('pre', [code]), element('p', [link])] }
    rehypeTimestamps()(tree as never)

    expect(code.children).toEqual([text('timeout 10:30')])
    expect(link.children).toEqual([text('запись 12:00')])
  })

  it('невозможное время - не таймкод', () => {
    const paragraph = element('p', [text('счёт 3:75')])
    rehypeTimestamps()({ type: 'root', children: [paragraph] } as never)

    expect(paragraph.children).toEqual([text('счёт 3:75')])
  })
})
