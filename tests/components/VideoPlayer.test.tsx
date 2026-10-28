import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'

vi.mock('@/hooks/use-video-memory', () => ({ useVideoMemory: () => ({}) }))
vi.mock('@/components/lesson/VideoMemoryBar', () => ({ VideoMemoryBar: () => null }))
vi.mock('@/components/lesson/TransportStreamPlayer', () => ({ TransportStreamPlayer: ({ src, onFailure }: { src: string; onFailure: (reason?: 'unsupported' | 'network') => void }) => (
  <>
    <button data-testid="transport-stream" data-src={src} onClick={() => onFailure()}>Ошибка потока</button>
    <button onClick={() => onFailure('network')}>Обрыв сети</button>
    <button onClick={() => onFailure('unsupported')}>Браузер без MediaSource</button>
  </>
) }))

const { VideoPlayer } = await import('@/components/lesson/VideoPlayer')

const fetchMock = vi.fn()
/** Два пакета MPEG-TS: синхробайт 0x47 в начале каждого. */
const transportStream = (() => { const bytes = new Uint8Array(376); bytes[0] = 0x47; bytes[188] = 0x47; return bytes })()
const sourceResponse = (bytes: Uint8Array) => new Response(bytes.slice().buffer as ArrayBuffer, { status: 206 })
/** Начало обычного MP4: бокс ftyp, а не синхробайт потока. */
const mp4Head = new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112])
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const failNative = async (container: HTMLElement) => {
  const video = container.querySelector('video')
  expect(video).not.toBeNull()
  if (video) fireEvent.error(video)
  await flush()
}
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { vi.unstubAllGlobals() })

describe('встроенное воспроизведение видео', () => {
  it('восстанавливает собеседование через его защищённый адрес без исходной ссылки и iframe', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockResolvedValue(new Response(null, { status: 502 }))
      const url = '/api/interviews/63/stream'
      const { container } = render(<VideoPlayer title="Запись собеседования" videoUrl={url} displayMode="embed" />)
      expect(container.querySelector('video')).toHaveAttribute('src', url)
      expect(container.querySelector('video')).toHaveAttribute('aria-label', 'Собеседование: Запись собеседования')
      expect(container.querySelector('iframe')).not.toBeInTheDocument()
      for (const delay of [2000, 5000]) {
        await failNative(container)
        expect(fetchMock).toHaveBeenLastCalledWith(url, expect.objectContaining({ headers: { Range: 'bytes=0-375' } }))
        await wait(delay)
      }
      await failNative(container)
      expect(screen.getByRole('alert')).toHaveTextContent('Хранилище записей не отдало этот файл')
      expect(screen.queryByText(/заметки урока/)).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Яндекс Диске/ })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
      expect(container.querySelector('video')).toHaveAttribute('src', `${url}?playbackAttempt=3`)
    } finally {
      vi.useRealTimers()
    }
  })

  it('переключает MPEG-TS собеседования на потоковый плеер с сохранением проверки доступа', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockResolvedValue(sourceResponse(transportStream))
      const url = '/api/interviews/62/stream'
      const { container } = render(<VideoPlayer title="Собеседование" videoUrl={url} displayMode="embed" />)
      await failNative(container)
      expect(screen.getByTestId('transport-stream')).toHaveAttribute('data-src', `${url}?playbackAttempt=1`)
      expect(container.querySelector('video')).not.toBeInTheDocument()
      expect(fetchMock.mock.calls.every(([target]) => target === url)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

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

  it('видео ученика всегда остаётся в LMS: поток под именем .mp4 уходит в потоковый плеер, а не наружу', async () => {
    fetchMock.mockImplementation(async () => sourceResponse(transportStream))
    const url = '/api/yandex-disk/stream?lesson=42&block=video-1'
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="link" />)
    const video = container.querySelector('video')
    expect(video).toHaveAttribute('src', url)
    expect(video).toHaveAttribute('controlsList', 'nodownload')
    if (video) fireEvent.error(video)
    expect(await screen.findByTestId('transport-stream')).toHaveAttribute('data-src', '/api/yandex-disk/proxy?lesson=42&block=video-1&playbackAttempt=1')
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ headers: { Range: 'bytes=0-375' }, credentials: 'same-origin' }))
    fireEvent.click(screen.getByRole('button', { name: 'Браузер без MediaSource' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Этот браузер не может воспроизвести запись')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.querySelector('iframe')).not.toBeInTheDocument()
  })

  it('TS по закрытому адресу сразу использует потоковый плеер', () => {
    render(<VideoPlayer title="Урок" videoUrl="/api/yandex-disk/stream?lesson=42&block=v&format=ts" displayMode="embed" />)
    expect(screen.getByTestId('transport-stream')).toHaveAttribute('data-src', '/api/yandex-disk/proxy?lesson=42&block=v&format=ts')
  })
})

describe('отказ плеера в уроке', () => {
  const url = '/api/yandex-disk/stream?lesson=42&block=v'
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('останавливает старую загрузку; поздняя ошибка старого видео не отменяет новый запуск', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }))
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load')
    const { container, unmount } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)
    const previous = container.querySelector('video')
    if (!previous) throw new Error('Видео отсутствует')
    await failNative(container)
    expect(previous).not.toHaveAttribute('src')
    expect(load).toHaveBeenCalledOnce()
    await wait(2000)
    const current = container.querySelector('video')
    expect(current).not.toBe(previous)
    expect(current).toHaveAttribute('src', `${url}&playbackAttempt=1`)
    fireEvent.error(previous)
    await flush()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(container.querySelector('video')).toBe(current)
    unmount()
    expect(current).not.toHaveAttribute('src')
    expect(load).toHaveBeenCalledTimes(2)
    load.mockRestore()
  })

  it('StrictMode восстанавливает источник после пробной отмены и сохраняет обработку ошибок', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }))
    const { container } = render(<StrictMode><VideoPlayer title="Урок" videoUrl={url} displayMode="embed" /></StrictMode>)
    expect(container.querySelector('video')).toHaveAttribute('src', url)
    await failNative(container)
    expect(fetchMock).toHaveBeenCalledOnce()
    await wait(2000)
    expect(container.querySelector('video')).toHaveAttribute('src', `${url}&playbackAttempt=1`)
  })

  it('доступное начало файла не доказывает несовместимость браузера; повтор запрашивает новый ресурс', async () => {
    fetchMock.mockImplementation(async () => sourceResponse(mp4Head))
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)

    await failNative(container)
    expect(screen.getByRole('status')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await wait(2000)
    expect(container.querySelector('video')).toHaveAttribute('src', `${url}&playbackAttempt=1`)

    await failNative(container)
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось воспроизвести запись')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    expect(container.querySelector('video')).toHaveAttribute('src', `${url}&playbackAttempt=2`)
  })

  it('Media ученика не отправляется в MPEG-TS и не предлагает скачать исходник', async () => {
    fetchMock.mockImplementation(async () => sourceResponse(transportStream))
    const { container } = render(<VideoPlayer title="Урок" videoUrl={`${url}&source=media`} displayMode="embed" />)
    await failNative(container)
    await wait(2000)
    await failNative(container)
    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.queryByTestId('transport-stream')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('администратор при отказе воспроизведения не теряет ссылку на исходник', async () => {
    const raw = 'https://disk.yandex.ru/d/key/lesson.mkv'
    fetchMock.mockImplementation(async () => sourceResponse(mp4Head))
    const { container } = render(<VideoPlayer title="Урок" videoUrl={raw} displayMode="embed" />)
    await failNative(container)
    await wait(2000)
    await failNative(container)
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось воспроизвести запись')
    expect(screen.getByRole('link', { name: /Открыть на Яндекс Диске/ })).toHaveAttribute('href', raw)
  })

  it('потоковый плеер различает отказ воспроизведения и подтверждённый обрыв сети', async () => {
    fetchMock.mockImplementation(async () => sourceResponse(transportStream))
    render(<VideoPlayer title="Урок" videoUrl={`${url}&format=ts`} displayMode="embed" />)

    fireEvent.click(screen.getByRole('button', { name: 'Ошибка потока' }))
    await flush()
    await wait(2000)
    fireEvent.click(screen.getByRole('button', { name: 'Ошибка потока' }))
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось воспроизвести запись')

    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    for (const pause of [2000, 5000]) {
      fireEvent.click(screen.getByRole('button', { name: 'Обрыв сети' }))
      await flush()
      expect(screen.getByRole('status')).toBeVisible()
      await wait(pause)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Обрыв сети' }))
    await flush()
    expect(screen.getByRole('alert')).toHaveTextContent('Видео сейчас не загружается')
  })

  it('сбои, разнесённые во времени, — разные происшествия: счёт повторов начинается заново', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }))
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)
    await failNative(container)
    await wait(2000)
    await failNative(container)
    await wait(5000)
    await wait(180_000)
    await failNative(container)
    expect(screen.getByRole('status')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('повторяет загрузку сама и только после этого показывает понятное сообщение с кнопкой', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Хранилище не отдало файл. Попробуйте позже' }), { status: 502 }))
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)

    await failNative(container)
    expect(screen.getByRole('status')).toHaveTextContent('пробуем ещё раз')
    expect(container.querySelector('video')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(container.querySelector('video')).toHaveAttribute('src', `${url}&playbackAttempt=1`)

    await failNative(container)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(container.querySelector('video')).toHaveAttribute('src', `${url}&playbackAttempt=2`)

    await failNative(container)
    expect(screen.getByRole('alert')).toHaveTextContent('Видео сейчас не загружается')
    expect(screen.getByRole('alert')).toHaveTextContent('Текст, файлы и заметки урока доступны')
    expect(screen.queryByTestId('transport-stream')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)

    fireEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    expect(container.querySelector('video')).toHaveAttribute('src', `${url}&playbackAttempt=3`)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('пустой ответ и сетевой сбой проверки считаются недоступным источником, а не форматом', async () => {
    fetchMock.mockResolvedValueOnce(sourceResponse(new Uint8Array())).mockRejectedValueOnce(new TypeError('fetch failed'))
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)
    await failNative(container)
    expect(screen.getByRole('status')).toBeVisible()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await failNative(container)
    expect(screen.getByRole('status')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('обрезанное начало с обещанным Content-Length не считается исправным файлом или MPEG-TS', async () => {
    fetchMock.mockImplementation(async () => new Response(new Uint8Array([0x47]), { status: 206, headers: { 'Content-Length': '376' } }))
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)
    await failNative(container)
    expect(screen.queryByTestId('transport-stream')).not.toBeInTheDocument()
    await wait(2000)
    await failNative(container)
    expect(screen.getByRole('status')).toBeVisible()
    await wait(5000)
    await failNative(container)
    expect(screen.getByRole('alert')).toHaveTextContent('Видео сейчас не загружается')
  })

  it('обрыв сети посреди просмотра повторяется, даже если начало файла снова отвечает', async () => {
    fetchMock.mockImplementation(async () => sourceResponse(new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112])))
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'error', { value: { code: 2 }, configurable: true })
    fireEvent.error(video)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('status')).toBeVisible()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(container.querySelector('video')).toHaveAttribute('src', `${url}&playbackAttempt=1`)
  })

  it('сбой во время просмотра: перезапущенный плеер сам продолжает, второй сбой до старта тоже', async () => {
    fetchMock.mockImplementation(async () => sourceResponse(mp4Head))
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)
    const watched = container.querySelector('video') as HTMLVideoElement
    expect(play).not.toHaveBeenCalled()
    fireEvent.play(watched)
    Object.defineProperty(watched, 'error', { value: { code: 2 }, configurable: true })
    fireEvent.error(watched)
    await flush()
    await wait(2000)
    const resumed = container.querySelector('video') as HTMLVideoElement
    expect(resumed).toHaveAttribute('src', `${url}&playbackAttempt=1`)
    expect(play.mock.contexts).toEqual([resumed])

    // Новый плеер ещё не заиграл, но ученик смотреть не передумал.
    Object.defineProperty(resumed, 'error', { value: { code: 2 }, configurable: true })
    fireEvent.error(resumed)
    await flush()
    await wait(5000)
    const again = container.querySelector('video') as HTMLVideoElement
    expect(again).toHaveAttribute('src', `${url}&playbackAttempt=2`)
    expect(play.mock.contexts.at(-1)).toBe(again)
    play.mockRestore()
  })

  it('сбой после паузы не запускает видео само', async () => {
    fetchMock.mockImplementation(async () => sourceResponse(mp4Head))
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)
    const watched = container.querySelector('video') as HTMLVideoElement
    fireEvent.play(watched)
    fireEvent.pause(watched)
    Object.defineProperty(watched, 'error', { value: { code: 2 }, configurable: true })
    fireEvent.error(watched)
    await flush()
    await wait(2000)
    expect(container.querySelector('video')).toHaveAttribute('src', `${url}&playbackAttempt=1`)
    expect(play).not.toHaveBeenCalled()
    play.mockRestore()
  })

  it('запрет автозапуска оставляет видео на паузе без сообщения об ошибке', async () => {
    fetchMock.mockImplementation(async () => sourceResponse(mp4Head))
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new DOMException('blocked', 'NotAllowedError'))
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)
    const watched = container.querySelector('video') as HTMLVideoElement
    fireEvent.play(watched)
    Object.defineProperty(watched, 'error', { value: { code: 2 }, configurable: true })
    fireEvent.error(watched)
    await flush()
    await wait(2000)
    expect(play).toHaveBeenCalledOnce()
    expect(container.querySelector('video')).toHaveAttribute('src', `${url}&playbackAttempt=1`)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    play.mockRestore()
  })

  it('администратор с исходной ссылкой получает те же повторы и ссылку на Диск, а ученик ссылки не видит', async () => {
    const raw = 'https://disk.yandex.ru/d/key/lesson.mp4'
    const stream = `/api/yandex-disk/stream?url=${encodeURIComponent(raw)}`
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }))
    const { container, unmount } = render(<VideoPlayer title="Урок" videoUrl={raw} displayMode="embed" />)

    await failNative(container)
    expect(fetchMock).toHaveBeenLastCalledWith(stream, expect.anything())
    expect(screen.queryByTestId('transport-stream')).not.toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(container.querySelector('video')).toHaveAttribute('src', `${stream}&playbackAttempt=1`)
    await failNative(container)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    await failNative(container)
    expect(screen.getByRole('alert')).toHaveTextContent('Видео сейчас не загружается')
    expect(screen.getByRole('link', { name: /Открыть на Яндекс Диске/ })).toHaveAttribute('href', raw)
    unmount()

    const student = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)
    await failNative(student.container)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await failNative(student.container)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    await failNative(student.container)
    expect(screen.getByRole('alert')).toBeVisible()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('сбой потокового плеера тоже повторяется, а уход со страницы отменяет ожидание', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 502 }))
    const { unmount } = render(<VideoPlayer title="Урок" videoUrl={`${url}&format=ts`} displayMode="embed" />)
    fireEvent.click(screen.getByTestId('transport-stream'))
    await flush()
    expect(screen.getByRole('status')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledWith('/api/yandex-disk/proxy?lesson=42&block=v&format=ts', expect.anything())
    await wait(2000)
    expect(screen.getByTestId('transport-stream')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('transport-stream'))
    await flush()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('проверка источника не висит дольше 20 секунд и читает только начало файла', async () => {
    let pulls = 0
    let released: AbortSignal | null | undefined
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })).mockImplementationOnce(async (_url: string, init: RequestInit) => {
      released = init.signal
      // Сервер проигнорировал Range и отдаёт файл целиком.
      return new Response(new ReadableStream<Uint8Array>({ pull(stream) { pulls += 1; stream.enqueue(new Uint8Array(1024)) } }), { status: 200 })
    })
    const { container } = render(<VideoPlayer title="Урок" videoUrl={url} displayMode="embed" />)

    await failNative(container)
    expect(screen.getByRole('status')).toBeVisible()
    await wait(20_000)
    await wait(2000)
    expect(container.querySelector('video')).toHaveAttribute('src', `${url}&playbackAttempt=1`)

    await failNative(container)
    expect(released?.aborted).toBe(true)
    expect(pulls).toBeLessThan(5)
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
