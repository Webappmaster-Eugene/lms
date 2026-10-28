import { describe, expect, it } from 'vitest'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

import { guideDownloadDisposition, guideMarkdownFile, hasFrontmatter, parseGuideFile } from '@/lib/guide-file'
import { guideMarkdownHeadings, markdownCodeLanguages, remarkGuideCallouts } from '@/lib/guide-markdown'
import { markdownLinks } from '../../scripts/guide-check-links.mjs'

type Node = { type: string; value?: string; children?: Node[]; data?: { hName?: string; hProperties?: Record<string, unknown> } }

/** Дерево после плагина врезок — то, что получит рендер. */
async function callouts(markdown: string): Promise<Node[]> {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkGuideCallouts)
  const tree = (await processor.run(processor.parse(markdown))) as Node
  return tree.children ?? []
}

const text = (node: Node): string => node.value ?? (node.children ?? []).map(text).join('')

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
      problems: [],
    })
  })

  it('категория остаётся как в шапке (в id её переведёт сервер), review_by и reviewBy — одно поле', () => {
    const parsed = parseGuideFile('---\ncategory: ИИ в работе\nreviewed: 2026-10-22\nreview_by: 2027-01-15\n---\nТекст')
    expect(parsed.fields).toEqual({ category: 'ИИ в работе', reviewedAt: '2026-10-22T12:00:00.000Z', reviewBy: '2027-01-15T12:00:00.000Z' })
    expect(parseGuideFile('---\nreviewBy: 2027-01-15\n---\nТекст').fields).toEqual({ reviewBy: '2027-01-15T12:00:00.000Z' })
    expect(parsed.problems).toEqual([])
  })

  it('непонятная дата не теряется молча, а попадает в problems (категорию проверяет сервер по справочнику)', () => {
    const parsed = parseGuideFile('---\ncategory: финансы\nreviewed: 22.10.2026\nreview_by: 2026-02-30\n---\nТекст')
    expect(parsed.fields).toEqual({ category: 'финансы' })
    expect(parsed.problems).toEqual([
      'reviewed: «22.10.2026» - нужна дата вида 2026-10-22',
      'review_by: «2026-02-30» - нужна дата вида 2026-10-22',
    ])
  })

  it('без шапки первая строка «# …» становится названием и не дублируется в тексте', () => {
    expect(parseGuideFile('\uFEFF# Как пройти собеседование\n\nТекст')).toEqual({ fields: { title: 'Как пройти собеседование' }, markdown: 'Текст', problems: [] })
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
    expect(parseGuideFile('Просто текст\n\n- пункт\n\n')).toEqual({ fields: {}, markdown: 'Просто текст\n\n- пункт', problems: [] })
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

  it('в скачанном файле дата проверки вместо даты правки, а ссылки платформы — с доменом', () => {
    const file = guideMarkdownFile(
      { title: 'ИП', summary: 'Коротко', slug: 'ip', markdown: '![Шаг](/api/media/file/step.png) и [гайд](/guides/linkedin), [внешняя](https://x.dev/a), [//cdn](//cdn.dev/x)', updatedAt: '2026-10-23T12:00:00.000Z', reviewedAt: '2026-10-22T12:00:00.000Z' },
      'https://learn.mentorcareer.ru',
    )
    expect(file).toContain('![Шаг](https://learn.mentorcareer.ru/api/media/file/step.png) и [гайд](https://learn.mentorcareer.ru/guides/linkedin), [внешняя](https://x.dev/a), [//cdn](//cdn.dev/x)')
    expect(file).toContain('· данные проверены 22 октября 2026 г.')
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

  it('врезка «> [!WARNING]» становится aside с типом, маркер уходит из текста', async () => {
    const [quote] = await callouts('> [!WARNING]\n> Ловушка с **валютой**.')
    expect(quote.data).toEqual({ hName: 'aside', hProperties: { dataCallout: 'warning' } })
    expect(text(quote)).toBe('Ловушка с валютой.')
  })

  it('текст после маркера — свой заголовок врезки; регистр маркера не важен', async () => {
    const [quote] = await callouts('> [!tip] Главный совет\n> Делайте бэкап.')
    expect(quote.data?.hProperties).toEqual({ dataCallout: 'tip', dataTitle: 'Главный совет' })
    expect(text(quote)).toBe('Делайте бэкап.')
  })

  it('маркер отдельным абзацем убирается вместе с пустым абзацем', async () => {
    const [quote] = await callouts('> [!NOTE]\n>\n> Текст заметки.')
    expect(quote.children?.map((child) => child.type)).toEqual(['paragraph'])
    expect(text(quote)).toBe('Текст заметки.')
  })

  it('обычная цитата и неизвестный маркер остаются цитатой; врезка внутри списка тоже находится', async () => {
    const [plain, unknown, list] = await callouts('> Просто цитата\n\n> [!DANGER] нет такого\n\n- пункт\n\n  > [!CAUTION]\n  > осторожно')
    expect(plain.data).toBeUndefined()
    expect(unknown.data).toBeUndefined()
    expect(text(unknown)).toBe('[!DANGER] нет такого')
    const nested = list.children?.[0].children?.[1]
    expect(nested?.data?.hProperties).toEqual({ dataCallout: 'caution' })
  })

  it('языки блоков кода — без повторов и в нижнем регистре', () => {
    expect(markdownCodeLanguages('```TS\na\n```\n\n~~~ bash\nb\n~~~\n\n```ts\nc\n```\n\n```\nd\n```')).toEqual(['ts', 'bash'])
  })
})

describe('проверка ссылок гайдов', () => {
  it('находит ссылки, картинки, <адреса> и голые адреса, но не в коде и без хвостовой пунктуации', () => {
    const markdown = [
      'См. [справку](https://support.example.com/a?b=1 "Подсказка") и ![шаг](https://img.example.com/s.png).',
      'Адрес <https://angle.example.com/x> и просто https://bare.example.com/path, в конце фразы.',
      'Код `https://inline.example.com` не проверяется.',
      '```bash',
      'curl https://block.example.com',
      '```',
      'Внутренняя [ссылка](/guides/linkedin) тоже нет.',
    ].join('\n')
    expect(markdownLinks(markdown).sort()).toEqual([
      'https://angle.example.com/x',
      'https://bare.example.com/path',
      'https://img.example.com/s.png',
      'https://support.example.com/a?b=1',
    ])
  })
})
