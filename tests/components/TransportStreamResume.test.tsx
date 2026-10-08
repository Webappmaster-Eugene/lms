import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const players = vi.hoisted(() => ({ create: vi.fn(), destroy: vi.fn() }))
vi.mock('mpegts.js', () => ({
  default: {
    Events: { ERROR: 'error' },
    isSupported: () => true,
    createPlayer: players.create,
  },
}))

import { LessonLearningProvider } from '@/components/lesson/LessonLearningProvider'
import { TransportStreamPlayer } from '@/components/lesson/TransportStreamPlayer'

const videoId = 'recording:hash'
const failure = vi.fn()

function setBuffer(video: HTMLVideoElement, end: number) {
  Object.defineProperty(video, 'buffered', { configurable: true, value: { length: 1, start: () => 0, end: () => end } })
  fireEvent.progress(video)
}

function renderStream(seconds: number) {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ userId: 1, positions: { [videoId]: { seconds, at: 100, ended: false } }, lastVideoId: videoId, lastViewedAt: null })))
  const rendered = render(<LessonLearningProvider userId={1} lessonId={10}>
    <TransportStreamPlayer src="/api/yandex-disk/proxy?lesson=10&block=recording" memoryKey={videoId} durationMinutes={90} onFailure={failure} />
  </LessonLearningProvider>)
  const video = rendered.container.querySelector('video')
  if (!video) throw new Error('Видео отсутствует')
  return { ...rendered, video }
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/lessons/stream')
  players.create.mockImplementation(() => ({
    on: vi.fn(), load: vi.fn(), destroy: players.destroy,
    attachMediaElement: (video: HTMLVideoElement) => { video.currentTime = 0 },
  }))
})

describe('возврат к длинному видео MPEG-TS', () => {
  it('серверные65мин увеличивают загрузку до66мин; очистка ожидания не пересоздаёт и не сбрасывает плеер', async () => {
    const { video } = renderStream(65 * 60)
    await screen.findByText(/Подготавливаем продолжение с 1:05:00/)
    await waitFor(() => expect(players.create.mock.calls.at(-1)?.[1]).toMatchObject({ lazyLoad: true, lazyLoadMaxDuration: 66 * 60 }))
    expect(video.paused).toBe(true)
    expect(video.currentTime).toBe(0)
    act(() => setBuffer(video, 30 * 60))
    expect(video.currentTime).toBe(0)
    const count = players.create.mock.calls.length
    const destroyed = players.destroy.mock.calls.length
    act(() => setBuffer(video, 65 * 60 + 0.2))
    await screen.findByText('Продолжили с 1:05:00')
    expect(video.currentTime).toBe(65 * 60)
    expect(screen.queryByText(/Подготавливаем продолжение/)).not.toBeInTheDocument()
    await act(async () => { fireEvent.canPlay(video) })
    expect(players.create).toHaveBeenCalledTimes(count)
    expect(players.destroy).toHaveBeenCalledTimes(destroyed)
    expect(video.currentTime).toBe(65 * 60)
    expect(failure).not.toHaveBeenCalled()
  })

  it('точная пауза в последней доле секунды восстанавливается из доступного буфера', async () => {
    const { video } = renderStream(599)
    await screen.findByText(/Подготавливаем продолжение с 9:59/)
    act(() => setBuffer(video, 599.2))
    expect(video.currentTime).toBe(599)
    expect(screen.getByText('Продолжили с 9:59')).toBeInTheDocument()
  })
})
