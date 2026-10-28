import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PdfDocument } from '@/lib/pdf-document'

const openPdf = vi.fn()
vi.mock('@/lib/pdf-document', () => ({ openPdf }))
// Подсветка не загрузилась: проверяется, что код урока от этого не пропадает.
vi.mock('@/lib/markdown-highlighter', () => ({
  markdownLanguage: (language: string) => language,
  getMarkdownHighlighter: vi.fn(async () => { throw new Error('chunk failed') }),
}))

const { SlidesBlock } = await import('@/components/lesson/SlidesBlock')
const { LessonMarkdown } = await import('@/components/lesson/LessonMarkdown')

/** Сбои внутри материалов урока: страница PDF, подсветка кода и размер схемы. */

const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`

afterEach(() => {
  vi.restoreAllMocks()
  openPdf.mockReset()
})

describe('страница PDF в презентации', () => {
  it('неотрисованная страница предлагает повторить, повтор рисует её заново', async () => {
    let attempt = 0
    const pdf: PdfDocument = {
      pages: 1,
      pageSize: vi.fn(async () => ({ width: 842, height: 595 })),
      render: vi.fn(async () => {
        attempt += 1
        return { done: attempt === 1 ? Promise.reject(new Error('canvas lost')) : Promise.resolve(), cancel: vi.fn() }
      }),
      destroy: vi.fn(async () => undefined),
    }
    openPdf.mockResolvedValue(pdf)
    render(<SlidesBlock title="Гайд" items={[{ id: 'pdf', url: '/api/learning-assets?lesson=7&block=deck&asset=pdf', fileName: 'гайд.pdf' }]} />)

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('Страница не отрисовалась.')
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))

    await waitFor(() => expect(pdf.render).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('group', { name: 'гайд' })).toHaveFocus()
  })
})

describe('текст урока из репозитория', () => {
  it('сбой загрузки подсветки оставляет код читаемым и пишет причину в консоль', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<LessonMarkdown markdown={'```ts\nconst x = 1\n```'} />)

    await waitFor(() => expect(warn).toHaveBeenCalledWith('Не удалось загрузить подсветку кода урока', expect.any(Error)))
    expect(container.querySelector('pre code')).toHaveTextContent('const x = 1')
  })

  it('схема после загрузки не сжимается уже своей ширины, но не шире 560 пикселей', () => {
    render(<LessonMarkdown markdown={`![Схема запроса](${svg})`} />)
    const button = screen.getByRole('button', { name: 'Схема запроса - открыть во весь экран' })
    const image = button.querySelector('img') as HTMLImageElement
    expect(button.style.minWidth).toBe('')

    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1200 })
    fireEvent.load(image)
    // jsdom сворачивает min() в calc(), поэтому проверяется итоговая ширина, а не запись.
    expect(button.style.minWidth).toMatch(/\b560px\b/)
    expect(button.style.minWidth).not.toMatch(/1200px/)

    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 300 })
    fireEvent.load(image)
    expect(button.style.minWidth).toMatch(/\b300px\b/)
  })
})
