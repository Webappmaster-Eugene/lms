import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const { mermaidRender, mermaidParse } = vi.hoisted(() => ({
  mermaidRender: vi.fn(async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Клиент</text></svg>' })),
  mermaidParse: vi.fn(async () => ({ diagramType: 'flowchart-v2' })),
}))
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), parse: mermaidParse, render: mermaidRender } }))
vi.mock('@/lib/markdown-highlighter', () => ({
  markdownLanguage: (language: string) => language,
  getMarkdownHighlighter: vi.fn(async () => ({ getLoadedLanguages: () => [], codeToHtml: () => '' })),
}))
vi.mock('@/components/lesson/VideoPlayer', async () => {
  const { StudyNotesLink } = await import('@/components/lesson/StudyNotes')
  return { VideoPlayer: ({ title }: { title: string }) => <div data-testid="video">{title}<StudyNotesLink /></div> }
})

const { ContentBlockRenderer } = await import('@/components/lesson/ContentBlockRenderer')
const { getMarkdownHighlighter } = await import('@/lib/markdown-highlighter')

const video = { id: 'v1', blockType: 'video', title: 'Видео урока', videoUrl: '/api/yandex-disk/stream?lesson=1&block=v1', displayMode: 'embed' }
const notes = (markdown: string) => ({ id: 'n1', blockType: 'lessonNotes', markdown, source: 'topic' })

afterEach(() => { vi.clearAllMocks() })

/**
 * Конспект заменяет видео тем, кто не может его посмотреть: он должен быть найден
 * из плеера и читаться без видео - таблицы, код и схемы на месте.
 */
describe('конспект урока', () => {
  it('рисует таблицу и код, а плеер ведёт к конспекту', () => {
    render(<ContentBlockRenderer blocks={[video, notes('## Коротко\n\nТекст.\n\n| Метод | Смысл |\n|---|---|\n| GET | чтение |\n\n```ts\nconst a = 1\n```\n')]} />)

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

    const image = await screen.findByRole('img', { name: 'Запрос к серверу' })
    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(Buffer.from(String(image.getAttribute('src')).split(',')[1], 'base64').toString('utf8')).toContain('Клиент')
    expect(mermaidRender).toHaveBeenCalledWith(expect.stringMatching(/^mermaid-/), code)
    expect(getMarkdownHighlighter).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Запрос к серверу - открыть во весь экран' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('сломанная схема показывается текстом, а не пропадает', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mermaidParse.mockRejectedValueOnce(new Error('Parse error on line 2'))
    render(<ContentBlockRenderer blocks={[notes('```mermaid\nflowchart LR\n  A -->\n```\n')]} />)

    await waitFor(() => expect(screen.getByText('Схему не удалось нарисовать, ниже её текст.')).toBeInTheDocument())
    expect(screen.getByText(/A -->/)).toBeInTheDocument()
    expect(mermaidRender).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
