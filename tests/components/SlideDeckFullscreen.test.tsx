import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { SlideDeck } = await import('@/components/lesson/SlideDeck')

/**
 * Листалка презентации: прокрутка ленты, клавиши и системный полноэкранный режим.
 * В jsdom нет Fullscreen API и Element.scrollTo — подставляются так, как их
 * ведёт браузер: событие fullscreenchange приходит при входе и выходе.
 */

const deck = (count = 4) => render(
  <SlideDeck label="Легенда" count={count}>{({ index }) => <span>содержимое {index + 1}</span>}</SlideDeck>,
)
const counter = () => screen.getByText(/из/).closest('p')?.textContent?.replace(/\s+/g, ' ').trim()
const root = () => document.querySelector('[data-slide-deck]') as HTMLElement
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

let fullscreenElement: Element | null = null
const fullscreenChange = () => document.dispatchEvent(new Event('fullscreenchange'))
function enter(element: Element) {
  fullscreenElement = element
  fullscreenChange()
}

beforeEach(() => {
  fullscreenElement = null
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'fullscreenElement')
  Reflect.deleteProperty(document, 'exitFullscreen')
  Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
})

describe('прокрутка ленты слайдов', () => {
  it('кнопки и Home/End прокручивают ленту плавно к нужному слайду', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
    deck(4)
    track()

    fireEvent.click(screen.getByRole('button', { name: 'Следующий слайд' }))
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 400, behavior: 'smooth' })
    fireEvent.keyDown(root(), { key: 'End' })
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 1200, behavior: 'smooth' })
    fireEvent.keyDown(root(), { key: 'Home' })
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'smooth' })
    expect(counter()).toBe('Слайд 1 / из 4')
  })

  it('при просьбе уменьшить движение лента переключается без анимации', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: scrollTo })
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }) as MediaQueryList)
    deck(4)
    track()

    fireEvent.keyDown(root(), { key: 'PageDown' })

    expect(scrollTo).toHaveBeenLastCalledWith({ left: 400, behavior: 'auto' })
    expect(counter()).toBe('Слайд 2 / из 4')
  })

  it('когда лента доехала до выбранного слайда, следующий свайп снова меняет номер', () => {
    deck(4)

    fireEvent.click(screen.getByRole('button', { name: 'Следующий слайд' }))
    swipeTo(1)
    swipeTo(2)

    expect(counter()).toBe('Слайд 3 / из 4')
  })

  it('буквы и прочие клавиши презентация не перехватывает', () => {
    deck(4)

    expect(fireEvent.keyDown(root(), { key: 'a' })).toBe(true)
    expect(counter()).toBe('Слайд 1 / из 4')
  })
})

describe('системный полноэкранный режим', () => {
  function nativeFullscreen() {
    const request = vi.fn(async function (this: HTMLElement) { enter(this) })
    const exit = vi.fn(async () => { fullscreenElement = null; fullscreenChange() })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit })
    return { request, exit }
  }

  it('разворот запрашивает полный экран, сворачивание выходит из него и возвращает фокус', async () => {
    const user = userEvent.setup()
    const { request, exit } = nativeFullscreen()
    deck(3)

    await user.click(screen.getByRole('button', { name: 'Развернуть на весь экран' }))
    expect(request).toHaveBeenCalledOnce()
    expect(fullscreenElement).toBe(root())
    expect(screen.getByRole('dialog', { name: 'Легенда' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Свернуть презентацию' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Свернуть презентацию' }))
    expect(exit).toHaveBeenCalledOnce()
    expect(screen.getByRole('group', { name: 'Легенда' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Развернуть на весь экран' })).toHaveFocus()
  })

  it('выход из полного экрана средствами браузера сворачивает презентацию', async () => {
    const user = userEvent.setup()
    nativeFullscreen()
    deck(3)
    await user.click(screen.getByRole('button', { name: 'Развернуть на весь экран' }))

    fullscreenElement = null
    fullscreenChange()

    await waitFor(() => expect(screen.getByRole('group', { name: 'Легенда' })).toBeInTheDocument())
    expect(document.body.style.overflow).toBe('')
  })

  it('отказ браузера в полном экране оставляет презентацию развёрнутой поверх страницы', async () => {
    const user = userEvent.setup()
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: vi.fn(async () => { throw new TypeError('denied') }) })
    const exit = vi.fn(async () => undefined)
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit })
    deck(3)

    await user.click(screen.getByRole('button', { name: 'Развернуть на весь экран' }))
    fullscreenChange()

    expect(screen.getByRole('dialog', { name: 'Легенда' })).toBeInTheDocument()
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(counter()).toBe('Слайд 1 / из 3')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('group', { name: 'Легенда' })).toBeInTheDocument())
    expect(exit).not.toHaveBeenCalled()
  })
})
