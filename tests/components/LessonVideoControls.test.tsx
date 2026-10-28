import { useRef } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }))

// mpegts.js и MediaSource в jsdom нет: проверяется, как плеер реагирует на то, что сообщает библиотека.
const mpegts = vi.hoisted(() => ({
  supported: true,
  create: vi.fn(),
  destroy: vi.fn(),
  handlers: new Map<string, (type: string) => void>(),
}))
vi.mock('mpegts.js', () => ({
  default: {
    Events: { ERROR: 'error' },
    ErrorTypes: { NETWORK_ERROR: 'NetworkError', MEDIA_ERROR: 'MediaError' },
    isSupported: () => mpegts.supported,
    createPlayer: (...args: unknown[]) => {
      mpegts.create(...args)
      return {
        on: (event: string, handler: (type: string) => void) => mpegts.handlers.set(event, handler),
        attachMediaElement: vi.fn(),
        load: vi.fn(),
        destroy: mpegts.destroy,
      }
    },
  },
}))

const { TransportStreamPlayer } = await import('@/components/lesson/TransportStreamPlayer')
const { VideoShareButton } = await import('@/components/lesson/VideoShareButton')
const { VideoPlayer } = await import('@/components/lesson/VideoPlayer')

/**
 * Записи MPEG-TS идут через свой плеер с собственной панелью: нативная панель
 * показывает такое видео эфиром без перемотки. Панель обязана работать мышью и
 * клавиатурой и перематывать только по уже загруженной части файла.
 */

type Media = HTMLVideoElement & { paused: boolean }

function attachMedia(video: HTMLVideoElement) {
  let paused = true
  Object.defineProperty(video, 'paused', { configurable: true, get: () => paused })
  video.play = vi.fn(async () => { paused = false; video.dispatchEvent(new Event('play')) })
  video.pause = vi.fn(() => { paused = true; video.dispatchEvent(new Event('pause')) })
  return video as Media
}

function buffer(video: HTMLVideoElement, end: number) {
  Object.defineProperty(video, 'buffered', { configurable: true, value: { length: end > 0 ? 1 : 0, start: () => 0, end: () => end } })
  fireEvent.progress(video)
}

async function renderStream(durationMinutes: number | null = 10) {
  const failure = vi.fn()
  const view = render(<TransportStreamPlayer src="/api/yandex-disk/proxy?lesson=10&block=rec" memoryKey="rec:hash" durationMinutes={durationMinutes} onFailure={failure} />)
  const video = attachMedia(view.container.querySelector('video') as HTMLVideoElement)
  return { ...view, video, failure }
}

const slider = () => screen.getByRole('slider', { name: 'Перемотка' })

beforeEach(() => {
  localStorage.clear()
  mpegts.supported = true
  mpegts.handlers.clear()
  window.history.replaceState(null, '', '/lessons/stream')
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('потоковый плеер MPEG-TS', () => {
  it('браузер без MediaSource сразу помечается неподходящим, плеер не создаётся', async () => {
    mpegts.supported = false
    const { failure } = await renderStream()

    await waitFor(() => expect(failure).toHaveBeenCalledWith('unsupported'))
    expect(mpegts.create).not.toHaveBeenCalled()
  })

  it('обрыв сети и ошибка разбора различаются для повторных попыток', async () => {
    const { failure } = await renderStream()
    await waitFor(() => expect(mpegts.handlers.has('error')).toBe(true))
    expect(mpegts.create.mock.calls[0][0]).toMatchObject({ url: `${window.location.origin}/api/yandex-disk/proxy?lesson=10&block=rec`, duration: 600_000, withCredentials: true })

    mpegts.handlers.get('error')?.('NetworkError')
    expect(failure).toHaveBeenLastCalledWith('network', false)
    mpegts.handlers.get('error')?.('MediaError')
    expect(failure).toHaveBeenLastCalledWith(undefined, false)
  })

  it('сообщает, что сбой случился во время просмотра, а запуск после него сам продолжает с восстановленной секунды', async () => {
    const { failure, video } = await renderStream()
    await waitFor(() => expect(mpegts.handlers.has('error')).toBe(true))
    await act(async () => { await video.play() })
    mpegts.handlers.get('error')?.('NetworkError')
    expect(failure).toHaveBeenLastCalledWith('network', true)

    const view = render(<TransportStreamPlayer src="/api/yandex-disk/proxy?lesson=10&block=rec&playbackAttempt=1" memoryKey="rec:hash" durationMinutes={10} resumePlaying onFailure={vi.fn()} />)
    const resumed = attachMedia(view.container.querySelector('video') as HTMLVideoElement)
    expect(resumed.play).not.toHaveBeenCalled()
    fireEvent.seeked(resumed)
    expect(resumed.play).toHaveBeenCalledOnce()
    fireEvent.seeked(resumed)
    expect(resumed.play).toHaveBeenCalledOnce()
  })

  it('после ухода со страницы поздняя ошибка плеера не сообщается', async () => {
    const { failure, unmount } = await renderStream()
    await waitFor(() => expect(mpegts.handlers.has('error')).toBe(true))

    unmount()
    mpegts.handlers.get('error')?.('NetworkError')

    expect(mpegts.destroy).toHaveBeenCalled()
    expect(failure).not.toHaveBeenCalled()
  })

  it('кнопка и клик по кадру запускают и ставят на паузу', async () => {
    const user = userEvent.setup()
    const { video } = await renderStream()

    await user.click(screen.getByRole('button', { name: 'Смотреть' }))
    expect(video.play).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeInTheDocument()

    await user.click(video)
    expect(video.pause).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Смотреть' })).toBeInTheDocument()
  })

  it('запрет автозапуска браузером не роняет страницу', async () => {
    const user = userEvent.setup()
    const { video } = await renderStream()
    video.play = vi.fn(() => Promise.reject(new DOMException('blocked', 'NotAllowedError')))

    await user.click(screen.getByRole('button', { name: 'Смотреть' }))

    expect(video.play).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Смотреть' })).toBeInTheDocument()
  })

  it('звук выключается и включается, подпись кнопки следует за состоянием видео', async () => {
    const user = userEvent.setup()
    const { video } = await renderStream()

    await user.click(screen.getByRole('button', { name: 'Выключить звук' }))
    expect(video.muted).toBe(true)
    fireEvent(video, new Event('volumechange'))
    expect(screen.getByRole('button', { name: 'Включить звук' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Включить звук' }))
    expect(video.muted).toBe(false)
  })

  it('стрелки на шкале перематывают на 10 секунд, но не дальше загруженного', async () => {
    const { video } = await renderStream()
    act(() => buffer(video, 120))
    video.currentTime = 30
    fireEvent.timeUpdate(video)
    expect(slider()).toHaveAttribute('aria-valuenow', '30')
    expect(slider()).toHaveAttribute('aria-valuemax', '600')

    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(video.currentTime).toBe(40)
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
    expect(video.currentTime).toBe(20)

    video.currentTime = 115
    fireEvent.timeUpdate(video)
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(video.currentTime).toBeCloseTo(119.999, 3)
    expect(screen.getByText('1:59 / 10:00')).toBeInTheDocument()
  })

  it('пока ничего не загружено, перемотка не трогает видео', async () => {
    const { video } = await renderStream()
    act(() => buffer(video, 0))

    fireEvent.keyDown(slider(), { key: 'ArrowRight' })

    expect(video.currentTime).toBe(0)
  })

  it('клик по шкале перематывает пропорционально длительности урока', async () => {
    const { video } = await renderStream()
    act(() => buffer(video, 300))
    vi.spyOn(slider(), 'getBoundingClientRect').mockReturnValue({ left: 100, width: 200, top: 0, height: 6, right: 300, bottom: 6, x: 100, y: 0, toJSON: () => ({}) })

    fireEvent.click(slider(), { clientX: 150 })
    expect(video.currentTime).toBe(150)
    fireEvent.click(slider(), { clientX: 400 })
    expect(video.currentTime).toBeCloseTo(299.999, 3)
  })

  it('без длительности шкала не перематывает и время показано прочерком', async () => {
    const { video } = await renderStream(null)
    act(() => buffer(video, 300))

    fireEvent.click(slider(), { clientX: 150 })

    expect(video.currentTime).toBe(0)
    expect(screen.getByText('0:00 / -')).toBeInTheDocument()
  })

  it('разворачивается на весь экран, а отказ браузера не роняет плеер', async () => {
    const user = userEvent.setup()
    const { video } = await renderStream()
    video.requestFullscreen = vi.fn(() => Promise.reject(new TypeError('denied')))

    await user.click(screen.getByRole('button', { name: 'Во весь экран' }))

    expect(video.requestFullscreen).toHaveBeenCalledOnce()
  })

  it('контекстное меню с «Сохранить видео» отключено', async () => {
    const { video } = await renderStream()

    expect(fireEvent.contextMenu(video)).toBe(false)
  })
})

describe('ссылка на момент видео', () => {
  function Shared({ videoId, time, rate }: { videoId: string; time: number; rate: number }) {
    const ref = useRef<HTMLVideoElement>(null)
    return <>
      <video ref={(element) => {
        ref.current = element
        if (element) { element.currentTime = time; element.playbackRate = rate }
      }} />
      <VideoShareButton videoRef={ref} videoId={videoId} />
    </>
  }

  it('ведёт на эту секунду и скорость, отбрасывая прочие параметры страницы', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/lessons/demo?token=secret&video=old')
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<Shared videoId="clip:abcd" time={373.9} rate={1.5} />)

    await user.click(screen.getByRole('button', { name: 'Поделиться этим моментом' }))

    expect(write).toHaveBeenCalledWith(`${window.location.origin}/lessons/demo?video=clip%3Aabcd&t=373&rate=1.5`)
    expect(screen.getByRole('status')).toHaveTextContent('Ссылка скопирована')
  })

  it('видео по внешнему адресу и нестандартная скорость в ссылку не попадают', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/lessons/demo')
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<Shared videoId="https://youtu.be/x" time={12} rate={3} />)

    await user.click(screen.getByRole('button', { name: 'Поделиться этим моментом' }))

    expect(write).toHaveBeenCalledWith(`${window.location.origin}/lessons/demo?t=12`)
  })
})

describe('встроенное видео сторонних сервисов', () => {
  it('YouTube встраивается без доступа к своему источнику', () => {
    const { container } = render(<VideoPlayer title="Обзор" videoUrl="https://www.youtube.com/watch?v=abcdefghijk" displayMode="embed" />)

    const frame = container.querySelector('iframe')
    expect(frame).toHaveAttribute('src', 'https://www.youtube.com/embed/abcdefghijk')
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-popups')
    expect(frame).toHaveAttribute('title', 'Обзор')
  })

  it('другой сервис встраивается по исходному адресу и получает доступ к своему источнику', () => {
    const { container } = render(<VideoPlayer title="Вебинар" videoUrl="https://rutube.ru/play/embed/123" displayMode="embed" durationMinutes={45} />)

    const frame = container.querySelector('iframe')
    expect(frame).toHaveAttribute('src', 'https://rutube.ru/play/embed/123')
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-popups')
    expect(screen.getByText(/45 мин/)).toBeInTheDocument()
  })

  it('некорректный адрес из CMS не роняет урок и не принимается за файл медиатеки', () => {
    const { container } = render(<VideoPlayer title="Сломанная ссылка" videoUrl="http://[" displayMode="embed" />)

    expect(screen.getByText('Сломанная ссылка')).toBeInTheDocument()
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('iframe')).toHaveAttribute('src', 'http://[')
  })

  it('у видео медиатеки нет контекстного меню скачивания', () => {
    const { container } = render(<VideoPlayer title="Разбор" videoUrl="/api/media/file/demo.mp4" displayMode="embed" />)

    expect(fireEvent.contextMenu(container.querySelector('video') as HTMLVideoElement)).toBe(false)
  })
})
