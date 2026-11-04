import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const { mermaidRender, mermaidParse } = vi.hoisted(() => ({
  mermaidRender: vi.fn(async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" style="max-width: 320.5px;" viewBox="-8 -8 320.5 140"><text>Клиент</text></svg>' })),
  mermaidParse: vi.fn(async () => ({ diagramType: 'flowchart-v2' })),
}))
// Сборка mermaid приходит отдельным скриптом и кладёт себя в window: подменяем её там.
window.mermaid = { initialize: vi.fn(), parse: mermaidParse, render: mermaidRender } as unknown as NonNullable<Window['mermaid']>
vi.mock('@/lib/markdown-highlighter', () => ({
  markdownLanguage: (language: string) => language,
  getMarkdownHighlighter: vi.fn(async () => ({ getLoadedLanguages: () => [], codeToHtml: () => '' })),
}))
vi.mock('@/components/lesson/VideoPlayer', async () => {
  const { StudyNotesLink } = await import('@/components/lesson/StudyNotes')
  return { VideoPlayer: ({ title }: { title: string }) => <div data-testid="video">{title}<StudyNotesLink /></div> }
})

const { ContentBlockRenderer } = await import('@/components/lesson/ContentBlockRenderer')
const { StudyNotesAnchor } = await import('@/components/lesson/StudyNotes')
const { getMarkdownHighlighter } = await import('@/lib/markdown-highlighter')

const video = { id: 'v1', blockType: 'video', title: 'Видео урока', videoUrl: '/api/yandex-disk/stream?lesson=1&block=v1', displayMode: 'embed' }
const notes = (markdown: string) => ({ id: 'n1', blockType: 'lessonNotes', markdown, source: 'topic' })

afterEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

const expand = () => fireEvent.click(screen.getByRole('button', { name: 'Развернуть конспект' }))

/**
 * Конспект заменяет видео тем, кто не может его посмотреть: он должен быть найден
 * из плеера и читаться без видео - таблицы, код и схемы на месте.
 */
describe('конспект урока', () => {
  it('рисует таблицу и код, а плеер ведёт к конспекту', () => {
    render(<ContentBlockRenderer blocks={[video, notes('## Коротко\n\nТекст.\n\n| Метод | Смысл |\n|---|---|\n| GET | чтение |\n\n```ts\nconst a = 1\n```\n')]} />)

    expand()
    const section = screen.getByRole('region', { name: 'Конспект урока' })
    expect(section).toHaveAttribute('id', 'konspekt')
    expect(within(section).getByRole('heading', { level: 2, name: 'Коротко' })).toHaveAttribute('id', 'konspekt-1')
    expect(within(section).getByRole('cell', { name: 'чтение' })).toBeInTheDocument()
    expect(within(section).getByText('const a = 1')).toBeInTheDocument()
    expect(within(screen.getByTestId('video')).getByRole('link', { name: 'Читать конспект' })).toHaveAttribute('href', '#konspekt')
  })

  it('второй конспект в уроке не повторяет id первого: ссылка ведёт к первому', () => {
    const { container } = render(<ContentBlockRenderer blocks={[video, notes('## Коротко\n\nПервый.'), { ...notes('## Коротко\n\nВторой.'), id: 'n2' }]} />)

    expect(screen.getAllByRole('region', { name: 'Конспект урока' }).map((region) => region.id)).toEqual(['konspekt', 'konspekt2'])
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('без конспекта плеер не предлагает его прочитать, пустой конспект не показывается', () => {
    render(<ContentBlockRenderer blocks={[video, notes('   ')]} />)

    expect(screen.queryByRole('link', { name: 'Читать конспект' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Конспект урока' })).toBeNull()
  })

  it('схема mermaid становится картинкой со своим названием, без загрузки подсветки кода', async () => {
    const code = 'flowchart LR\n  accTitle: Запрос к серверу\n  A[Клиент] --> B[Сервер]'
    render(<ContentBlockRenderer blocks={[notes(`## Схема\n\n\`\`\`mermaid\n${code}\n\`\`\`\n`)]} />)
    expand()

    const image = await screen.findByRole('img', { name: 'Запрос к серверу' })
    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/)
    const svg = Buffer.from(String(image.getAttribute('src')).split(',')[1], 'base64').toString('utf8')
    expect(svg).toContain('Клиент')
    // Внутри <img> ширина 100% не определяется: схема получает натуральный размер из viewBox.
    expect(svg).toMatch(/width="321"/)
    expect(svg).toMatch(/height="140"/)
    expect(svg).not.toContain('max-width')
    expect(mermaidRender).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-/), code)
    expect(getMarkdownHighlighter).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Запрос к серверу - открыть во весь экран' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('сломанная схема показывается текстом, а не пропадает', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mermaidParse.mockRejectedValueOnce(new Error('Parse error on line 2'))
    render(<ContentBlockRenderer blocks={[notes('```mermaid\nflowchart LR\n  A -->\n```\n')]} />)
    expand()

    await waitFor(() => expect(screen.getByText('Схему не удалось нарисовать, ниже её текст.')).toBeInTheDocument())
    expect(screen.getByText(/A -->/)).toBeInTheDocument()
    expect(mermaidRender).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  describe('свёрнут, пока ученик его не откроет', () => {
    const text = '## Коротко\n\nТекст.\n\n## Подробно\n\nЕщё текст.'

    it('по умолчанию текст скрыт, а заголовок и объём видны', () => {
      render(<ContentBlockRenderer blocks={[notes(text)]} />)

      expect(screen.getByRole('heading', { level: 2, name: 'Конспект урока' })).toBeInTheDocument()
      expect(screen.getByText('2 раздела, ~1 мин чтения')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Развернуть конспект' })).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('heading', { name: 'Коротко' })).toBeNull()
      // Текст остаётся на странице: поиск браузера находит его и раскрывает сам.
      expect(screen.getByText('Текст.').closest('[hidden]')).toHaveAttribute('hidden', 'until-found')
    })

    it('кнопка раскрывает и снова сворачивает', () => {
      render(<ContentBlockRenderer blocks={[notes(text)]} />)

      expand()
      expect(screen.getByRole('heading', { name: 'Коротко' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Свернуть конспект' })).toHaveAttribute('aria-expanded', 'true')

      fireEvent.click(screen.getByRole('button', { name: 'Свернуть конспект' }))
      expect(screen.queryByRole('heading', { name: 'Коротко' })).toBeNull()
    })

    it('ссылка «Читать конспект» раскрывает его, в том числе повторно', () => {
      render(<><StudyNotesAnchor /><ContentBlockRenderer blocks={[notes(text)]} /></>)
      const link = screen.getByRole('link', { name: 'Читать конспект' })
      expect(link).toHaveAttribute('href', '#konspekt')

      fireEvent.click(link)
      expect(screen.getByRole('heading', { name: 'Коротко' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Свернуть конспект' }))
      fireEvent.click(link)
      expect(screen.getByRole('heading', { name: 'Коротко' })).toBeInTheDocument()
    })

    it('присланная ссылка на раздел конспекта раскрывает его при открытии страницы', () => {
      window.history.replaceState(null, '', '#konspekt-1')
      render(<ContentBlockRenderer blocks={[notes(text)]} />)

      expect(screen.getByRole('heading', { name: 'Коротко' })).toBeInTheDocument()
    })

    it('раскрывается и при смене якоря в адресе, чужой якорь его не трогает', () => {
      render(<ContentBlockRenderer blocks={[notes(text)]} />)

      window.history.replaceState(null, '', '#video-1')
      fireEvent(window, new Event('hashchange'))
      expect(screen.queryByRole('heading', { name: 'Коротко' })).toBeNull()

      window.history.replaceState(null, '', '#konspekt')
      fireEvent(window, new Event('hashchange'))
      expect(screen.getByRole('heading', { name: 'Коротко' })).toBeInTheDocument()
    })

    it('ссылка из шапки не раскрывает второй конспект: у него свой якорь', () => {
      render(<><StudyNotesAnchor /><ContentBlockRenderer blocks={[notes('## Коротко\n\nПервый.'), { ...notes('## Итог\n\nВторой.'), id: 'n2' }]} /></>)

      fireEvent.click(screen.getByRole('link', { name: 'Читать конспект' }))

      expect(screen.getByRole('heading', { name: 'Коротко' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Итог' })).toBeNull()
    })

    it('находка поиска браузера раскрывает конспект', () => {
      render(<ContentBlockRenderer blocks={[notes(text)]} />)

      fireEvent(screen.getByText('Текст.').closest('[hidden]') as Element, new Event('beforematch'))

      expect(screen.getByRole('heading', { name: 'Коротко' })).toBeInTheDocument()
    })

    it('свёрнутый конспект не грузит схемы и подсветку кода', async () => {
      render(<ContentBlockRenderer blocks={[notes('```mermaid\nflowchart LR\n  A --> B\n```\n\n```ts\nconst a = 1\n```\n')]} />)

      await act(async () => { await Promise.resolve() })
      expect(mermaidRender).not.toHaveBeenCalled()
      expect(getMarkdownHighlighter).not.toHaveBeenCalled()

      expand()
      await waitFor(() => expect(mermaidRender).toHaveBeenCalled())
      expect(getMarkdownHighlighter).toHaveBeenCalled()
    })
  })
})
