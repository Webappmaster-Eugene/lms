import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { HighlighterCore } from 'shiki/core'

const { getMarkdownHighlighter, logError } = vi.hoisted(() => ({ getMarkdownHighlighter: vi.fn(), logError: vi.fn() }))
vi.mock('@/lib/markdown-highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/markdown-highlighter')>()),
  getMarkdownHighlighter,
}))
vi.mock('@/lib/telemetry', () => ({ logger: { error: logError } }))

const { GuideMarkdownContent } = await import('@/components/guides/GuideMarkdownContent')
const { GuideMarkdown } = await import('@/components/guides/GuideMarkdown')
const { GuideMarkdownPreview } = await import('@/components/guides/GuideMarkdownPreview')

/** Подсветка без shiki: в разметке видно, какой язык и тему попросили. */
function fakeHighlighter(languages: string[]) {
  const codeToHtml = vi.fn((code: string, options: { lang: string }) => `<pre class="shiki" data-lang="${options.lang}"><code>${code.replace(/</g, '&lt;')}</code></pre>`)
  return { highlighter: { getLoadedLanguages: () => languages, codeToHtml } as unknown as HighlighterCore, codeToHtml }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  getMarkdownHighlighter.mockReset()
  logError.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('текст гайда', () => {
  it('врезка показывает заголовок своего типа и текст', () => {
    render(<GuideMarkdownContent markdown={'> [!WARNING]\n> Не коммитьте файл .env'} />)
    const callout = screen.getByRole('complementary')
    expect(callout).toHaveAttribute('data-callout', 'warning')
    expect(within(callout).getByText('Внимание')).toBeInTheDocument()
    expect(within(callout).getByText('Не коммитьте файл .env')).toBeInTheDocument()
  })

  it('свой заголовок врезки из строки маркера заменяет стандартный', () => {
    render(<GuideMarkdownContent markdown={'> [!tip] Сэкономит час\n> Держите ключи в менеджере паролей'} />)
    const callout = screen.getByRole('complementary')
    expect(within(callout).getByText('Сэкономит час')).toBeInTheDocument()
    expect(within(callout).queryByText('Совет')).not.toBeInTheDocument()
    expect(within(callout).getByText('Держите ключи в менеджере паролей')).toBeInTheDocument()
  })

  it('обычная цитата остаётся цитатой, а не врезкой', () => {
    const { container } = render(<GuideMarkdownContent markdown={'> Просто цитата'} />)
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(container.querySelector('blockquote')).toHaveTextContent('Просто цитата')
  })

  it('разделы ## получают якоря оглавления по порядку; подразделы и заголовки в цитатах — нет', () => {
    render(<GuideMarkdownContent markdown={'## Установка\n\n### Подробно\n\n> ## Внутри цитаты\n\n## Проверка'} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Установка' })).toHaveAttribute('id', 'section-1')
    expect(screen.getByRole('heading', { level: 2, name: 'Проверка' })).toHaveAttribute('id', 'section-2')
    expect(screen.getByRole('heading', { level: 3, name: 'Подробно' })).not.toHaveAttribute('id')
    expect(screen.getByRole('heading', { level: 2, name: 'Внутри цитаты' })).not.toHaveAttribute('id')
  })

  it('внешние ссылки открываются в новой вкладке без доступа к странице, внутренние — в этой же', () => {
    render(<GuideMarkdownContent markdown={'[Docker](https://docs.docker.com/), [гайд](/guides/vpn), [раздел](#section-1), [почта](mailto:help@example.test)'} />)
    expect(screen.getByRole('link', { name: 'Docker' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Docker' })).toHaveAttribute('rel', 'noopener noreferrer')
    for (const name of ['гайд', 'раздел', 'почта']) expect(screen.getByRole('link', { name })).not.toHaveAttribute('target')
  })

  it('сырой HTML и опасные адреса не исполняются', () => {
    const { container } = render(<GuideMarkdownContent markdown={'<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n[ссылка](javascript:alert(3))'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('[onerror]')).toBeNull()
    expect(screen.getByText('ссылка').closest('a')?.getAttribute('href') ?? '').not.toMatch(/javascript/i)
  })

  it('таблица лежит в своей рамке, чтобы широкая прокручивалась, а не ломала страницу', () => {
    render(<GuideMarkdownContent markdown={'| Тариф | Цена |\n| --- | --- |\n| Базовый | 0 ₽ |'} />)
    expect(screen.getByRole('table').parentElement).toHaveClass('guide-prose__table')
    expect(screen.getByRole('cell', { name: 'Базовый' })).toBeInTheDocument()
  })

  it('картинка ленивая, открывается целиком в новой вкладке и подписана своим title', () => {
    render(<GuideMarkdownContent markdown={'![Экран входа](/api/media/file/login.png "Шаг 1: вход")'} />)
    const image = screen.getByRole('img', { name: 'Экран входа' })
    expect(image).toHaveAttribute('src', '/api/media/file/login.png')
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image.closest('a')).toHaveAttribute('href', '/api/media/file/login.png')
    expect(image.closest('a')).toHaveAttribute('target', '_blank')
    expect(screen.getByText('Шаг 1: вход')).toBeInTheDocument()
  })

  it('картинка без title не получает пустую подпись, без адреса — не выводится вовсе', () => {
    const { container } = render(<GuideMarkdownContent markdown={'![Схема](/api/media/file/a.png)\n\n![Пусто]()'} />)
    const figure = screen.getByRole('img', { name: 'Схема' }).closest('.guide-prose__figure') as HTMLElement
    expect(figure.querySelectorAll(':scope > span')).toHaveLength(0)
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  it('код без подсветки читается как есть и копируется без последнего перевода строки', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<GuideMarkdownContent markdown={'```bash\nnpm install\nnpm test\n```'} />)
    expect(screen.getByText(/npm install/).closest('pre')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Копировать' }))
    expect(writeText).toHaveBeenCalledWith('npm install\nnpm test')
  })

  it('пустой блок кода кнопку копирования не показывает', () => {
    const { container } = render(<GuideMarkdownContent markdown={'```\n```'} />)
    expect(container.querySelector('pre')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Копировать' })).not.toBeInTheDocument()
  })

  it('загруженный язык подсвечивается в светлой и тёмной теме, псевдоним ts понимается', () => {
    const { highlighter, codeToHtml } = fakeHighlighter(['typescript'])
    const { container } = render(<GuideMarkdownContent markdown={'```ts\nconst a: number = 1\n```'} highlighter={highlighter} />)
    expect(codeToHtml).toHaveBeenCalledWith('const a: number = 1', { lang: 'typescript', themes: { light: 'github-light', dark: 'github-dark' } })
    expect(container.querySelector('.shiki')).toHaveTextContent('const a: number = 1')
    expect(screen.getByRole('button', { name: 'Копировать' })).toBeInTheDocument()
  })

  it('не загруженный язык, код без языка и слишком длинный код остаются без подсветки', () => {
    const { highlighter, codeToHtml } = fakeHighlighter(['typescript'])
    const long = `const x = '${'a'.repeat(20_001)}'`
    const { container } = render(<GuideMarkdownContent markdown={`\`\`\`go\nfmt.Println()\n\`\`\`\n\n\`\`\`\nбез языка\n\`\`\`\n\n    отступ\n\n\`\`\`ts\n${long}\n\`\`\``} highlighter={highlighter} />)
    expect(codeToHtml).not.toHaveBeenCalled()
    expect(container.querySelector('.shiki')).toBeNull()
    expect(container.querySelectorAll('pre')).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: 'Копировать' })).toHaveLength(4)
  })
})

describe('гайд на странице ученика', () => {
  it('без блоков кода не загружает подсветку', async () => {
    render(await GuideMarkdown({ markdown: '## Шаг\n\nТекст' }))
    expect(getMarkdownHighlighter).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2, name: 'Шаг' })).toBeInTheDocument()
  })

  it('загружает только языки из гайда и отдаёт код уже подсвеченным', async () => {
    getMarkdownHighlighter.mockResolvedValue(fakeHighlighter(['bash']).highlighter)
    const { container } = render(await GuideMarkdown({ markdown: '```bash\nls\n```\n\n```Bash\npwd\n```' }))
    expect(getMarkdownHighlighter).toHaveBeenCalledWith(['bash'])
    expect(container.querySelectorAll('.shiki')).toHaveLength(2)
  })

  it('если подсветка не загрузилась, гайд всё равно открывается, а сбой уходит в лог', async () => {
    const error = new Error('chunk load failed')
    getMarkdownHighlighter.mockRejectedValue(error)
    const { container } = render(await GuideMarkdown({ markdown: '```bash\nls -la\n```' }))
    expect(logError).toHaveBeenCalledWith('Не удалось загрузить подсветку кода гайда', error)
    expect(container.querySelector('.shiki')).toBeNull()
    expect(screen.getByText('ls -la')).toBeInTheDocument()
  })
})

describe('предпросмотр гайда в CMS', () => {
  it('сразу показывает код без подсветки, а после загрузки — подсвеченным', async () => {
    const load = deferred<HighlighterCore>()
    getMarkdownHighlighter.mockReturnValue(load.promise)
    const { container } = render(<GuideMarkdownPreview markdown={'```ts\nlet a = 1\n```\n\n```bash\nls\n```'} />)
    expect(getMarkdownHighlighter).toHaveBeenCalledWith(['bash', 'ts'])
    expect(screen.getByText('let a = 1')).toBeInTheDocument()
    expect(container.querySelector('.shiki')).toBeNull()

    load.resolve(fakeHighlighter(['typescript', 'bash']).highlighter)
    await waitFor(() => expect(container.querySelectorAll('.shiki')).toHaveLength(2))
  })

  it('без кода подсветку не грузит', () => {
    render(<GuideMarkdownPreview markdown="Просто текст" />)
    expect(getMarkdownHighlighter).not.toHaveBeenCalled()
  })

  it('сбой загрузки подсветки не ломает предпросмотр', async () => {
    const error = new Error('offline')
    getMarkdownHighlighter.mockRejectedValue(error)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<GuideMarkdownPreview markdown={'```bash\nls\n```'} />)
    await waitFor(() => expect(spy).toHaveBeenCalledWith('Не удалось загрузить подсветку кода предпросмотра', error))
    expect(container.querySelector('.shiki')).toBeNull()
    expect(screen.getByText('ls')).toBeInTheDocument()
  })

  it('поздний ответ для старого текста не подменяет подсветку нового', async () => {
    const first = deferred<HighlighterCore>()
    const second = deferred<HighlighterCore>()
    getMarkdownHighlighter.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { container, rerender } = render(<GuideMarkdownPreview markdown={'```bash\nls\n```'} />)
    rerender(<GuideMarkdownPreview markdown={'```go\nfmt.Println()\n```'} />)

    second.resolve(fakeHighlighter(['go']).highlighter)
    await waitFor(() => expect(container.querySelector('.shiki')).toHaveAttribute('data-lang', 'go'))
    first.resolve(fakeHighlighter(['bash']).highlighter)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(container.querySelector('.shiki')).toHaveAttribute('data-lang', 'go')
  })
})
