import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

type Nav = typeof import('@/components/lesson/LessonSwipeNav').LessonSwipeNav
let LessonSwipeNav: Nav

const lessonA = { slug: 'a', title: 'Урок A' }
const lessonC = { slug: 'c', title: 'Урок C' }
const lessonD = { slug: 'd', title: 'Урок D' }

type Point = { x: number; y: number }
const LEFT = { from: { x: 300, y: 150 }, to: { x: 100, y: 160 } }
const RIGHT = { from: { x: 100, y: 150 }, to: { x: 300, y: 140 } }

/** jsdom не создаёт TouchEvent с координатами: собираем событие с нужными полями сами. */
function touch(type: string, target: Element, touches: Point[], changed: Point[] = touches) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  const list = (points: Point[]) => points.map((point) => ({ clientX: point.x, clientY: point.y }))
  Object.defineProperty(event, 'touches', { value: list(touches) })
  Object.defineProperty(event, 'changedTouches', { value: list(changed) })
  act(() => { target.dispatchEvent(event) })
}

function swipe(target: Element, { from, to }: { from: Point; to: Point }) {
  touch('touchstart', target, [from])
  touch('touchmove', target, [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }])
  touch('touchmove', target, [to])
  touch('touchend', target, [], [to])
}

function Videos({ count = 1, kind = 'native', withSource = true }: { count?: number; kind?: string; withSource?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} data-lesson-video={kind} data-testid={`frame-${index}`}>
          <video data-testid={`video-${index}`} src={withSource ? `/v${index}.mp4` : undefined} />
        </div>
      ))}
    </>
  )
}

function renderLesson(slug: string, previous: typeof lessonA | null, next: typeof lessonC | null, videos?: Parameters<typeof Videos>[0]) {
  return render(
    <>
      <LessonSwipeNav key={slug} slug={slug} previous={previous} next={next} />
      <Videos {...videos} />
      <p>Текст урока</p>
    </>,
  )
}

function markPlaying(video: Element) {
  Object.defineProperty(video, 'paused', { value: false, configurable: true })
}

const scrollIntoView = vi.fn()
const scrollTo = vi.fn()
let play: ReturnType<typeof vi.fn>
let pause: ReturnType<typeof vi.fn>

beforeEach(async () => {
  // Передача между уроками живёт в модуле: каждому тесту свой чистый модуль.
  vi.resetModules()
  ;({ LessonSwipeNav } = await import('@/components/lesson/LessonSwipeNav'))
  push.mockClear()
  scrollIntoView.mockClear()
  scrollTo.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
  play = vi.fn(() => Promise.resolve())
  pause = vi.fn()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as () => Promise<void>)
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause as () => void)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 300, left: 0, right: 360, width: 360, height: 200, x: 0, y: 100, toJSON: () => ({}) } as DOMRect)
})

afterEach(() => { vi.restoreAllMocks() })

describe('смахивание по видео урока', () => {
  it('влево ведёт на следующий урок, вправо - на предыдущий', () => {
    renderLesson('b', lessonA, lessonC)

    swipe(screen.getByTestId('video-0'), LEFT)
    swipe(screen.getByTestId('video-0'), RIGHT)

    expect(push.mock.calls).toEqual([['/lessons/c', { scroll: false }], ['/lessons/a', { scroll: false }]])
  })

  it('пока палец ведёт видео, видно, куда оно перелистнёт; передумал - подсказка уходит', () => {
    renderLesson('b', lessonA, lessonC)
    const video = screen.getByTestId('video-0')

    touch('touchstart', video, [LEFT.from])
    touch('touchmove', video, [LEFT.to])
    expect(screen.getByText('Следующий урок: Урок C')).toBeTruthy()

    touch('touchmove', video, [LEFT.from])
    touch('touchend', video, [], [LEFT.from])
    expect(screen.queryByText('Следующий урок: Урок C')).toBeNull()
    expect(push).not.toHaveBeenCalled()
  })

  it('пока сервер отвечает, плашка говорит о переходе, а сорвавшийся переход её не оставляет', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      renderLesson('b', lessonA, lessonC)

      swipe(screen.getByTestId('video-0'), LEFT)
      expect(screen.getByText('Следующий урок: Урок C')).toBeTruthy()

      act(() => { vi.advanceTimersByTime(15_000) })
      expect(screen.queryByText('Следующий урок: Урок C')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('в уроке несколько видео: сначала листает их, без перехода на другой урок', () => {
    renderLesson('b', lessonA, lessonC, { count: 2 })

    swipe(screen.getByTestId('video-0'), LEFT)

    expect(push).not.toHaveBeenCalled()
    expect(scrollIntoView.mock.contexts).toEqual([screen.getByTestId('frame-1')])
  })

  it('игравшее видео встаёт на паузу, а следующее видео урока запускается', () => {
    renderLesson('b', lessonA, lessonC, { count: 2 })
    markPlaying(screen.getByTestId('video-0'))

    swipe(screen.getByTestId('video-0'), LEFT)

    expect(pause.mock.contexts).toEqual([screen.getByTestId('video-0')])
    expect(play.mock.contexts).toEqual([screen.getByTestId('video-1')])
  })

  it('с последнего видео урока уходит на следующий урок', () => {
    renderLesson('b', lessonA, lessonC, { count: 2 })

    swipe(screen.getByTestId('video-1'), LEFT)

    expect(push).toHaveBeenCalledWith('/lessons/c', { scroll: false })
  })

  it('не листает, если жест не похож на листание видео', () => {
    renderLesson('b', null, lessonC)
    const video = screen.getByTestId('video-0')

    // Шкала перемотки нативного плеера: её тянут вбок.
    swipe(video, { from: { x: 300, y: 290 }, to: { x: 100, y: 290 } })
    // Прокрутка страницы.
    swipe(video, { from: { x: 200, y: 120 }, to: { x: 210, y: 280 } })
    // Вне видео.
    swipe(screen.getByText('Текст урока'), LEFT)
    // Первый урок: назад идти некуда.
    swipe(video, RIGHT)
    // Два пальца - это масштаб.
    touch('touchstart', video, [LEFT.from, { x: 200, y: 200 }])
    touch('touchmove', video, [LEFT.to, { x: 200, y: 200 }])
    touch('touchend', video, [], [LEFT.to])

    expect(push).not.toHaveBeenCalled()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('у потокового плеера своя панель управления, нижняя часть кадра листается', () => {
    renderLesson('b', lessonA, lessonC, { kind: 'stream' })

    swipe(screen.getByTestId('video-0'), { from: { x: 300, y: 290 }, to: { x: 100, y: 290 } })

    expect(push).toHaveBeenCalledWith('/lessons/c', { scroll: false })
  })
})

describe('во весь экран', () => {
  let exitFullscreen: ReturnType<typeof vi.fn>
  let requestFullscreen: ReturnType<typeof vi.fn>

  function fullscreen(element: Element | null) {
    Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true })
  }
  const settled = () => act(async () => { await Promise.resolve(); await Promise.resolve() })

  beforeEach(() => {
    exitFullscreen = vi.fn(() => {
      fullscreen(null)
      return Promise.resolve()
    })
    requestFullscreen = vi.fn(() => Promise.resolve())
    document.exitFullscreen = exitFullscreen as unknown as typeof document.exitFullscreen
    HTMLElement.prototype.requestFullscreen = requestFullscreen as unknown as typeof HTMLElement.prototype.requestFullscreen
  })
  afterEach(() => {
    Reflect.deleteProperty(document, 'fullscreenElement')
    Reflect.deleteProperty(document, 'exitFullscreen')
    Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
  })

  it('листание переносит режим на следующую часть и запускает её', async () => {
    renderLesson('b', lessonA, lessonC, { count: 2 })
    const video = screen.getByTestId('video-0')
    markPlaying(video)
    fullscreen(video)

    swipe(video, LEFT)
    await settled()

    expect(pause.mock.contexts).toEqual([video])
    expect(exitFullscreen).toHaveBeenCalledOnce()
    expect(requestFullscreen.mock.contexts).toEqual([screen.getByTestId('video-1')])
    expect(play.mock.contexts).toEqual([screen.getByTestId('video-1')])
    expect(push).not.toHaveBeenCalled()
    // Выход возвращает на страницу к новой части, а не к той, с которой листали.
    expect(scrollIntoView.mock.contexts).toEqual([screen.getByTestId('frame-1')])
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  })

  it('стоявшее на паузе видео разворачивается, но само не запускается', async () => {
    renderLesson('b', lessonA, lessonC, { count: 2 })
    const video = screen.getByTestId('video-0')
    fullscreen(video)

    swipe(video, LEFT)
    await settled()

    expect(requestFullscreen.mock.contexts).toEqual([screen.getByTestId('video-1')])
    expect(play).not.toHaveBeenCalled()
  })

  it('отказ браузера оставляет часть играть в обычном режиме', async () => {
    requestFullscreen.mockImplementation(() => Promise.reject(new TypeError('denied')))
    renderLesson('b', lessonA, lessonC, { count: 2 })
    const video = screen.getByTestId('video-0')
    markPlaying(video)
    fullscreen(video)

    swipe(video, LEFT)
    await settled()

    expect(requestFullscreen).toHaveBeenCalledOnce()
    expect(play.mock.contexts).toEqual([screen.getByTestId('video-1')])
  })

  it('потоковый плеер разворачивает рамку с кнопками, полоса нативных кнопок к нему не относится', async () => {
    render(
      <>
        <LessonSwipeNav slug="b" previous={lessonA} next={lessonC} />
        <div data-lesson-video-shell data-testid="shell-0"><div data-lesson-video="stream"><video data-testid="video-0" src="/0.ts" /></div></div>
        <div data-lesson-video-shell data-testid="shell-1"><div data-lesson-video="stream"><video data-testid="video-1" src="/1.ts" /></div></div>
      </>,
    )
    fullscreen(screen.getByTestId('shell-0'))

    swipe(screen.getByTestId('video-0'), { from: { x: 300, y: 290 }, to: { x: 100, y: 290 } })
    await settled()

    expect(requestFullscreen.mock.contexts).toEqual([screen.getByTestId('shell-1')])
  })

  it('внизу развёрнутого кадра кнопки браузера: их полоса шире, чем в обычном режиме', () => {
    renderLesson('b', lessonA, lessonC)
    const video = screen.getByTestId('video-0')
    fullscreen(video)

    // 210 выше полосы обычного режима (244), но внутри полосы развёрнутого (204).
    swipe(video, { from: { x: 300, y: 210 }, to: { x: 100, y: 210 } })
    expect(push).not.toHaveBeenCalled()

    fullscreen(null)
    swipe(video, { from: { x: 300, y: 210 }, to: { x: 100, y: 210 } })
    expect(push).toHaveBeenCalledOnce()
  })

  it('с последней части режим переходит на следующий урок', () => {
    const page = renderLesson('b', lessonA, lessonC)
    const video = screen.getByTestId('video-0')
    markPlaying(video)
    fullscreen(video)

    swipe(video, LEFT)
    expect(push).toHaveBeenCalledWith('/lessons/c', { scroll: false })
    // Страница ещё не сменилась: режим уходит вместе со старым видео, а не раньше.
    expect(exitFullscreen).not.toHaveBeenCalled()
    fullscreen(null)
    page.unmount()

    renderLesson('c', lessonC, lessonD, { count: 2 })

    expect(requestFullscreen.mock.contexts).toEqual([screen.getByTestId('video-0')])
    expect(play.mock.contexts).toEqual([screen.getByTestId('video-0')])
  })

  it('листание в обычном режиме режим не включает', () => {
    const page = renderLesson('b', lessonA, lessonC, { count: 2 })
    swipe(screen.getByTestId('video-0'), LEFT)
    swipe(screen.getByTestId('video-1'), LEFT)
    page.unmount()

    renderLesson('c', lessonC, lessonD)

    expect(requestFullscreen).not.toHaveBeenCalled()
    expect(exitFullscreen).not.toHaveBeenCalled()
  })
})

describe('тачпад', () => {
  function wheel(target: Element, deltaX: number, deltaY = 0, timeStamp = 0, init: WheelEventInit = {}) {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX, deltaY, ...init })
    Object.defineProperty(event, 'timeStamp', { value: timeStamp })
    act(() => { target.dispatchEvent(event) })
    return event
  }

  it('горизонтальный жест над видео листает один раз и не уводит браузер назад', () => {
    renderLesson('b', lessonA, lessonC, { count: 3 })
    const video = screen.getByTestId('video-0')

    const first = wheel(video, 70, 0, 0)
    wheel(video, 70, 0, 10)
    // Инерция того же жеста не листает дальше.
    wheel(video, 200, 0, 20)

    expect(first.defaultPrevented).toBe(true)
    expect(scrollIntoView.mock.contexts).toEqual([screen.getByTestId('frame-1')])
  })

  it('новый жест после паузы листает снова, назад - в другую сторону', () => {
    renderLesson('b', lessonA, lessonC, { count: 2 })
    const video = screen.getByTestId('video-1')

    wheel(video, -130, 0, 0)

    expect(scrollIntoView.mock.contexts).toEqual([screen.getByTestId('frame-0')])
    scrollIntoView.mockClear()
    wheel(video, 130, 0, 1000)
    expect(push).toHaveBeenCalledWith('/lessons/c', { scroll: false })
  })

  it('вертикальная прокрутка, масштаб и жест вне видео не перехватываются', () => {
    renderLesson('b', lessonA, lessonC, { count: 2 })
    const video = screen.getByTestId('video-0')

    expect(wheel(video, 10, 300, 0).defaultPrevented).toBe(false)
    expect(wheel(video, 300, 0, 1000, { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(wheel(screen.getByText('Текст урока'), 300, 0, 2000).defaultPrevented).toBe(false)

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})

describe('клавиши Shift+N и Shift+P', () => {
  it('листают играющее видео и работают в русской раскладке', () => {
    renderLesson('b', lessonA, lessonC, { count: 3 })
    markPlaying(screen.getByTestId('video-1'))

    fireEvent.keyDown(document.body, { key: 'Т', code: 'KeyN', shiftKey: true })

    expect(pause.mock.contexts).toEqual([screen.getByTestId('video-1')])
    expect(play.mock.contexts).toEqual([screen.getByTestId('video-2')])
  })

  it('с первого видео Shift+P ведёт на предыдущий урок', () => {
    renderLesson('b', lessonA, lessonC, { count: 2 })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.testid === 'frame-0' ? 200 : 2000
      return { top, bottom: top + 200, left: 0, right: 360, width: 360, height: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })

    fireEvent.keyDown(document.body, { key: 'P', code: 'KeyP', shiftKey: true })

    expect(push).toHaveBeenCalledWith('/lessons/a', { scroll: false })
  })

  it('в уроке без видео ничего не делает: уроки листают стрелки', () => {
    render(<LessonSwipeNav slug="b" previous={lessonA} next={lessonC} />)

    fireEvent.keyDown(document.body, { code: 'KeyN', shiftKey: true })
    expect(push).not.toHaveBeenCalled()
  })

  it('буквы при наборе заметки и без Shift не листают', () => {
    render(
      <>
        <LessonSwipeNav slug="b" previous={lessonA} next={lessonC} />
        <Videos count={2} />
        <textarea aria-label="заметка" />
      </>,
    )

    fireEvent.keyDown(screen.getByLabelText('заметка'), { code: 'KeyN', shiftKey: true })
    fireEvent.keyDown(document.body, { code: 'KeyN' })

    expect(push).not.toHaveBeenCalled()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('прибытие на урок после смахивания', () => {
  it('вперёд: прокручивает к первому видео и запускает его, если смотрели', () => {
    const page = renderLesson('b', lessonA, lessonC)
    markPlaying(screen.getByTestId('video-0'))
    swipe(screen.getByTestId('video-0'), LEFT)
    expect(pause).toHaveBeenCalledTimes(1)
    page.unmount()

    renderLesson('c', lessonC, lessonD, { count: 2 })

    expect(scrollIntoView.mock.contexts).toEqual([screen.getByTestId('frame-0')])
    expect(play.mock.contexts).toEqual([screen.getByTestId('video-0')])
  })

  it('назад: прокручивает к последнему видео предыдущего урока', () => {
    const page = renderLesson('b', lessonA, lessonC)
    markPlaying(screen.getByTestId('video-0'))
    swipe(screen.getByTestId('video-0'), RIGHT)
    page.unmount()

    renderLesson('a', null, lessonC, { count: 2 })

    expect(scrollIntoView.mock.contexts).toEqual([screen.getByTestId('frame-1')])
    expect(play.mock.contexts).toEqual([screen.getByTestId('video-1')])
  })

  it('видео не играло - только прокрутка, без запуска', () => {
    const page = renderLesson('b', lessonA, lessonC)
    swipe(screen.getByTestId('video-0'), LEFT)
    page.unmount()

    renderLesson('c', lessonC, lessonD)

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(play).not.toHaveBeenCalled()
  })

  it('потоковое видео запускается, когда плеер подключил источник', () => {
    const page = renderLesson('b', lessonA, lessonC)
    markPlaying(screen.getByTestId('video-0'))
    swipe(screen.getByTestId('video-0'), LEFT)
    page.unmount()

    renderLesson('c', lessonC, lessonD, { kind: 'stream', withSource: false })
    expect(play).not.toHaveBeenCalled()
    fireEvent(screen.getByTestId('video-0'), new Event('loadedmetadata'))

    expect(play.mock.contexts).toEqual([screen.getByTestId('video-0')])
  })

  it('в уроке без видео открывает начало страницы', () => {
    const page = renderLesson('b', lessonA, lessonC)
    swipe(screen.getByTestId('video-0'), LEFT)
    page.unmount()

    renderLesson('c', lessonC, lessonD, { count: 0 })

    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('чужой урок и устаревшая передача ничего не прокручивают', () => {
    const page = renderLesson('b', lessonA, lessonC)
    markPlaying(screen.getByTestId('video-0'))
    swipe(screen.getByTestId('video-0'), LEFT)
    page.unmount()

    const other = renderLesson('x', null, null)
    other.unmount()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 31_000)
    renderLesson('c', lessonC, lessonD)

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
  })
})
