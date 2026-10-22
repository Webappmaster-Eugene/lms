import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const highlighter = {
  getLoadedLanguages: () => ['typescript'],
  codeToHtml: (code: string) => `<pre class="shiki"><code>подсвечено: ${code}</code></pre>`,
}
vi.mock('@/lib/markdown-highlighter', () => ({
  markdownLanguage: (language: string) => (language === 'ts' ? 'typescript' : language),
  getMarkdownHighlighter: vi.fn(async () => highlighter),
}))

const { LessonMarkdown } = await import('@/components/lesson/LessonMarkdown')
const { ContentBlockRenderer } = await import('@/components/lesson/ContentBlockRenderer')

const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`

/**
 * Текст методички приходит из Git как есть. Сырой HTML в нём не должен стать
 * разметкой страницы: блок рендерится без rehype-raw, адреса проходят фильтр.
 */
describe('текст урока из репозитория', () => {
  it('показывает таблицу GFM в прокручиваемой рамке и схему из data:-адреса', () => {
    const { container } = render(<LessonMarkdown markdown={`## Теория\n\n| Код | Смысл |\n|---|---|\n| 409 | конфликт |\n\n![Схема 1](${svg})\n`} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Теория' })).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(table.parentElement).toHaveClass('overflow-x-auto')
    expect(screen.getByRole('cell', { name: 'конфликт' })).toBeInTheDocument()
    const image = screen.getByRole('img', { name: 'Схема 1' })
    expect(image).toHaveAttribute('src', svg)
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  it('не исполняет сырой HTML и не пропускает опасные адреса', () => {
    const { container } = render(<LessonMarkdown markdown={[
      '<img src="x" onerror="alert(1)">',
      '<script>alert(2)</script>',
      '[ссылка](javascript:alert(3))',
      '![html](data:text/html;base64,PHNjcmlwdD4=)',
      `[не картинка](${svg})`,
    ].join('\n\n')} />)

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(screen.getByText('ссылка').closest('a')?.getAttribute('href') ?? '').not.toMatch(/javascript/i)
    expect(screen.getByRole('img', { name: 'html' })).not.toHaveAttribute('src', expect.stringMatching(/^data:/))
    expect(screen.getByText('не картинка').closest('a')?.getAttribute('href') ?? '').not.toMatch(/^data:/)
  })

  it('внешние ссылки открываются в новой вкладке без доступа к странице', () => {
    render(<LessonMarkdown markdown="[Документация](https://nodejs.org/api/) и [раздел](#teoriya)" />)

    expect(screen.getByRole('link', { name: 'Документация' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Документация' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'раздел' })).not.toHaveAttribute('target')
  })

  it('код читается сразу, а после загрузки подсветки показывается подсвеченным', async () => {
    const { container } = render(<LessonMarkdown markdown={'```ts\nconst x = 1\n```\n\n```text\nвывод\n```'} />)

    expect(screen.getByText('вывод')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('.shiki')).not.toBeNull())
    expect(container.querySelector('.shiki')).toHaveTextContent('подсвечено: const x = 1')
    expect(screen.getByText('вывод').closest('pre')).not.toHaveClass('shiki')
  })

  it('урок показывает блок markdown, а блок без текста пропускает', () => {
    render(<ContentBlockRenderer blocks={[
      { id: 'a', blockType: 'markdown', markdown: '## Практикум' },
      { id: 'b', blockType: 'markdown', markdown: null },
    ]} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Практикум' })).toBeInTheDocument()
  })
})
