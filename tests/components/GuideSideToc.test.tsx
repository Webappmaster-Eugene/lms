import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

import { GuideSideToc } from '@/components/guides/GuideSideToc'

const headings = [
  { id: 'section-1', title: 'Что понадобится' },
  { id: 'section-2', title: 'Установка' },
  { id: 'section-3', title: 'Проверка' },
]

/**
 * Вёрстки в jsdom нет: положения заголовков и колонки задаются тестом так, как их
 * вернул бы браузер, а кадры анимации прокручиваются вручную.
 */
const tops = new Map<string, number>()
let frames: FrameRequestCallback[] = []

function page({ scrollY = 0, innerHeight = 800, scrollHeight = 5000 } = {}) {
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: innerHeight, configurable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true })
}

function placeHeadings(positions: Record<string, number>) {
  for (const [id, top] of Object.entries(positions)) tops.set(id, top)
}

function renderToc(column?: { top: number; height: number }, navHeight = 300) {
  const article = document.createElement('div')
  for (const heading of headings) {
    const element = document.createElement('h2')
    element.id = heading.id
    element.getBoundingClientRect = () => ({ top: tops.get(heading.id) ?? 10_000 }) as DOMRect
    article.append(element)
  }
  document.body.append(article)
  const view = render(<aside data-testid="column"><GuideSideToc headings={headings} /></aside>)
  const aside = screen.getByTestId('column')
  if (column) aside.getBoundingClientRect = () => ({ top: column.top, height: column.height }) as DOMRect
  Object.defineProperty(screen.getByRole('navigation'), 'offsetHeight', { value: navHeight, configurable: true })
  return view
}

function scroll(update: () => void = () => {}) {
  update()
  act(() => {
    window.dispatchEvent(new Event('scroll'))
    const pending = frames
    frames = []
    for (const callback of pending) callback(performance.now())
  })
}

const current = () => screen.queryByRole('link', { current: 'location' })

beforeEach(() => {
  tops.clear()
  frames = []
  page()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('оглавление гайда сбоку', () => {
  it('ведёт якорными ссылками на разделы в их порядке', () => {
    renderToc()
    const nav = screen.getByRole('navigation', { name: 'Содержание гайда' })
    const links = Array.from(nav.querySelectorAll('a'))
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Что понадобится', '#section-1'],
      ['Установка', '#section-2'],
      ['Проверка', '#section-3'],
    ])
  })

  it('до первого раздела ни один пункт не отмечен текущим', () => {
    placeHeadings({ 'section-1': 400, 'section-2': 1200, 'section-3': 2000 })
    renderToc()
    expect(current()).toBeNull()
  })

  it('текущим становится последний раздел, заголовок которого поднялся выше линии чтения', () => {
    placeHeadings({ 'section-1': -300, 'section-2': 100, 'section-3': 900 })
    renderToc()
    expect(current()).toHaveTextContent('Установка')
  })

  it('при прокрутке отметка переходит к следующему разделу', () => {
    placeHeadings({ 'section-1': 50, 'section-2': 700, 'section-3': 1500 })
    renderToc()
    expect(current()).toHaveTextContent('Что понадобится')

    scroll(() => placeHeadings({ 'section-1': -600, 'section-2': 60, 'section-3': 850 }))
    expect(current()).toHaveTextContent('Установка')
  })

  it('в конце страницы отмечает нижний видимый раздел, даже если он не дошёл до линии', () => {
    placeHeadings({ 'section-1': -900, 'section-2': 300, 'section-3': 600 })
    page({ scrollY: 4200, innerHeight: 800, scrollHeight: 5000 })
    renderToc()
    expect(current()).toHaveTextContent('Проверка')
  })

  it('пересчитывает отметку и при изменении размера окна', () => {
    placeHeadings({ 'section-1': 400, 'section-2': 1200, 'section-3': 2000 })
    renderToc()
    expect(current()).toBeNull()
    placeHeadings({ 'section-1': 100 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
      for (const callback of frames.splice(0)) callback(performance.now())
    })
    expect(current()).toHaveTextContent('Что понадобится')
  })

  it('частая прокрутка пересчитывается не чаще одного раза за кадр', () => {
    renderToc()
    act(() => {
      for (let index = 0; index < 5; index += 1) window.dispatchEvent(new Event('scroll'))
    })
    expect(frames).toHaveLength(1)
  })

  it('пока колонка ниже верха окна, оглавление стоит на месте', () => {
    renderToc({ top: 100, height: 3000 })
    scroll()
    expect(screen.getByRole('navigation').style.transform).toBe('translateY(0px)')
  })

  it('когда колонка уехала вверх, оглавление держится в 32 px от верха окна', () => {
    renderToc({ top: -500, height: 3000 })
    scroll()
    expect(screen.getByRole('navigation').style.transform).toBe('translateY(532px)')
  })

  it('у конца колонки останавливается так, чтобы низ оглавления совпал с низом колонки', () => {
    renderToc({ top: -2900, height: 3000 }, 300)
    scroll()
    expect(screen.getByRole('navigation').style.transform).toBe('translateY(2700px)')
  })

  it('после ухода со страницы перестаёт слушать прокрутку и отменяет запланированный кадр', () => {
    const { unmount } = renderToc()
    act(() => window.dispatchEvent(new Event('scroll')))
    expect(frames).toHaveLength(1)
    unmount()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    frames = []
    window.dispatchEvent(new Event('scroll'))
    expect(frames).toHaveLength(0)
  })
})
