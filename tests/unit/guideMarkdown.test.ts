import { describe, expect, it } from 'vitest'

import { guideDownloadDisposition, guideMarkdownFile, hasFrontmatter, parseGuideFile } from '@/lib/guide-file'
import { guideMarkdownHeadings, markdownCodeLanguages } from '@/lib/guide-markdown'

describe('файл гайда .md', () => {
  it('шапка раскладывается по полям и уходит из текста', () => {
    const file = [
      '---',
      'title: "Гайд: «кавычки» и двоеточие"',
      "summary: 'Коротко о главном, it''s fine'",
      'slug: interview   # адрес гайда',
      'order: 7',
      'published: true',
      'author: игнорируется',
      '---',
      '',
      'Вступление.',
      '',
      '## Раздел',
    ].join('\n')
    expect(parseGuideFile(file)).toEqual({
      fields: { title: 'Гайд: «кавычки» и двоеточие', summary: "Коротко о главном, it's fine", slug: 'interview', order: 7, published: true },
      markdown: 'Вступление.\n\n## Раздел',
    })
  })

  it('без шапки первая строка «# …» становится названием и не дублируется в тексте', () => {
    expect(parseGuideFile('\uFEFF# Как пройти собеседование\n\nТекст')).toEqual({ fields: { title: 'Как пройти собеседование' }, markdown: 'Текст' })
  })

  it('заголовок «# …», отличный от названия в шапке, остаётся в тексте', () => {
    const parsed = parseGuideFile('---\ntitle: Название\n---\n# Другое\n\nТекст')
    expect(parsed.fields.title).toBe('Название')
    expect(parsed.markdown).toBe('# Другое\n\nТекст')
  })

  it('решётка внутри значения — не комментарий; неверные order и published пропускаются', () => {
    expect(parseGuideFile('---\ntitle: C# для начинающих\norder: седьмой\npublished: да\n---\nТекст').fields).toEqual({ title: 'C# для начинающих' })
  })

  it('текст без шапки и заголовка не меняется, кроме хвостовых пробелов', () => {
    expect(parseGuideFile('Просто текст\n\n- пункт\n\n')).toEqual({ fields: {}, markdown: 'Просто текст\n\n- пункт' })
    expect(hasFrontmatter('Просто текст')).toBe(false)
    expect(hasFrontmatter('---\ntitle: x\n---\n')).toBe(true)
  })

  it('скачанный файл самодостаточен: название, описание, текст и источник', () => {
    const file = guideMarkdownFile(
      { title: 'LinkedIn', summary: 'Как завести\nаккаунт', slug: 'linkedin', markdown: '## Шаг 1\n\nТекст\n', updatedAt: '2026-10-22T12:00:00.000Z' },
      'https://learn.mentorcareer.ru',
    )
    expect(file).toBe('# LinkedIn\n\n> Как завести аккаунт\n\n## Шаг 1\n\nТекст\n\n---\n\nИсточник: https://learn.mentorcareer.ru/guides/linkedin · обновлён 22 октября 2026 г.\n')
  })

  it('имя скачиваемого файла — по slug, с ASCII-запасным вариантом', () => {
    expect(guideDownloadDisposition('linkedin')).toBe(`attachment; filename="linkedin.md"; filename*=UTF-8''linkedin.md`)
    expect(guideDownloadDisposition('гайд')).toBe(`attachment; filename="guide.md"; filename*=UTF-8''%D0%B3%D0%B0%D0%B9%D0%B4.md`)
  })
})

describe('Markdown гайда', () => {
  it('оглавление — только «##» в корне: не из цитат, списков и кода', () => {
    const markdown = [
      '# Заголовок первого уровня',
      '## Первый **раздел**',
      '> ## В цитате',
      '- ## В списке',
      '```md',
      '## В коде',
      '```',
      '### Подраздел',
      'Второй раздел\n------------',
    ].join('\n\n')
    const headings = guideMarkdownHeadings(markdown)
    expect(headings.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'section-1', title: 'Первый раздел' },
      { id: 'section-2', title: 'Второй раздел' },
    ])
    expect(markdown.slice(headings[0].offset).startsWith('## Первый')).toBe(true)
  })

  it('языки блоков кода — без повторов и в нижнем регистре', () => {
    expect(markdownCodeLanguages('```TS\na\n```\n\n~~~ bash\nb\n~~~\n\n```ts\nc\n```\n\n```\nd\n```')).toEqual(['ts', 'bash'])
  })
})
