import { describe, expect, it } from 'vitest'

import { lexicalToMarkdown } from '@/lib/lexical'

/**
 * Разворачивание richText обратно в Markdown.
 *
 * Условия задач тренажёра переехали на Markdown, но у записей, созданных
 * раньше, они лежат в Lexical. Конвертер покрывает только то, что реально
 * встречается в старых документах, — поэтому важно, что незнакомый узел
 * не теряет текст, а не то, что поддержан весь формат.
 */

const doc = (...children: unknown[]) => ({
  root: { type: 'root', version: 1, children },
})
const text = (value: string, format = 0) => ({ type: 'text', text: value, format })
const paragraph = (...children: unknown[]) => ({ type: 'paragraph', children })

describe('lexical → markdown', () => {
  describe('что не является документом', () => {
    it.each([null, undefined, '', 'строка', 42, {}, { root: null }])(
      'значение %j даёт пустую строку, а не падение',
      (value) => {
        expect(lexicalToMarkdown(value)).toBe('')
      },
    )
  })

  describe('блоки', () => {
    it('абзац выводится текстом', () => {
      expect(lexicalToMarkdown(doc(paragraph(text('Первый абзац'))))).toBe('Первый абзац')
    })

    it('абзацы разделяются пустой строкой', () => {
      const result = lexicalToMarkdown(doc(paragraph(text('Первый')), paragraph(text('Второй'))))

      expect(result).toBe('Первый\n\nВторой')
    })

    it.each([
      ['h1', '#'],
      ['h2', '##'],
      ['h3', '###'],
      ['h6', '######'],
    ])('заголовок %s даёт %s', (tag, hashes) => {
      const result = lexicalToMarkdown(doc({ type: 'heading', tag, children: [text('Раздел')] }))

      expect(result).toBe(`${hashes} Раздел`)
    })

    it('заголовок без уровня считается вторым', () => {
      expect(lexicalToMarkdown(doc({ type: 'heading', children: [text('Раздел')] }))).toBe(
        '## Раздел',
      )
    })

    it('уровень заголовка не выходит за пределы разметки', () => {
      const result = lexicalToMarkdown(doc({ type: 'heading', tag: 'h9', children: [text('X')] }))

      expect(result).toBe('###### X')
    })

    it('цитата помечается угловой скобкой', () => {
      expect(lexicalToMarkdown(doc({ type: 'quote', children: [text('Мысль')] }))).toBe('> Мысль')
    })

    it('блок кода оборачивается в ограждение', () => {
      const result = lexicalToMarkdown(doc({ type: 'code', children: [text('const a = 1')] }))

      expect(result).toBe('```\nconst a = 1\n```')
    })

    it('горизонтальная линия', () => {
      expect(lexicalToMarkdown(doc({ type: 'horizontalrule' }))).toBe('---')
    })
  })

  describe('списки', () => {
    const item = (value: string) => ({ type: 'listitem', children: [text(value)] })

    it('маркированный', () => {
      const result = lexicalToMarkdown(
        doc({ type: 'list', listType: 'bullet', children: [item('Первое'), item('Второе')] }),
      )

      expect(result).toBe('- Первое\n- Второе')
    })

    it('нумерованный считает с единицы', () => {
      const result = lexicalToMarkdown(
        doc({ type: 'list', listType: 'number', children: [item('Первое'), item('Второе')] }),
      )

      expect(result).toBe('1. Первое\n2. Второе')
    })

    it('пункт без вложенных узлов не рушит список', () => {
      const result = lexicalToMarkdown(
        doc({ type: 'list', listType: 'bullet', children: [item('Есть'), {}] }),
      )

      expect(result).toContain('- Есть')
    })
  })

  describe('оформление текста', () => {
    it.each([
      [1, '**жирный**'],
      [2, '_курсив_'],
      [16, '`код`'],
    ])('маска %i даёт %s', (format, expected) => {
      const value = format === 1 ? 'жирный' : format === 2 ? 'курсив' : 'код'

      expect(lexicalToMarkdown(doc(paragraph(text(value, format))))).toBe(expected)
    })

    it('сочетание масок накладывается', () => {
      // 1 | 2 = жирный и курсив одновременно
      expect(lexicalToMarkdown(doc(paragraph(text('оба', 3))))).toBe('_**оба**_')
    })

    it('ссылка превращается в markdown-ссылку', () => {
      const result = lexicalToMarkdown(
        doc(paragraph({ type: 'link', url: 'https://example.com', children: [text('туда')] })),
      )

      expect(result).toBe('[туда](https://example.com)')
    })

    it('ссылка без адреса не теряет подпись', () => {
      const result = lexicalToMarkdown(doc(paragraph({ type: 'link', children: [text('подпись')] })))

      expect(result).toBe('подпись')
    })

    it('соседние узлы склеиваются без пробела — переносы задаёт сам текст', () => {
      const result = lexicalToMarkdown(doc(paragraph(text('Начало'), text(' и конец'))))

      expect(result).toBe('Начало и конец')
    })
  })

  describe('устойчивость к незнакомому содержимому', () => {
    it('незнакомый тип узла отдаёт вложенный текст', () => {
      const result = lexicalToMarkdown(
        doc({ type: 'какой-то-новый-блок', children: [text('Текст внутри')] }),
      )

      expect(result).toBe('Текст внутри')
    })

    it('пустой незнакомый узел не даёт пустых строк в выводе', () => {
      const result = lexicalToMarkdown(
        doc({ type: 'неизвестный', children: [] }, paragraph(text('Видимый'))),
      )

      expect(result).toBe('Видимый')
    })

    it('не-объекты среди узлов пропускаются', () => {
      const result = lexicalToMarkdown(doc(null, 'строка', 42, paragraph(text('Уцелел'))))

      expect(result).toBe('Уцелел')
    })

    it('лишние переносы по краям срезаются', () => {
      const result = lexicalToMarkdown(doc(paragraph(), paragraph(text('Текст')), paragraph()))

      expect(result).toBe('Текст')
    })
  })
})
