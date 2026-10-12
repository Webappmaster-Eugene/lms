import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import type { PdfDocument } from '@/lib/pdf-document'
import type { SlideItem } from '@/lib/slides'

const openPdf = vi.fn()
vi.mock('@/lib/pdf-document', () => ({ openPdf }))

const { SlidesBlock } = await import('@/components/lesson/SlidesBlock')

const asset = (id: string) => `/api/learning-assets?lesson=7&block=deck&asset=${id}`
const image = (id: string, caption?: string): SlideItem => ({ id, url: asset(id), fileName: `${id}.png`, caption })
const pdfItem: SlideItem = { id: 'pdf', url: asset('pdf'), fileName: 'гайд на софты.pdf' }

function pdfDocument(pages: number): PdfDocument {
  return {
    pages,
    pageSize: vi.fn(async () => ({ width: 842, height: 505 })),
    render: vi.fn(async () => ({ done: Promise.resolve(), cancel: vi.fn() })),
    destroy: vi.fn(async () => undefined),
  }
}

// Соседний слайд скрыт от скринридера до перелистывания, поэтому картинки ищем в разметке, а не по роли.
const images = () => [...document.querySelectorAll('img')]
const sources = () => images().map((node) => node.getAttribute('src'))
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Следующий слайд' }))

beforeEach(() => { openPdf.mockReset() })
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('блок «Презентация» в уроке', () => {
  it('картинки подряд собирает в одну листалку, PDF и документы показывает отдельно', async () => {
    openPdf.mockResolvedValue(pdfDocument(3))
    render(<SlidesBlock title="Процессы в IT" description="Как устроена работа" items={[image('a'), image('b'), pdfItem, { id: 'doc', url: asset('doc'), fileName: 'шаблон.docx', caption: 'Шаблон резюме' }, image('c')]} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Процессы в IT' })).toBeInTheDocument()
    expect(screen.getByText('Как устроена работа')).toBeInTheDocument()
    // Две листалки одного блока называются по-разному, иначе на слух их не различить.
    expect(screen.getByRole('group', { name: 'Процессы в IT, часть 1' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Процессы в IT, часть 2' })).toBeInTheDocument()
    expect(await screen.findByRole('group', { name: 'гайд на софты' })).toBeInTheDocument()
    expect(openPdf).toHaveBeenCalledTimes(1)
    expect(openPdf.mock.calls[0][0]).toBe(asset('pdf'))
    const file = screen.getByRole('link', { name: /Шаблон резюме/ })
    expect(file).toHaveAttribute('href', asset('doc'))
    expect(file).toHaveAttribute('download', 'шаблон.docx')
    expect(screen.getByRole('link', { name: 'Скачать PDF' })).toHaveAttribute('download', 'гайд на софты.pdf')
  })

  it('единственная листалка блока называется как сам блок', () => {
    render(<SlidesBlock title="Легенда" items={[image('a'), image('b')]} />)
    expect(screen.getByRole('group', { name: 'Легенда' })).toBeInTheDocument()
  })

  it('в серверной разметке картинок нет: иначе событие загрузки пришло бы раньше обработчика', () => {
    const html = renderToString(<SlidesBlock title="Легенда" items={[image('a'), image('b')]} />)
    expect(html).toContain('Легенда')
    expect(html).not.toContain('<img')
  })

  it('первая отрисовка в браузере совпадает с разметкой сервера', async () => {
    openPdf.mockReturnValue(new Promise(() => undefined))
    const block = <SlidesBlock title="Легенда" items={[image('a'), image('b'), pdfItem]} />
    // На сервере IntersectionObserver нет, в браузере он есть — разметка от этого зависеть не должна.
    const container = document.createElement('div')
    container.innerHTML = renderToString(block)
    document.body.append(container)
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
    const mismatches: unknown[] = []
    let root: Root | undefined
    await act(async () => { root = hydrateRoot(container, block, { onRecoverableError: (error) => mismatches.push(error) }) })
    expect(mismatches).toEqual([])
    act(() => root?.unmount())
    container.remove()
  })

  it('грузит ближайшие слайды, держит не больше трёх загрузок и не теряет показанные', () => {
    render(<SlidesBlock title="Легенда" items={['a', 'b', 'c', 'd', 'e'].map((id) => image(id))} />)
    expect(sources()).toEqual([asset('a'), asset('b')])
    next()
    expect(sources()).toEqual(['a', 'b', 'c'].map(asset))
    next()
    next()
    // Ученик уже на четвёртом слайде, но три загрузки заняты: прокси не должен получить четвёртую.
    expect(sources()).toEqual(['a', 'b', 'c'].map(asset))
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем слайд…')
    fireEvent.load(images()[0])
    // Освободившееся место достаётся текущему слайду, а не соседнему.
    expect(sources()).toEqual(['a', 'b', 'c', 'd'].map(asset))
    fireEvent.load(images()[1])
    expect(sources()).toEqual(['a', 'b', 'c', 'd', 'e'].map(asset))
  })

  it('слайд, с которого ушли до начала загрузки, очередь не занимает', () => {
    render(<SlidesBlock title="Легенда" items={['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => image(id))} />)
    for (let step = 0; step < 5; step += 1) next()
    // «d» успел встать в очередь, но ученик пролистал дальше: рядом с шестым слайдом теперь «e» и «g».
    for (const node of images()) fireEvent.load(node)
    expect(sources()).toEqual(['a', 'b', 'c', 'e', 'f', 'g'].map(asset))
  })

  it('подпись слайда становится его описанием, без подписи — номер слайда', () => {
    render(<SlidesBlock title="Легенда" items={[image('a', 'Как скрыть данные'), image('b')]} />)
    expect(screen.getByRole('img', { name: 'Как скрыть данные' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Легенда, слайд 2', hidden: true })).toBeInTheDocument()
    expect(screen.getByText('Как скрыть данные', { selector: 'p' })).toBeInTheDocument()
  })

  it('сбой хранилища: слайд сам пробует ещё раз, потом предлагает повторить', () => {
    vi.useFakeTimers()
    render(<SlidesBlock title="Легенда" items={[image('a')]} />)
    fireEvent.error(images()[0])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(images()).toHaveLength(0)
    act(() => { vi.advanceTimersByTime(1500) })
    expect(images()[0]).toHaveAttribute('src', `${asset('a')}&retry=1`)
    fireEvent.error(images()[0])
    expect(screen.getByRole('alert')).toHaveTextContent('Слайд не загрузился')
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    expect(images()[0]).toHaveAttribute('src', `${asset('a')}&retry=2`)
    // Кнопка исчезла — фокус остался в презентации, а не упал на страницу.
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Легенда' }))
    fireEvent.load(images()[0])
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('неудачная загрузка освобождает очередь для остальных слайдов', () => {
    render(<SlidesBlock title="Легенда" items={['a', 'b', 'c', 'd'].map((id) => image(id))} />)
    next()
    next()
    expect(sources()).toEqual(['a', 'b', 'c'].map(asset))
    fireEvent.error(images()[0])
    expect(sources()).toEqual(['b', 'c', 'd'].map(asset))
  })

  it('администратору исходная ссылка Диска открывается через прокси урока', () => {
    const url = 'https://disk.yandex.com/d/key/%D0%93%D0%B0%D0%B9%D0%B4/1.png'
    render(<SlidesBlock title="Гайд" items={[{ url, fileName: '1.png' }]} />)
    expect(images()[0]).toHaveAttribute('src', `/api/learning-assets?${new URLSearchParams({ url })}`)
  })

  it('файл медиатеки показывается по своему адресу', () => {
    render(<SlidesBlock title="Гайд" items={[{ url: '/api/media/file/%D1%81%D1%85%D0%B5%D0%BC%D0%B0%20%281%29.png', fileName: 'схема (1).png' }]} />)
    expect(images()[0]).toHaveAttribute('src', '/api/media/file/%D1%81%D1%85%D0%B5%D0%BC%D0%B0%20%281%29.png')
  })

  it('PDF листается постранично: рисуются текущая и соседняя страницы', async () => {
    const pdf = pdfDocument(4)
    openPdf.mockResolvedValue(pdf)
    render(<SlidesBlock title="Гайд" items={[pdfItem]} />)
    expect(screen.getByRole('status')).toHaveTextContent('Открываем «гайд на софты»')
    await screen.findByRole('group', { name: 'гайд на софты' })
    await waitFor(() => expect(pdf.render).toHaveBeenCalledTimes(2))
    expect(vi.mocked(pdf.render).mock.calls.map((call) => call[0])).toEqual([1, 2])
    expect(screen.getByText(/из/).closest('p')).toHaveTextContent('Страница 1 / из 4')
    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }))
    await waitFor(() => expect(vi.mocked(pdf.render).mock.calls.map((call) => call[0])).toContain(3))
  })

  it('проценты загрузки PDF видны, но экранному диктору не зачитываются', async () => {
    let progress: ((share: number | null) => void) | undefined
    openPdf.mockImplementation((_url: string, _signal: AbortSignal, onProgress: (share: number | null) => void) => {
      progress = onProgress
      return new Promise(() => undefined)
    })
    render(<SlidesBlock title="Гайд" items={[pdfItem]} />)
    await waitFor(() => expect(progress).toBeDefined())
    act(() => progress?.(0.42))
    expect(screen.getByText('42%')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('status')).toHaveTextContent(/^Открываем «гайд на софты»…$/)
  })

  it('PDF не открылся: можно повторить или скачать файл', async () => {
    openPdf.mockRejectedValueOnce(new Error('502'))
    render(<SlidesBlock title="Гайд" items={[pdfItem]} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть «гайд на софты»')
    expect(screen.getByRole('link', { name: 'Скачать PDF' })).toHaveAttribute('href', asset('pdf'))
    openPdf.mockResolvedValue(pdfDocument(2))
    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    expect(await screen.findByRole('group', { name: 'гайд на софты' })).toBeInTheDocument()
    expect(openPdf.mock.calls[1][0]).toBe(`${asset('pdf')}&retry=1`)
  })

  it('после замены файла в блоке старый документ не показывается', async () => {
    const first = pdfDocument(2)
    openPdf.mockResolvedValueOnce(first)
    const view = render(<SlidesBlock title="Гайд" items={[pdfItem]} />)
    await screen.findByRole('group', { name: 'гайд на софты' })
    openPdf.mockReturnValue(new Promise(() => undefined))
    view.rerender(<SlidesBlock title="Гайд" items={[{ id: 'pdf', url: asset('other'), fileName: 'новый.pdf' }]} />)
    expect(screen.queryByRole('group', { name: 'гайд на софты' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Открываем «новый»')
    expect(first.destroy).toHaveBeenCalled()
  })

  it('закрытый урок освобождает открытый PDF', async () => {
    const pdf = pdfDocument(2)
    openPdf.mockResolvedValue(pdf)
    const view = render(<SlidesBlock title="Гайд" items={[pdfItem]} />)
    await screen.findByRole('group', { name: 'гайд на софты' })
    view.unmount()
    expect(pdf.destroy).toHaveBeenCalled()
  })

  it('блок без файлов говорит об этом, а не показывает пустую рамку', () => {
    render(<SlidesBlock title="Скоро" items={[]} />)
    expect(screen.getByText('В этой презентации пока нет файлов.')).toBeInTheDocument()
  })
})
