import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LessonLearningProvider, learningStorageKey } from '@/components/lesson/LessonLearningProvider'
import { VideoPlayer } from '@/components/lesson/VideoPlayer'
import type { LearningState } from '@/lib/learning-state'

const videoId = 'clip:123'
let server: LearningState
let writes: Record<string, unknown>[]

function player(userId = 1) {
  return render(<LessonLearningProvider key={userId} lessonId={10} userId={userId}>
    <VideoPlayer title="Запись" videoUrl="/api/media/file/demo.mp4" memoryId={videoId} displayMode="embed" />
  </LessonLearningProvider>)
}

function video(container: HTMLElement) {
  const element = container.querySelector('video')
  if (!element) throw new Error('Видео отсутствует')
  return element
}

function metadata(element: HTMLVideoElement) {
  Object.defineProperty(element, 'readyState', { configurable: true, value: 1 })
  Object.defineProperty(element, 'duration', { configurable: true, value: 600 })
  fireEvent.loadedMetadata(element)
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/lessons/demo')
  writes = []
  server = { userId: 1, positions: {}, lastVideoId: null, lastViewedAt: null }
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      writes.push(JSON.parse(String(options.body)) as Record<string, unknown>)
      return Response.json(server)
    }
    return Response.json(server)
  }))
})

describe('синхронизация места остановки', () => {
  it.each([7, 594])('восстанавливает точную серверную позицию %s секунд, включая края ролика', async (seconds) => {
    server.positions[videoId] = { seconds, at: 100, ended: false }
    const { container } = player()
    metadata(video(container))
    await waitFor(() => expect(video(container).currentTime).toBe(seconds))
    expect(await screen.findByText(`Продолжили с ${seconds === 7 ? '0:07' : '9:54'}`)).toBeInTheDocument()
  })

  it('ссылка с временной меткой имеет приоритет над серверной позицией после асинхронного GET', async () => {
    server.positions[videoId] = { seconds: 300, at: 100, ended: false }
    window.history.replaceState(null, '', '/lessons/demo?t=90')
    const { container } = player()
    metadata(video(container))
    await waitFor(() => expect(video(container).currentTime).toBe(90))
  })

  it('изолирует local fallback по аккаунтам и берёт более свежую локальную позицию', async () => {
    server.positions[videoId] = { seconds: 25, at: 100, ended: false }
    localStorage.setItem(learningStorageKey(1, 10, videoId), JSON.stringify({ seconds: 80, at: 200, ended: false }))
    localStorage.setItem(learningStorageKey(2, 10, videoId), JSON.stringify({ seconds: 300, at: 300, ended: false }))
    const { container } = player()
    metadata(video(container))
    await waitFor(() => expect(video(container).currentTime).toBe(80))
    expect(writes).toEqual(expect.arrayContaining([expect.objectContaining({ videoId, seconds: 80, at: 200, expectedUserId: 1 })]))
  })

  it('поздний GET не перематывает уже запущенное видео', async () => {
    let resolve: (response: Response) => void = () => undefined
    vi.stubGlobal('fetch', vi.fn((_: string, options?: RequestInit) => options?.method === 'POST' ? Promise.resolve(Response.json(server)) : new Promise<Response>((done) => { resolve = done })))
    const { container } = player()
    const element = video(container)
    metadata(element)
    fireEvent.play(element)
    element.currentTime = 20
    fireEvent.timeUpdate(element)
    await act(async () => { resolve(Response.json({ ...server, positions: { [videoId]: { seconds: 300, at: 100, ended: false } } })) })
    expect(element.currentTime).toBe(20)
  })

  it('pagehide старой неподвижной вкладки отправляет timestamp исходного события', async () => {
    const { container } = player()
    await waitFor(() => expect(screen.queryByText('Загружаем место остановки…')).not.toBeInTheDocument())
    const element = video(container)
    metadata(element)
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    fireEvent.play(element)
    element.currentTime = 121
    fireEvent.timeUpdate(element)
    fireEvent.pause(element)
    now.mockReturnValue(8000)
    await act(async () => { window.dispatchEvent(new Event('pagehide')) })
    const playbackWrites = writes.filter((write) => write.videoId === videoId)
    expect(playbackWrites.at(-1)).toMatchObject({ seconds: 121, at: 1000 })
    now.mockRestore()
  })

  it('при offline сохраняет локально и повторяет исходную позицию после online', async () => {
    let connected = false
    vi.stubGlobal('fetch', vi.fn(async (_: string, options?: RequestInit) => {
      if (!connected) throw new Error('offline')
      if (options?.method === 'POST') writes.push(JSON.parse(String(options.body)) as Record<string, unknown>)
      return Response.json(server)
    }))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { container } = player()
    await screen.findByText(/Место остановки сохранено на этом устройстве/)
    const element = video(container)
    metadata(element)
    fireEvent.play(element)
    element.currentTime = 42
    fireEvent.timeUpdate(element)
    fireEvent.pause(element)
    expect(JSON.parse(localStorage.getItem(learningStorageKey(1, 10, videoId)) ?? '{}')).toMatchObject({ seconds: 42 })
    connected = true
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(writes).toEqual(expect.arrayContaining([expect.objectContaining({ videoId, seconds: 42 })]))
  })

  it('скрытая вкладка отмечает открытие только при фактическом показе', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    player()
    await waitFor(() => expect(screen.queryByText('Загружаем место остановки…')).not.toBeInTheDocument())
    expect(writes).toEqual([])
    clock.mockReturnValue(9000)
    visibility.mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(writes).toEqual([expect.objectContaining({ at: 9000, lessonId: 10 })])
    clock.mockRestore()
    visibility.mockRestore()
  })

  it('задержанный GET не переносит timestamp реального открытия на время ответа', async () => {
    let resolve: (response: Response) => void = () => undefined
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    vi.stubGlobal('fetch', vi.fn((_: string, options?: RequestInit) => {
      if (options?.method === 'POST') { writes.push(JSON.parse(String(options.body)) as Record<string, unknown>); return Promise.resolve(Response.json(server)) }
      return new Promise<Response>((done) => { resolve = done })
    }))
    player()
    clock.mockReturnValue(9000)
    await act(async () => { resolve(Response.json(server)) })
    expect(writes).toEqual([expect.objectContaining({ at: 1000 })])
    clock.mockRestore()
  })

  it('отменённый GET первого StrictMode effect не открывает урок и не снимает loading второго', async () => {
    const resolves: ((response: Response) => void)[] = []
    vi.stubGlobal('fetch', vi.fn((_: string, options?: RequestInit) => {
      if (options?.method === 'POST') { writes.push(JSON.parse(String(options.body)) as Record<string, unknown>); return Promise.resolve(Response.json(server)) }
      return new Promise<Response>((done) => { resolves.push(done) })
    }))
    render(<StrictMode><LessonLearningProvider lessonId={10} userId={1}><span>Контент</span></LessonLearningProvider></StrictMode>)
    expect(resolves).toHaveLength(2)
    await act(async () => { resolves[0](Response.json(server)) })
    expect(screen.getByText('Загружаем место остановки…')).toBeInTheDocument()
    expect(writes).toEqual([])
    await act(async () => { resolves[1](Response.json(server)) })
    expect(writes).toHaveLength(1)
  })

  it('ended хранится отдельно, повторный вход начинает сначала, пользователь может явно перезапустить', async () => {
    server.positions[videoId] = { seconds: 600, at: 100, ended: true }
    const { container } = player()
    metadata(video(container))
    await waitFor(() => expect(screen.queryByText('Загружаем место остановки…')).not.toBeInTheDocument())
    expect(video(container).currentTime).toBe(0)
    expect(screen.queryByText(/Продолжили с/)).not.toBeInTheDocument()
  })
})
