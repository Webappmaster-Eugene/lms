import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) }))

vi.mock('react-markdown', async () => (await import('../helpers/component-mocks')).markdownMock())
vi.mock('remark-gfm', () => ({ default: () => {} }))
vi.mock('rehype-raw', () => ({ default: () => {} }))

const createPlayer = vi.fn()
const destroy = vi.fn()
const load = vi.fn()
vi.mock('mpegts.js', () => ({
  default: {
    Events: { ERROR: 'error', LOADING_COMPLETE: 'loading_complete' },
    isSupported: () => true,
    createPlayer: (...args: unknown[]) => {
      createPlayer(...args)
      return {
        attachMediaElement: vi.fn(),
        load,
        play: vi.fn(),
        destroy,
        on: vi.fn(),
        unload: vi.fn(),
        detachMediaElement: vi.fn(),
      }
    },
  },
}))

const { VideoPlayer } = await import('@/components/lesson/VideoPlayer')
const { MarkdownRenderer } = await import('@/components/lesson/MarkdownRenderer')
const { TransportStreamPlayer } = await import('@/components/lesson/TransportStreamPlayer')

/**
 * Видео и текстовые материалы урока.
 *
 * Видео с Яндекс.Диска отдаётся через свой прокси, иначе CDN отвечает 403
 * из-за referer, а контейнер MPEG-TS нативный плеер показывает эфиром
 * без шкалы перемотки.
 */

describe('плеер урока', () => {
  const base = { title: 'Введение в Node.js', displayMode: 'embed' as const }

  it('режим ссылки отдаёт ссылку, а не кадр', () => {
    render(<VideoPlayer {...base} displayMode="link" videoUrl="https://disk.yandex.ru/i/abc" />)

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://disk.yandex.ru/i/abc')
  })

  it('заголовок виден в обоих режимах', () => {
    render(<VideoPlayer {...base} displayMode="link" videoUrl="https://disk.yandex.ru/i/abc" />)

    expect(screen.getByText('Введение в Node.js')).toBeInTheDocument()
  })

  it('описание показывается, когда задано', () => {
    render(
      <VideoPlayer
        {...base}
        displayMode="link"
        videoUrl="https://disk.yandex.ru/i/abc"
        description="Разбираем event loop"
      />,
    )

    expect(screen.getByText('Разбираем event loop')).toBeInTheDocument()
  })

  it('длительность подписана — по ней планируют время на урок', () => {
    render(
      <VideoPlayer
        {...base}
        displayMode="link"
        videoUrl="https://disk.yandex.ru/i/abc"
        durationMinutes={14}
      />,
    )

    expect(screen.getByText(/14/)).toBeInTheDocument()
  })

  it('ролик с YouTube встраивается через embed-адрес', () => {
    const { container } = render(
      <VideoPlayer {...base} videoUrl="https://www.youtube.com/watch?v=abc123" />,
    )

    expect(container.querySelector('iframe')?.getAttribute('src')).toContain(
      'youtube.com/embed/abc123',
    )
  })

  it('короткая ссылка youtu.be тоже распознаётся', () => {
    const { container } = render(<VideoPlayer {...base} videoUrl="https://youtu.be/abc123" />)

    expect(container.querySelector('iframe')?.getAttribute('src')).toContain('/embed/abc123')
  })

  it('видео с Яндекс.Диска идёт через наш сервер, а не напрямую на CDN', () => {
    const { container } = render(
      <VideoPlayer {...base} videoUrl="https://disk.yandex.ru/i/abc" />,
    )

    // Прямая ссылка на CDN Яндекса отдаёт 403 из-за referer.
    const source = container.querySelector('video')?.getAttribute('src') ?? ''
    expect(source).toContain('/api/yandex-disk/')
    expect(source).toContain(encodeURIComponent('https://disk.yandex.ru/i/abc'))
  })

  it('встроенный кадр в песочнице без доступа к платформе', () => {
    const { container } = render(
      <VideoPlayer {...base} videoUrl="https://www.youtube.com/watch?v=abc123" />,
    )

    expect(container.querySelector('iframe')?.getAttribute('sandbox')).toContain('allow-scripts')
  })
})

describe('плеер потока MPEG-TS', () => {
  beforeEach(() => vi.clearAllMocks())

  it('поднимает свой плеер — нативный показал бы поток эфиром', async () => {
    render(
      <TransportStreamPlayer
        src="/api/yandex-disk/stream?url=x"
        memoryKey="https://disk.yandex.ru/i/x"
        durationMinutes={10}
        onFailure={vi.fn()}
      />,
    )

    await waitFor(() => expect(createPlayer).toHaveBeenCalled())
  })

  it('плеер разбирается при размонтировании', async () => {
    const { unmount } = render(
      <TransportStreamPlayer
        src="/api/yandex-disk/stream?url=x"
        memoryKey="https://disk.yandex.ru/i/x"
        durationMinutes={10}
        onFailure={vi.fn()}
      />,
    )

    await waitFor(() => expect(createPlayer).toHaveBeenCalled())
    unmount()

    await waitFor(() => expect(destroy).toHaveBeenCalled())
  })

  it('на экране есть элемент видео', () => {
    const { container } = render(
      <TransportStreamPlayer
        src="/api/yandex-disk/stream?url=x"
        memoryKey="https://disk.yandex.ru/i/x"
        durationMinutes={10}
        onFailure={vi.fn()}
      />,
    )

    expect(container.querySelector('video')).toBeInTheDocument()
  })

  it('обновление страницы урока сохраняет плеер и позицию защищённого TS-видео', async () => {
    const props = { title: 'Урок', displayMode: 'embed' as const, videoUrl: '/api/yandex-disk/stream?lesson=42&block=ts&format=ts', durationMinutes: 10 }
    const { container, rerender } = render(<VideoPlayer {...props} />)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    if (!video) throw new Error('Видео не отрисовалось')
    video.currentTime = 31
    fireEvent.timeUpdate(video)

    await act(async () => {
      rerender(<VideoPlayer {...props} description="Урок пройден" />)
      await Promise.resolve()
    })

    expect(container.querySelector('video')).toBe(video)
    expect(video.currentTime).toBe(31)
    expect(destroy).not.toHaveBeenCalled()
    expect(createPlayer).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('разметка материалов урока', () => {
  it('текст выводится', () => {
    render(<MarkdownRenderer content="# Заголовок" />)

    expect(screen.getByTestId('markdown')).toHaveTextContent('# Заголовок')
  })

  it('пустой текст не ломает урок', () => {
    render(<MarkdownRenderer content="" />)

    expect(screen.getByTestId('markdown')).toBeInTheDocument()
  })
})
