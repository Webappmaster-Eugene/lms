import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/use-video-memory', () => ({ useVideoMemory: () => ({}) }))
vi.mock('@/components/lesson/VideoMemoryBar', () => ({ VideoMemoryBar: () => null }))
vi.mock('@/components/lesson/TransportStreamPlayer', () => ({ TransportStreamPlayer: () => <div data-testid="transport-stream" /> }))

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
})
