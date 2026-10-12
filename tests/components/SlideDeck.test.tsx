import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const { SlideDeck } = await import('@/components/lesson/SlideDeck')
const { LessonKeyboardNav } = await import('@/components/lesson/LessonKeyboardNav')

const deck = (count = 5, pages = false) => render(
  <SlideDeck label="Легенда" count={count} pages={pages} caption={(index) => index === 1 ? 'Вторая легенда' : null}>
    {({ index, near }) => near ? <span>содержимое {index + 1}</span> : null}
  </SlideDeck>,
)
const counter = () => screen.getByText(/из/).closest('p')?.textContent?.replace(/\s+/g, ' ').trim()
const root = () => screen.getByRole('group', { name: 'Легенда' })
const track = () => {
  const element = screen.getByTestId('slide-track')
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: 400 })
  return element
}
const swipeTo = (slide: number) => {
  const element = track()
  element.scrollLeft = slide * 400
  fireEvent.scroll(element)
}

beforeEach(() => { push.mockReset() })

describe('листалка слайдов', () => {
  it('кнопки листают, на краях помечаются недоступными и не сдвигают счётчик', () => {
    deck(3)
    const previous = screen.getByRole('button', { name: 'Предыдущий слайд' })
    const next = screen.getByRole('button', { name: 'Следующий слайд' })
    expect(counter()).toBe('Слайд 1 / из 3')
    expect(previous).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(previous)
    expect(counter()).toBe('Слайд 1 / из 3')
    fireEvent.click(next)
    expect(counter()).toBe('Слайд 2 / из 3')
    expect(previous).toHaveAttribute('aria-disabled', 'false')
    expect(screen.getByText('Вторая легенда')).toBeInTheDocument()
    fireEvent.click(next)
    expect(next).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(next)
    expect(counter()).toBe('Слайд 3 / из 3')
    fireEvent.click(previous)
    expect(counter()).toBe('Слайд 2 / из 3')
  })

  it('на последнем слайде фокус остаётся на кнопке, и стрелка не уводит на соседний урок', () => {
    render(<LessonKeyboardNav prevHref="/lessons/prev" nextHref="/lessons/next" />)
    deck(2)
    const next = screen.getByRole('button', { name: 'Следующий слайд' })
    next.focus()
    fireEvent.click(next)
    // Отключённая через disabled кнопка потеряла бы фокус, и следующая стрелка ушла бы странице.
    expect(next).toBeEnabled()
    expect(document.activeElement).toBe(next)
    fireEvent.keyDown(next, { key: 'ArrowRight' })
    expect(counter()).toBe('Слайд 2 / из 2')
    expect(push).not.toHaveBeenCalled()
  })

  it('рисует только текущий слайд и соседние, остальные ждут своей очереди', () => {
    deck(5)
    expect(screen.getByText('содержимое 1')).toBeInTheDocument()
    expect(screen.getByText('содержимое 2')).toBeInTheDocument()
    expect(screen.queryByText('содержимое 3')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Следующий слайд' }))
    expect(screen.getByText('содержимое 3')).toBeInTheDocument()
    expect(screen.queryByText('содержимое 4')).not.toBeInTheDocument()
  })

  it('стрелки внутри презентации листают слайды и не переключают урок', () => {
    render(<LessonKeyboardNav prevHref="/lessons/prev" nextHref="/lessons/next" />)
    deck(3)
    fireEvent.keyDown(root(), { key: 'ArrowRight' })
    expect(counter()).toBe('Слайд 2 / из 3')
    fireEvent.keyDown(root(), { key: 'End' })
    expect(counter()).toBe('Слайд 3 / из 3')
    // На последнем слайде стрелка тоже остаётся внутри презентации.
    fireEvent.keyDown(root(), { key: 'ArrowRight' })
    fireEvent.keyDown(root(), { key: 'Home' })
    expect(counter()).toBe('Слайд 1 / из 3')
    expect(push).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(push).toHaveBeenCalledWith('/lessons/next')
  })

  it('сочетания клавиш браузера презентация не перехватывает', () => {
    deck(3)
    expect(fireEvent.keyDown(root(), { key: 'ArrowRight', altKey: true })).toBe(true)
    expect(counter()).toBe('Слайд 1 / из 3')
  })

  it('свайп по ленте меняет номер слайда', () => {
    deck(4)
    swipeTo(2)
    expect(counter()).toBe('Слайд 3 / из 4')
    expect(screen.getByText('содержимое 4')).toBeInTheDocument()
  })

  it('пока лента едет к выбранному слайду, промежуточные положения счётчик не сбивают', () => {
    deck(4)
    fireEvent.click(screen.getByRole('button', { name: 'Следующий слайд' }))
    swipeTo(0)
    expect(counter()).toBe('Слайд 2 / из 4')
    // Палец на ленте отменяет ожидание: дальше номер слайда снова задаёт её положение.
    fireEvent.pointerDown(track())
    swipeTo(3)
    expect(counter()).toBe('Слайд 4 / из 4')
  })

  it('нажатие «назад» на первом слайде не мешает следующему свайпу', () => {
    deck(4)
    fireEvent.keyDown(root(), { key: 'ArrowLeft' })
    swipeTo(1)
    expect(counter()).toBe('Слайд 2 / из 4')
  })

  it('у документа кнопки и счётчик говорят о страницах', () => {
    deck(3, true)
    expect(counter()).toBe('Страница 1 / из 3')
    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }))
    expect(counter()).toBe('Страница 2 / из 3')
    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeInTheDocument()
  })

  it('разворачивается как модальное окно и сворачивается по Escape, возвращая фокус', () => {
    deck(3)
    const expand = screen.getByRole('button', { name: 'Развернуть на весь экран' })
    fireEvent.click(expand)
    const dialog = screen.getByRole('dialog', { name: 'Легенда' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.className).toContain('fixed')
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(root().className).not.toContain('fixed')
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Развернуть на весь экран' }))
  })

  it('в развёрнутом режиме клавиши листают слайды, где бы ни был фокус, а Tab не выходит наружу', () => {
    render(<><LessonKeyboardNav prevHref="/lessons/prev" nextHref="/lessons/next" /><button type="button">Снаружи</button></>)
    deck(3)
    fireEvent.click(screen.getByRole('button', { name: 'Развернуть на весь экран' }))
    const outside = screen.getByRole('button', { name: 'Снаружи' })
    outside.focus()
    fireEvent.keyDown(outside, { key: 'ArrowRight' })
    expect(counter()).toBe('Слайд 2 / из 3')
    fireEvent.keyDown(outside, { key: 'End' })
    fireEvent.keyDown(outside, { key: 'ArrowRight' })
    expect(counter()).toBe('Слайд 3 / из 3')
    expect(push).not.toHaveBeenCalled()

    const collapse = screen.getByRole('button', { name: 'Свернуть презентацию' })
    const previous = screen.getByRole('button', { name: 'Предыдущий слайд' })
    collapse.focus()
    expect(fireEvent.keyDown(collapse, { key: 'Tab' })).toBe(false)
    expect(document.activeElement).toBe(previous)
    expect(fireEvent.keyDown(previous, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(document.activeElement).toBe(collapse)
    // Внутри окна Tab идёт своим чередом.
    previous.focus()
    expect(fireEvent.keyDown(previous, { key: 'Tab' })).toBe(true)
  })

  it('без слайдов ничего не рисует', () => {
    const { container } = deck(0)
    expect(container).toBeEmptyDOMElement()
  })
})
