'use client'

import { useEffect } from 'react'

const FRAME_SELECTOR = '[data-lesson-video]'

/** В уроке играет одно видео: запуск другого ставит предыдущее на паузу. */
export function LessonPlaybackGuard() {
  useEffect(() => {
    const onPlay = (event: Event) => {
      const started = event.target
      if (!(started instanceof HTMLVideoElement) || !started.closest(FRAME_SELECTOR)) return
      for (const video of document.querySelectorAll<HTMLVideoElement>(`${FRAME_SELECTOR} video`)) {
        if (video !== started && !video.paused) video.pause()
      }
    }
    // play не всплывает: без перехвата документ его не увидит.
    document.addEventListener('play', onPlay, true)
    return () => document.removeEventListener('play', onPlay, true)
  }, [])

  return null
}
