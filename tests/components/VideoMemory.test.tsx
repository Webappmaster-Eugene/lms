import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }))

vi.mock('mpegts.js', () => ({
  default: {
    Events: { ERROR: 'error' },
    isSupported: () => true,
    createPlayer: () => ({ attachMediaElement: vi.fn(), load: vi.fn(), destroy: vi.fn(), on: vi.fn() }),
  },
}))

const { VideoPlayer } = await import('@/components/lesson/VideoPlayer')
const { TransportStreamPlayer } = await import('@/components/lesson/TransportStreamPlayer')

/**
 * Видео урока продолжается с места остановки и помнит скорость.
 * Уроки — часовые записи: начинать заново после перерыва — главное неудобство.
 */

const URL_A = 'https://disk.yandex.ru/i/lesson-a'

function video(container: HTMLElement): HTMLVideoElement {
  const element = container.querySelector('video')
  if (!element) throw new Error('нет элемента видео')
  return element
}

/** jsdom не грузит медиа: метаданные и время выставляются руками. */
function loadMetadata(element: HTMLVideoElement, duration = 3600) {
  Object.defineProperty(element, 'readyState', { configurable: true, value: 1 })
  Object.defineProperty(element, 'duration', { configurable: true, value: duration })
  fireEvent(element, new Event('loadedmetadata'))
}

function play(element: HTMLVideoElement, seconds: number) {
  element.currentTime = seconds
  fireEvent(element, new Event('timeupdate'))
}

function renderPlayer() {
  return render(<VideoPlayer title="Урок" displayMode="embed" videoUrl={URL_A} />)
}

describe('память видео', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('место остановки сохраняется и при следующем открытии видео продолжается с него', () => {
    const first = renderPlayer()
    loadMetadata(video(first.container))
    play(video(first.container), 754)
    fireEvent(video(first.container), new Event('pause'))
    first.unmount()

    const second = renderPlayer()
    loadMetadata(video(second.container))

    expect(video(second.container).currentTime).toBe(754)
    expect(screen.getByText('Продолжили с 12:34')).toBeInTheDocument()
  })

  it('«С начала» возвращает к нулю и забывает место', async () => {
    window.localStorage.setItem('lms:video-positions', JSON.stringify({ [URL_A]: { t: 300, at: 1 } }))
    const { container } = renderPlayer()
    loadMetadata(video(container))

    await userEvent.click(screen.getByRole('button', { name: /С начала/ }))

    expect(video(container).currentTime).toBe(0)
    expect(screen.queryByText(/Продолжили/)).not.toBeInTheDocument()
    expect(window.localStorage.getItem('lms:video-positions')).not.toContain(URL_A)
  })

  it('уход на другой урок без паузы тоже запоминает место', () => {
    const first = renderPlayer()
    loadMetadata(video(first.container))
    play(video(first.container), 100)
    video(first.container).currentTime = 103
    first.unmount()

    const second = renderPlayer()
    loadMetadata(video(second.container))

    expect(video(second.container).currentTime).toBe(103)
  })

  it('конец видео сообщается странице — кнопка урока предложит отметку', () => {
    const listener = vi.fn()
    window.addEventListener('lms:video-ended', listener)
    const { container } = renderPlayer()

    fireEvent(video(container), new Event('ended'))

    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener('lms:video-ended', listener)
  })

  it('досмотренное видео начинается сначала', () => {
    const first = renderPlayer()
    loadMetadata(video(first.container))
    play(video(first.container), 1200)
    fireEvent(video(first.container), new Event('ended'))
    first.unmount()

    const second = renderPlayer()
    loadMetadata(video(second.container))

    expect(video(second.container).currentTime).toBe(0)
    expect(screen.queryByText(/Продолжили/)).not.toBeInTheDocument()
  })

  it('скорость выбирается, применяется к видео и переживает переход на другой урок', async () => {
    const first = renderPlayer()
    await userEvent.click(screen.getByRole('button', { name: '1,5×' }))

    expect(video(first.container).playbackRate).toBe(1.5)
    expect(screen.getByRole('button', { name: '1,5×' })).toHaveAttribute('aria-pressed', 'true')
    first.unmount()

    const second = render(<VideoPlayer title="Другой" displayMode="embed" videoUrl="https://disk.yandex.ru/i/b" />)
    act(() => loadMetadata(video(second.container)))
    expect(video(second.container).playbackRate).toBe(1.5)
  })

  it('скорость из встроенного меню браузера тоже запоминается', () => {
    const { container } = renderPlayer()
    // jsdom сам шлёт ratechange при записи playbackRate — как и браузер.
    act(() => {
      video(container).playbackRate = 1.25
      fireEvent(video(container), new Event('ratechange'))
    })

    expect(screen.getByRole('button', { name: '1,25×' })).toHaveAttribute('aria-pressed', 'true')
    expect(window.localStorage.getItem('lms:video-rate')).toBe('1.25')
  })

  it('поток MPEG-TS прыгает на место остановки, только когда оно загрузилось', () => {
    window.localStorage.setItem('lms:video-positions', JSON.stringify({ [URL_A]: { t: 300, at: 1 } }))
    const { container } = render(
      <TransportStreamPlayer src="/api/yandex-disk/proxy?url=a" memoryKey={URL_A} durationMinutes={60} onFailure={vi.fn()} />,
    )
    const element = video(container)
    const setBuffered = (end: number) =>
      Object.defineProperty(element, 'buffered', {
        configurable: true,
        value: { length: 1, start: () => 0, end: () => end },
      })

    setBuffered(120)
    fireEvent(element, new Event('progress'))
    expect(element.currentTime).toBe(0)

    setBuffered(400)
    fireEvent(element, new Event('progress'))
    expect(element.currentTime).toBe(300)
    expect(screen.getByText('Продолжили с 5:00')).toBeInTheDocument()
  })

  it('метка из заметки перематывает основное видео без «Продолжили с …»', () => {
    const { container } = renderPlayer()
    loadMetadata(video(container))

    act(() => {
      window.dispatchEvent(new CustomEvent('lms:video-seek', { detail: { seconds: 125 } }))
    })

    expect(video(container).currentTime).toBe(125)
    expect(screen.queryByText(/Продолжили/)).not.toBeInTheDocument()
  })

  it('ссылка с ?t= открывает видео на метке, а не на месте остановки', () => {
    window.localStorage.setItem('lms:video-positions', JSON.stringify({ [URL_A]: { t: 300, at: 1 } }))
    window.history.replaceState(null, '', '/lessons/a?t=90')
    const { container, unmount } = renderPlayer()
    loadMetadata(video(container))

    expect(video(container).currentTime).toBe(90)
    play(video(container), 200)
    unmount()

    // Общая ссылка остаётся явным запросом при повторном открытии и на другом устройстве.
    const again = renderPlayer()
    loadMetadata(video(again.container))
    expect(video(again.container).currentTime).toBe(90)
    again.unmount()
    window.history.replaceState(null, '', '/lessons/a')
    const personal = renderPlayer()
    loadMetadata(video(personal.container))
    expect(video(personal.container).currentTime).toBe(200)
    window.history.replaceState(null, '', '/')
  })
})
