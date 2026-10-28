import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { HighlighterCore } from 'shiki/core'

const highlighter = {
  getLoadedLanguages: () => ['typescript'],
  codeToHtml: (code: string) => `<pre class="shiki"><code>подсвечено: ${code}</code></pre>`,
}
vi.mock('@/lib/markdown-highlighter', () => ({
  markdownLanguage: (language: string) => (language === 'ts' ? 'typescript' : language),
  getMarkdownHighlighter: vi.fn(async () => highlighter),
}))

const { LessonMarkdown } = await import('@/components/lesson/LessonMarkdown')
const { getMarkdownHighlighter } = await import('@/lib/markdown-highlighter')
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

const LONG_LESSON = [
  '## Перед началом',
  'Текст.',
  '## Теория',
  '### HTTP-контракт',
  'Ответ — [к деньгам](#деньги--в-ответе), [по id](#section-2-1), [мимо](#nothing).',
  '### Деньги — в ответе',
  '> ## Заголовок в цитате',
  '## Разобранные примеры',
].join('\n\n')

describe('оглавление и якоря урока', () => {
  it('даёт h2 и h3 якоря формата гайдов и строит оглавление со вложенными h3', () => {
    const { container } = render(<LessonMarkdown markdown={LONG_LESSON} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Теория' })).toHaveAttribute('id', 'section-2')
    expect(screen.getByRole('heading', { level: 3, name: 'HTTP-контракт' })).toHaveAttribute('id', 'section-2-1')
    expect(screen.getByRole('heading', { level: 3, name: 'Деньги — в ответе' })).toHaveAttribute('id', 'section-2-2')
    expect(screen.getByRole('heading', { level: 2, name: 'Заголовок в цитате' })).not.toHaveAttribute('id')

    const nav = screen.getByRole('navigation', { name: 'Содержание урока' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Перед началом', '#section-1'],
      ['Теория', '#section-2'],
      ['HTTP-контракт', '#section-2-1'],
      ['Деньги — в ответе', '#section-2-2'],
      ['Разобранные примеры', '#section-3'],
    ])
    // Подразделы вложены в пункт своего раздела.
    expect(within(nav).getByRole('link', { name: 'HTTP-контракт' }).closest('li')?.parentElement?.closest('li')).toContainElement(within(nav).getByRole('link', { name: 'Теория' }))
    for (const link of links) expect(container.querySelector(link.getAttribute('href') ?? '')).not.toBeNull()
  })

  it('ссылки #… внутри текста ведут к заголовкам и открываются в той же вкладке', () => {
    render(<LessonMarkdown markdown={LONG_LESSON} />)

    expect(screen.getByRole('link', { name: 'к деньгам' })).toHaveAttribute('href', '#section-2-2')
    expect(screen.getByRole('link', { name: 'по id' })).toHaveAttribute('href', '#section-2-1')
    expect(screen.getByRole('link', { name: 'мимо' })).toHaveAttribute('href', '#nothing')
    expect(screen.getByRole('link', { name: 'к деньгам' })).not.toHaveAttribute('target')
  })

  it('на телефоне оглавление свёрнуто и раскрывается кнопкой', () => {
    render(<LessonMarkdown markdown={LONG_LESSON} />)

    const toggle = screen.getByRole('button', { name: /Содержание/ })
    const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(list).toHaveClass('hidden', 'sm:block')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(list).toHaveClass('block')
    expect(list).not.toHaveClass('hidden')
  })

  it('короткому уроку оглавление не нужно', () => {
    render(<LessonMarkdown markdown={'## Практикум\n\n### Упражнения'} />)

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Упражнения' })).toHaveAttribute('id', 'section-1-1')
  })

  it('второй блок Markdown в уроке не повторяет id первого', () => {
    const { container } = render(<ContentBlockRenderer blocks={[
      { id: 'a', blockType: 'markdown', markdown: '## Теория' },
      { id: 'b', blockType: 'markdown', markdown: '## Практикум' },
    ]} />)

    expect(screen.getByRole('heading', { name: 'Теория' })).toHaveAttribute('id', 'section-1')
    expect(screen.getByRole('heading', { name: 'Практикум' })).toHaveAttribute('id', 'part2-section-1')
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('копирование кода', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  function mockClipboard(writeText: (text: string) => Promise<void>) {
    const spy = vi.fn(writeText)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: spy }, configurable: true })
    return spy
  }

  it('копирует подсвеченный и простой блок и на 2 секунды показывает «Скопировано»', async () => {
    const writeText = mockClipboard(async () => {})
    const { container } = render(<LessonMarkdown markdown={'```ts\nconst x = 1\n```\n\n```text\nвывод\n```'} />)
    await waitFor(() => expect(container.querySelector('.shiki')).not.toBeNull())

    const [highlighted, plain] = screen.getAllByRole('button', { name: 'Копировать код' })
    expect(highlighted).toHaveTextContent('Копировать')
    expect(screen.getByText('ts')).toBeInTheDocument()

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(highlighted)
    await act(async () => {})
    expect(writeText).toHaveBeenLastCalledWith('const x = 1')
    expect(highlighted).toHaveTextContent('Скопировано')
    expect(screen.getByText('Код скопирован')).toHaveAttribute('role', 'status')

    act(() => { vi.advanceTimersByTime(1999) })
    expect(highlighted).toHaveTextContent('Скопировано')
    act(() => { vi.advanceTimersByTime(1) })
    expect(highlighted).toHaveTextContent('Копировать')

    fireEvent.click(plain)
    await act(async () => {})
    expect(writeText).toHaveBeenLastCalledWith('вывод')
    expect(plain).toHaveTextContent('Скопировано')
  })

  it('загрузка подсветки не сбрасывает «Скопировано» и открытую схему', async () => {
    let loaded: (value: HighlighterCore) => void = () => {}
    vi.mocked(getMarkdownHighlighter).mockImplementationOnce(() => new Promise((resolve) => { loaded = resolve }))
    mockClipboard(async () => {})
    const { container } = render(<LessonMarkdown markdown={`\`\`\`ts\nconst x = 1\n\`\`\`\n\n![Схема 4](${svg})`} />)

    fireEvent.click(screen.getByRole('button', { name: 'Копировать код' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Схема 4 - открыть во весь экран' }))
    await act(async () => { loaded(highlighter as unknown as HighlighterCore) })

    expect(container.querySelector('.shiki')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Копировать код' })).toHaveTextContent('Скопировано')
    expect(screen.getByRole('dialog', { name: 'Схема 4' })).toHaveAttribute('open')
  })

  it('отказ буфера обмена показывает сообщение, а не молчит', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockClipboard(async () => { throw new DOMException('Нет разрешения', 'NotAllowedError') })
    render(<LessonMarkdown markdown={'```text\nnpm ci\n```'} />)

    fireEvent.click(screen.getByRole('button', { name: 'Копировать код' }))

    expect(await screen.findByText('Не удалось скопировать - выделите код вручную')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Копировать код' })).toHaveTextContent('Копировать')
    expect(warn).toHaveBeenCalledWith('Не удалось скопировать код урока', expect.any(DOMException))
  })

  it('без Clipboard API (страница не по HTTPS) тоже просит выделить код вручную', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<LessonMarkdown markdown={'```text\nnpm ci\n```'} />)

    fireEvent.click(screen.getByRole('button', { name: 'Копировать код' }))

    expect(await screen.findByText('Не удалось скопировать - выделите код вручную')).toBeInTheDocument()
  })
})

describe('схема во весь экран', () => {
  const markdown = `Текст.\n\n![Схема 3](${svg})\n`

  it('открывается по нажатию и закрывается по Esc, кнопке и фону, возвращая фокус', () => {
    render(<LessonMarkdown markdown={markdown} />)
    const trigger = screen.getByRole('button', { name: 'Схема 3 - открыть во весь экран' })
    expect(within(trigger).getByRole('img', { name: 'Схема 3' })).toHaveAttribute('src', svg)

    fireEvent.click(trigger)
    let dialog = screen.getByRole('dialog', { name: 'Схема 3' })
    expect(dialog).toHaveAttribute('open')
    expect(within(dialog).getByRole('img', { name: 'Схема 3' })).toHaveAttribute('src', svg)
    expect(within(dialog).getByRole('region', { name: 'Схема в натуральную величину' })).toHaveAttribute('tabindex', '0')
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть схему' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(trigger)
    dialog = screen.getByRole('dialog', { name: 'Схема 3' })
    fireEvent.click(within(dialog).getByRole('img', { name: 'Схема 3' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('region', { name: 'Схема в натуральную величину' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('стрелки в просмотре прокручивают схему, а не листают уроки', () => {
    const pageKeys = vi.fn()
    window.addEventListener('keydown', pageKeys)
    try {
      render(<LessonMarkdown markdown={markdown} />)
      fireEvent.click(screen.getByRole('button', { name: 'Схема 3 - открыть во весь экран' }))
      fireEvent.keyDown(screen.getByRole('region', { name: 'Схема в натуральную величину' }), { key: 'ArrowRight' })
      expect(pageKeys).not.toHaveBeenCalled()
      fireEvent.keyDown(document.body, { key: 'ArrowRight' })
      expect(pageKeys).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('keydown', pageKeys)
    }
  })

  it('подсказывает прокрутку, только если схема шире экрана', () => {
    render(<LessonMarkdown markdown={markdown} />)
    fireEvent.click(screen.getByRole('button', { name: 'Схема 3 - открыть во весь экран' }))
    const dialog = screen.getByRole('dialog', { name: 'Схема 3' })
    const region = within(dialog).getByRole('region', { name: 'Схема в натуральную величину' })
    const image = within(dialog).getByRole('img', { name: 'Схема 3' })
    Object.defineProperty(region, 'clientWidth', { value: 390, configurable: true })

    Object.defineProperty(image, 'naturalWidth', { value: 300, configurable: true })
    fireEvent.load(image)
    expect(within(dialog).queryByText('Схема шире экрана - прокрутите вбок')).not.toBeInTheDocument()

    Object.defineProperty(image, 'naturalWidth', { value: 1487, configurable: true })
    fireEvent.load(image)
    expect(within(dialog).getByText('Схема шире экрана - прокрутите вбок')).toBeInTheDocument()
  })

  it('картинка с отброшенным адресом не превращается в кнопку', () => {
    render(<LessonMarkdown markdown={'![html](data:text/html;base64,PHNjcmlwdD4=)'} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'html' })).toBeInTheDocument()
  })
})
