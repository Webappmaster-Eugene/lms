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

  it('в полноэкранном режиме не листает', () => {
    renderLesson('b', lessonA, lessonC)
    const video = screen.getByTestId('video-0')
    Object.defineProperty(document, 'fullscreenElement', { value: video, configurable: true })
    try {
      swipe(video, LEFT)
    } finally {
      Reflect.deleteProperty(document, 'fullscreenElement')
    }

    expect(push).not.toHaveBeenCalled()
  })

  it('у потокового плеера своя панель управления, нижняя часть кадра листается', () => {
    renderLesson('b', lessonA, lessonC, { kind: 'stream' })

    swipe(screen.getByTestId('video-0'), { from: { x: 300, y: 290 }, to: { x: 100, y: 290 } })

    expect(push).toHaveBeenCalledWith('/lessons/c', { scroll: false })
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
