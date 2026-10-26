import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Подсветка — граница с shiki: в jsdom проверяется, когда и какой код ей отдаётся, а не сами цвета.
const highlighter = vi.hoisted(() => ({
  getLoadedLanguages: () => ['typescript'],
  codeToHtml: (code: string, options: { lang: string }) => `<pre class="shiki" data-lang="${options.lang}"><code>${code}</code></pre>`,
}))
vi.mock('@/lib/markdown-highlighter', () => ({
  markdownLanguage: (language: string) => (language === 'ts' ? 'typescript' : language),
  getMarkdownHighlighter: vi.fn(async () => highlighter),
}))

const { ContentBlockRenderer } = await import('@/components/lesson/ContentBlockRenderer')
const { MarkdownRenderer } = await import('@/components/lesson/MarkdownRenderer')
const { getMarkdownHighlighter } = await import('@/lib/markdown-highlighter')

/**
 * Текстовые блоки урока: документ Lexical из CMS и Markdown-строка. Узлы, которые
 * редактор Payload умеет создавать, не должны пропадать из урока молча.
 */

type LexicalNode = Record<string, unknown>
const text = (value: string, format = 0) => ({ type: 'text', text: value, format })
const lexical = (...children: LexicalNode[]) => [{ blockType: 'text', content: { root: { children } } }]
const renderText = (...children: LexicalNode[]) => render(<ContentBlockRenderer blocks={lexical(...children)} />)

afterEach(() => vi.clearAllMocks())

describe('текст урока из редактора CMS', () => {
  it.each(['h1', 'h3', 'h4', 'h5', 'h6'])('заголовок %s выводится заголовком своего уровня', (tag) => {
    renderText({ type: 'heading', tag, children: [text('Раздел')] })

    expect(screen.getByRole('heading', { level: Number(tag.slice(1)), name: 'Раздел' })).toBeInTheDocument()
  })

  it('заголовок без уровня или с неизвестным уровнем становится h2', () => {
    renderText({ type: 'heading', children: [text('Без уровня')] }, { type: 'heading', tag: 'h7', children: [text('Странный')] })

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Без уровня', 'Странный'])
  })

  it('нумерованный и маркированный списки сохраняют свой вид и пункты', () => {
    renderText(
      { type: 'list', listType: 'number', children: [{ type: 'listitem', children: [text('Установить Node')] }, { type: 'listitem', children: [text('Запустить npm ci')] }] },
      { type: 'list', listType: 'bullet', children: [{ type: 'listitem', children: [text('Linux')] }] },
    )

    const [ordered, bulleted] = screen.getAllByRole('list')
    expect(ordered.tagName).toBe('OL')
    expect(ordered).toHaveTextContent('Установить NodeЗапустить npm ci')
    expect(bulleted.tagName).toBe('UL')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('цитата, разделитель и перенос строки выводятся своими элементами', () => {
    const { container } = renderText(
      { type: 'quote', children: [text('Сначала работает, потом быстро')] },
      { type: 'horizontalrule' },
      { type: 'paragraph', children: [text('Строка 1'), { type: 'linebreak' }, text('Строка 2')] },
    )

    expect(container.querySelector('blockquote')).toHaveTextContent('Сначала работает, потом быстро')
    expect(container.querySelector('hr')).toBeInTheDocument()
    expect(container.querySelector('p br')).toBeInTheDocument()
  })

  it('блок кода выводится листингом с языком, переносами и табуляцией', () => {
    const { container } = renderText({ type: 'code', language: 'python', children: [text('def main():'), { type: 'linebreak' }, { type: 'tab', text: '\t' }, text('pass')] })

    const code = container.querySelector('pre code')
    expect(code).toHaveClass('language-python')
    expect(code?.textContent).toBe('def main():\n\tpass')
  })

  it('блок кода без языка не получает пустой класс языка', () => {
    const { container } = renderText({ type: 'code', children: [text('ls -la')] })

    expect(container.querySelector('pre code')?.getAttribute('class')).toBe('')
  })

  it('форматирование текста складывается: жирный курсив с зачёркиванием и подчёркиванием', () => {
    const { container } = renderText({ type: 'paragraph', children: [text('важно', 1 | 2 | 4 | 8)] })

    expect(container.querySelector('u > s > em > strong')).toHaveTextContent('важно')
  })

  it('неизвестный узел не теряет вложенный текст', () => {
    renderText({ type: 'paragraph', children: [{ type: 'autolink', children: [text('https://nodejs.org')] }] })

    expect(screen.getByText('https://nodejs.org')).toBeInTheDocument()
  })

  it('ссылка из старого формата без полей Payload открывается в новой вкладке', () => {
    renderText({ type: 'paragraph', children: [{ type: 'link', url: 'mailto:mentor@example.com', children: [text('Написать ментору')] }] })

    const link = screen.getByRole('link', { name: 'Написать ментору' })
    expect(link).toHaveAttribute('href', 'mailto:mentor@example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // Редактор Payload хранит табуляцию отдельным узлом 'tab', а не символом внутри текста.
  it('табуляция в обычном абзаце не склеивает слова', () => {
    const { container } = renderText({ type: 'paragraph', children: [text('Имя'), { type: 'tab', text: '\t' }, text('Значение')] })

    expect(container.querySelector('p')?.textContent).toBe('Имя\tЗначение')
  })

  it('текст строкой выводится как Markdown', () => {
    render(<ContentBlockRenderer blocks={[{ blockType: 'text', content: '## План\n\n- **Node.js** и npm' }]} />)

    expect(screen.getByRole('heading', { level: 2, name: 'План' })).toBeInTheDocument()
    expect(screen.getByText('Node.js').tagName).toBe('STRONG')
  })

  it.each([
    ['массив', ['абзац']],
    ['число', 42],
    ['пусто', null],
  ])('содержимое неподходящего вида (%s) пропускается, а не роняет урок', (_case, content) => {
    const { container } = render(<ContentBlockRenderer blocks={[{ blockType: 'text', id: 'broken', content }, { blockType: 'text', content: '- дальше' }]} />)

    expect(container.querySelector('#broken')).toBeNull()
    expect(screen.getByText('дальше')).toBeInTheDocument()
  })
})

describe('Markdown урока и тренажёра', () => {
  it('код в строке оформлен плашкой и не уходит в подсветку', () => {
    render(<MarkdownRenderer content="Запустите `pnpm test` в корне" />)

    expect(screen.getByText('pnpm test').tagName).toBe('CODE')
    expect(screen.getByText('pnpm test')).toHaveClass('font-mono')
    expect(getMarkdownHighlighter).not.toHaveBeenCalled()
  })

  it('блок кода с известным языком подсвечивается после загрузки нужной грамматики', async () => {
    const { container } = render(<MarkdownRenderer content={'```ts\nconst x: number = 1\n```\n\n```ts\nlet y = 2\n```'} />)

    expect(container.querySelector('code.language-ts')).toHaveTextContent('const x: number = 1')
    await waitFor(() => expect(container.querySelectorAll('.shiki')).toHaveLength(2))
    expect(container.querySelector('.shiki')).toHaveAttribute('data-lang', 'typescript')
    expect(container.querySelector('.shiki')?.textContent).toBe('const x: number = 1')
    expect(getMarkdownHighlighter).toHaveBeenCalledOnce()
    expect(getMarkdownHighlighter).toHaveBeenCalledWith(['ts'])
  })

  it('язык без грамматики остаётся читаемым кодом с классом языка', async () => {
    const { container } = render(<MarkdownRenderer content={'```cobol\nDISPLAY "HI".\n```'} />)

    await waitFor(() => expect(getMarkdownHighlighter).toHaveBeenCalledWith(['cobol']))
    expect(container.querySelector('.shiki')).toBeNull()
    expect(container.querySelector('code.language-cobol')).toHaveTextContent('DISPLAY "HI".')
  })

  it('слишком длинный листинг не подсвечивается, чтобы не подвесить вкладку', async () => {
    const long = 'a'.repeat(20_001)
    const { container } = render(<MarkdownRenderer content={`\`\`\`ts\n${long}\n\`\`\``} />)

    await waitFor(() => expect(getMarkdownHighlighter).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.querySelector('.shiki')).toBeNull()
    expect(container.querySelector('code.language-ts')?.textContent?.length).toBeGreaterThan(20_000)
  })

  it('сбой загрузки подсветки оставляет код читаемым', async () => {
    vi.mocked(getMarkdownHighlighter).mockRejectedValueOnce(new Error('chunk failed'))
    const { container } = render(<MarkdownRenderer content={'```ts\nconst x = 1\n```'} />)

    await waitFor(() => expect(getMarkdownHighlighter).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.querySelector('.shiki')).toBeNull()
    expect(container.querySelector('code.language-ts')).toHaveTextContent('const x = 1')
  })

  it('таблицы GFM и разрешённый HTML выводятся разметкой', () => {
    const { container } = render(<MarkdownRenderer content={'| Клавиша | Действие |\n|---|---|\n| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Отправить |'} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(container.querySelectorAll('kbd')).toHaveLength(2)
  })
})
