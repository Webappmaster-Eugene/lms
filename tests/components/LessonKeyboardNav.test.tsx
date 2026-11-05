import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const { LessonKeyboardNav } = await import('@/components/lesson/LessonKeyboardNav')

/** Листание уроков стрелками не должно мешать набору текста. */

describe('стрелки между уроками', () => {
  beforeEach(() => push.mockClear())

  it('→ и ← ведут к соседним урокам', () => {
    render(<LessonKeyboardNav prevHref="/lessons/a" nextHref="/lessons/c" />)

    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })

    expect(push.mock.calls).toEqual([['/lessons/c'], ['/lessons/a']])
  })

  it('в заметке или комментарии стрелки двигают курсор, а не страницу', () => {
    render(
      <>
        <LessonKeyboardNav prevHref="/lessons/a" nextHref="/lessons/c" />
        <textarea aria-label="заметка" />
        <input aria-label="поиск" />
      </>,
    )

    fireEvent.keyDown(document.querySelector('textarea') as HTMLElement, { key: 'ArrowRight' })
    fireEvent.keyDown(document.querySelector('input') as HTMLElement, { key: 'ArrowLeft' })

    expect(push).not.toHaveBeenCalled()
  })

  it('с модификаторами не срабатывает: Alt+← — это «назад» браузера', () => {
    render(<LessonKeyboardNav prevHref="/lessons/a" nextHref="/lessons/c" />)

    fireEvent.keyDown(document.body, { key: 'ArrowLeft', altKey: true })
    fireEvent.keyDown(document.body, { key: 'ArrowRight', metaKey: true })

    expect(push).not.toHaveBeenCalled()
  })

  it('на первом уроке ← ничего не делает', () => {
    render(<LessonKeyboardNav prevHref={null} nextHref="/lessons/c" />)

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })

    expect(push).not.toHaveBeenCalled()
  })

  it('при фокусе на видео и шкале стрелки перематывают, а не меняют урок', () => {
    render(
      <>
        <LessonKeyboardNav prevHref="/lessons/a" nextHref="/lessons/c" />
        <div data-lesson-video="native"><video data-testid="video" /></div>
        <div role="slider" aria-label="Перемотка" aria-valuenow={0} tabIndex={0} />
      </>,
    )

    fireEvent.keyDown(document.querySelector('video') as HTMLElement, { key: 'ArrowRight' })
    fireEvent.keyDown(document.querySelector('[role="slider"]') as HTMLElement, { key: 'ArrowLeft' })

    expect(push).not.toHaveBeenCalled()
  })

  describe('во весь экран', () => {
    afterEach(() => { Reflect.deleteProperty(document, 'fullscreenElement') })

    function fullscreen(element: Element) {
      Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true })
    }

    it('стрелки перематывают развёрнутое видео, не выходя за его края', () => {
      render(<><LessonKeyboardNav prevHref="/lessons/a" nextHref="/lessons/c" /><video /></>)
      const video = document.querySelector('video') as HTMLVideoElement
      Object.defineProperty(video, 'duration', { value: 12, configurable: true })
      video.currentTime = 3
      fullscreen(video)

      // fireEvent возвращает false, когда обработчик снял действие браузера: второго шага не будет.
      expect(fireEvent.keyDown(document.body, { key: 'ArrowLeft' })).toBe(false)
      expect(video.currentTime).toBe(0)
      video.currentTime = 10
      fireEvent.keyDown(document.body, { key: 'ArrowRight' })
      expect(video.currentTime).toBe(12)
      expect(push).not.toHaveBeenCalled()
    })

    it('режим урока: развёрнут документ, а перематывается часть поверх него', () => {
      render(<><LessonKeyboardNav prevHref="/lessons/a" nextHref="/lessons/c" /><div data-lesson-fullscreen-target><video /></div></>)
      const video = document.querySelector('video') as HTMLVideoElement
      Object.defineProperty(video, 'duration', { value: 100, configurable: true })
      video.currentTime = 10
      document.documentElement.setAttribute('data-lesson-fullscreen', '')
      fullscreen(document.documentElement)

      expect(fireEvent.keyDown(document.body, { key: 'ArrowRight' })).toBe(false)

      expect(video.currentTime).toBe(15)
      expect(push).not.toHaveBeenCalled()
      document.documentElement.removeAttribute('data-lesson-fullscreen')
    })

    it('другой развёрнутый блок стрелки не забирает и урок не меняет', () => {
      render(<><LessonKeyboardNav prevHref="/lessons/a" nextHref="/lessons/c" /><div data-testid="slides" /></>)
      fullscreen(document.querySelector('[data-testid="slides"]') as Element)

      expect(fireEvent.keyDown(document.body, { key: 'ArrowRight' })).toBe(true)
      expect(push).not.toHaveBeenCalled()
    })
  })
})
