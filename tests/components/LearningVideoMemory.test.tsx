import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }))
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
  it('серверная позиция сразу доступна плееру без дополнительного GET', async () => {
    server.positions[videoId] = { seconds: 42, at: 100, ended: false }
    const { container } = render(<LessonLearningProvider lessonId={10} userId={1} initialState={server}>
      <VideoPlayer title="Запись" videoUrl="/api/media/file/demo.mp4" memoryId={videoId} displayMode="embed" />
    </LessonLearningProvider>)
    expect(screen.queryByText('Загружаем место остановки…')).not.toBeInTheDocument()
    metadata(video(container))
    expect(video(container).currentTime).toBe(42)
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => options?.method === 'POST')).toBe(true)
  })

  it('не применяет начальную позицию другого аккаунта', async () => {
    server.positions[videoId] = { seconds: 7, at: 100, ended: false }
    const initialState = { ...server, userId: 2, positions: { [videoId]: { seconds: 500, at: 200, ended: false } } }
    const { container } = render(<LessonLearningProvider lessonId={10} userId={1} initialState={initialState}>
      <VideoPlayer title="Запись" videoUrl="/api/media/file/demo.mp4" memoryId={videoId} displayMode="embed" />
    </LessonLearningProvider>)
    metadata(video(container))
    await waitFor(() => expect(video(container).currentTime).toBe(7))
    expect(vi.mocked(fetch).mock.calls.some(([, options]) => options?.method !== 'POST')).toBe(true)
  })

  it('StrictMode и готовая серверная позиция фиксируют только одно открытие', async () => {
    render(<StrictMode><LessonLearningProvider lessonId={10} userId={1} initialState={server}><span>Контент</span></LessonLearningProvider></StrictMode>)
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ lessonId: 10, expectedUserId: 1 })
  })

  it('начальная серверная позиция не превращает скрытую вкладку в просмотр', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    render(<LessonLearningProvider lessonId={10} userId={1} initialState={server}><span>Контент</span></LessonLearningProvider>)
    await act(async () => { await Promise.resolve() })
    expect(fetch).not.toHaveBeenCalled()
    visibility.mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(writes).toHaveLength(1)
    visibility.mockRestore()
  })

  it('явная ссылка выбирает только своё видео и скорость; смена rate не повторяет перемотку', async () => {
    const otherId = 'second:456'
    server.positions[videoId] = { seconds: 12, at: 100, ended: false }
    server.positions[otherId] = { seconds: 300, at: 100, ended: false }
    window.history.replaceState(null, '', `/lessons/demo?video=${otherId}&t=90&rate=1.75`)
    const view = render(<LessonLearningProvider lessonId={10} userId={1}>
      <VideoPlayer title="Первая запись" videoUrl="/api/media/file/first.mp4" memoryId={videoId} displayMode="embed" />
      <VideoPlayer title="Вторая запись" videoUrl="/api/media/file/second.mp4" memoryId={otherId} displayMode="embed" />
    </LessonLearningProvider>)
    const videos = view.container.querySelectorAll('video')
    metadata(videos[0]); metadata(videos[1])
    await waitFor(() => expect(videos[1].currentTime).toBe(90))
    expect(videos[0].currentTime).toBe(12)
    expect(videos[0].playbackRate).toBe(1)
    expect(videos[1].playbackRate).toBe(1.75)
    videos[1].currentTime = 110
    videos[1].playbackRate = 1.5
    fireEvent.rateChange(videos[1])
    await waitFor(() => expect(window.location.search).toContain('rate=1.5'))
    expect(videos[1].currentTime).toBe(110)
  })

  it('SPA-переход между явными метками возвращает точное место, сохраняя личный прогресс', async () => {
    server.positions[videoId] = { seconds: 300, at: 100, ended: false }
    window.history.replaceState(null, '', '/lessons/demo?t=373&rate=1.5')
    const view = player()
    metadata(video(view.container))
    await waitFor(() => expect(video(view.container).currentTime).toBe(373))
    expect(video(view.container).playbackRate).toBe(1.5)
    window.history.replaceState(null, '', '/lessons/demo?t=90&rate=2')
    view.rerender(<LessonLearningProvider key={1} lessonId={10} userId={1}><VideoPlayer title="Запись" videoUrl="/api/media/file/demo.mp4" memoryId={videoId} displayMode="embed" /></LessonLearningProvider>)
    await waitFor(() => expect(video(view.container).currentTime).toBe(90))
    expect(video(view.container).playbackRate).toBe(2)
    expect(writes.some((write) => write.videoId === videoId)).toBe(false)
  })
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
