import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'

import { LessonPlaybackGuard } from '@/components/lesson/LessonPlaybackGuard'

function start(video: Element) {
  Object.defineProperty(video, 'paused', { value: false, configurable: true })
  act(() => { video.dispatchEvent(new Event('play')) })
}

describe('в уроке играет одно видео', () => {
  let pause: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('запуск другого видео ставит игравшее на паузу', () => {
    render(
      <>
        <LessonPlaybackGuard />
        <div data-lesson-video="native"><video data-testid="first" /></div>
        <div data-lesson-video="stream"><video data-testid="second" /></div>
        <div data-lesson-video="native"><video data-testid="third" /></div>
      </>,
    )
    start(screen.getByTestId('first'))
    expect(pause).not.toHaveBeenCalled()

    start(screen.getByTestId('second'))

    expect(pause.mock.contexts).toEqual([screen.getByTestId('first')])
  })

  it('видео вне кадров урока не трогает и не считается', () => {
    render(
      <>
        <LessonPlaybackGuard />
        <video data-testid="outside" />
        <div data-lesson-video="native"><video data-testid="lesson" /></div>
      </>,
    )
    start(screen.getByTestId('outside'))
    start(screen.getByTestId('lesson'))

    expect(pause).not.toHaveBeenCalled()
  })

  it('после ухода со страницы не вмешивается', () => {
    const { unmount } = render(<LessonPlaybackGuard />)
    unmount()
    const video = document.createElement('video')
    const other = document.createElement('video')
    const frame = document.createElement('div')
    frame.dataset.lessonVideo = 'native'
    frame.append(video, other)
    document.body.append(frame)
    Object.defineProperty(other, 'paused', { value: false })

    start(video)

    expect(pause).not.toHaveBeenCalled()
    frame.remove()
  })
})
