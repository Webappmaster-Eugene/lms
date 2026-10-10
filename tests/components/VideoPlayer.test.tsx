import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/use-video-memory', () => ({ useVideoMemory: () => ({}) }))
vi.mock('@/components/lesson/VideoMemoryBar', () => ({ VideoMemoryBar: () => null }))
vi.mock('@/components/lesson/TransportStreamPlayer', () => ({ TransportStreamPlayer: ({ src, onFailure }: { src: string; onFailure: () => void }) => <button data-testid="transport-stream" data-src={src} onClick={onFailure}>Ошибка потока</button> }))

const { VideoPlayer } = await import('@/components/lesson/VideoPlayer')

describe('встроенное воспроизведение видео', () => {
  it('проигрывает видео медиатеки нативно, без iframe и обращения к API Яндекса', () => {
    const url = 'https://learn.mentorcareer.ru/api/media/file/repaired.mp4'
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)

    expect(container.querySelector('video')).toHaveAttribute('src', url)
    expect(container.querySelector('iframe')).not.toBeInTheDocument()
  })

  it('сохраняет внешний режим, явно выбранный для видео медиатеки', () => {
    const url = 'https://learn.mentorcareer.ru/api/media/file/repaired.mp4'
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="link" />)

    expect(screen.getByRole('link', { name: /Смотреть/ })).toHaveAttribute('href', url)
    expect(container.querySelector('video')).not.toBeInTheDocument()
  })

  it('при отказе локального файла показывает ссылку без запуска MPEG-TS прокси', () => {
    const url = 'https://learn.mentorcareer.ru/api/media/file/repaired.mp4'
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    if (video) fireEvent.error(video)

    expect(screen.getByRole('link', { name: /Смотреть/ })).toHaveAttribute('href', url)
    expect(screen.queryByTestId('transport-stream')).not.toBeInTheDocument()
  })

  it('продолжает получать видео Яндекс Диска через авторизованный stream', () => {
    const url = 'https://disk.yandex.ru/d/key/lesson.mp4'
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)

    expect(container.querySelector('video')).toHaveAttribute('src', `/api/yandex-disk/stream?url=${encodeURIComponent(url)}`)
  })

  it('сохраняет iframe для YouTube', () => {
    const { container } = render(<VideoPlayer title="Урок" videoUrl="https://www.youtube.com/watch?v=abcdefghijk" displayMode="embed" />)

    expect(container.querySelector('iframe')).toHaveAttribute('src', 'https://www.youtube.com/embed/abcdefghijk')
  })

  it('видео ученика всегда остаётся в LMS, даже при link-mode и ошибках обоих плееров', () => {
    const url = '/api/yandex-disk/stream?lesson=42&block=video-1'
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="link" />)
    const video = container.querySelector('video')
    expect(video).toHaveAttribute('src', url)
    expect(video).toHaveAttribute('controlsList', 'nodownload')
    if (video) fireEvent.error(video)
    expect(screen.getByTestId('transport-stream')).toHaveAttribute('data-src', '/api/yandex-disk/proxy?lesson=42&block=video-1')
    fireEvent.click(screen.getByTestId('transport-stream'))
    expect(screen.getByRole('alert')).toHaveTextContent('Видео не удалось загрузить')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.querySelector('iframe')).not.toBeInTheDocument()
  })

  it('Media ученика не отправляется в MPEG-TS и не предлагает скачать исходник', () => {
    const { container } = render(<VideoPlayer title="Урок" videoUrl="/api/yandex-disk/stream?lesson=42&block=v&source=media" displayMode="embed" />)
    const video = container.querySelector('video')
    if (video) fireEvent.error(video)
    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.queryByTestId('transport-stream')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('TS по закрытому адресу сразу использует потоковый плеер', () => {
    render(<VideoPlayer title="Урок" videoUrl="/api/yandex-disk/stream?lesson=42&block=v&format=ts" displayMode="embed" />)
    expect(screen.getByTestId('transport-stream')).toHaveAttribute('data-src', '/api/yandex-disk/proxy?lesson=42&block=v&format=ts')
  })
})

describe('подготовка видимого видео без конкуренции фоновых записей', () => {
  const observed: { element: Element; reveal: () => void }[] = []
  const disconnect = vi.fn()
  beforeEach(() => {
    observed.length = 0
    disconnect.mockClear()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
      observe(element: Element) { observed.push({ element, reveal: () => this.callback([{ isIntersecting: true }]) }) }
      disconnect = disconnect
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'connection')
  })

  it('подготавливает только видео рядом с экраном; другие записи не качаются в фоне', () => {
    const { container, unmount } = render(<>
      <VideoPlayer title="Первое" videoUrl="/api/yandex-disk/stream?lesson=1&block=a" displayMode="embed" />
      <VideoPlayer title="Второе" videoUrl="/api/yandex-disk/stream?lesson=1&block=b" displayMode="embed" />
    </>)
    const videos = container.querySelectorAll('video')
    expect(videos[0]).toHaveAttribute('preload', 'none')
    expect(videos[1]).toHaveAttribute('preload', 'none')
    act(() => observed[0].reveal())
    expect(videos[0]).toHaveAttribute('preload', 'auto')
    expect(videos[1]).toHaveAttribute('preload', 'none')
    expect(disconnect).toHaveBeenCalledOnce()
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(3)
  })

  it.each([{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }])('учитывает экономию трафика/медленную сеть %j', (connection) => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: connection })
    const { container } = render(<VideoPlayer title="Урок" videoUrl="/api/yandex-disk/stream?lesson=1&block=a" displayMode="embed" />)
    act(() => observed[0].reveal())
    expect(container.querySelector('video')).toHaveAttribute('preload', 'metadata')
  })

  it('без IntersectionObserver сохраняет совместимый metadata preload', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = render(<VideoPlayer title="Урок" videoUrl="/api/yandex-disk/stream?lesson=1&block=a" displayMode="embed" />)
    expect(container.querySelector('video')).toHaveAttribute('preload', 'metadata')
  })

  it('фоновая вкладка не скачивает даже видимое видео; активация подготавливает его и удаляет подписку', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const addListener = vi.spyOn(document, 'addEventListener')
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause')
    const { container, unmount } = render(<VideoPlayer title="Урок" videoUrl="/api/yandex-disk/stream?lesson=1&block=a" displayMode="embed" />)
    const video = container.querySelector('video')
    act(() => observed[0].reveal())
    expect(video).toHaveAttribute('preload', 'none')
    expect(disconnect).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(video).toHaveAttribute('preload', 'auto')
    expect(disconnect).toHaveBeenCalledOnce()
    const subscribed = addListener.mock.calls.find(([event]) => event === 'visibilitychange')
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', subscribed?.[1])
    visibility.mockReturnValue('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(video).toHaveAttribute('preload', 'auto')
    expect(pause).not.toHaveBeenCalled()
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(2)
  })

  it('закрытие фоновой вкладки снимает ожидание активации и игнорирует поздний observer callback', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const { container, unmount } = render(<VideoPlayer title="Урок" videoUrl="/api/yandex-disk/stream?lesson=1&block=a" displayMode="embed" />)
    const video = container.querySelector('video')
    act(() => observed[0].reveal())
    unmount()
    expect(removeListener.mock.calls.some(([event]) => event === 'visibilitychange')).toBe(true)
    visibility.mockReturnValue('visible')
    act(() => { document.dispatchEvent(new Event('visibilitychange')); observed[0].reveal() })
    expect(video).toHaveAttribute('preload', 'none')
  })

  it('без IntersectionObserver тоже ждёт активации вкладки перед metadata preload', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const { container } = render(<VideoPlayer title="Урок" videoUrl="/api/yandex-disk/stream?lesson=1&block=a" displayMode="embed" />)
    expect(container.querySelector('video')).toHaveAttribute('preload', 'none')
    visibility.mockReturnValue('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(container.querySelector('video')).toHaveAttribute('preload', 'metadata')
  })
})
