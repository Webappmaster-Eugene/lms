'use client'

import { useRef, useSyncExternalStore } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { lessonFullscreenAvailable, lessonFullscreenTarget, subscribeLessonFullscreen, toggleLessonFullscreen } from '@/lib/lesson-fullscreen'

const NO_SUBSCRIPTION = () => () => undefined

/** Кнопка браузера разворачивает само видео, а оно не переживает смену части: разворачиваем своей. */
export function LessonFullscreenButton({ className }: { className: string }) {
  const button = useRef<HTMLButtonElement>(null)
  const active = useSyncExternalStore(
    subscribeLessonFullscreen,
    () => Boolean(button.current && lessonFullscreenTarget()?.contains(button.current)),
    () => false,
  )
  const available = useSyncExternalStore(NO_SUBSCRIPTION, lessonFullscreenAvailable, () => false)
  if (!available) return null
  return (
    <button
      ref={button}
      type="button"
      data-lesson-fullscreen-button
      onClick={(event) => toggleLessonFullscreen(event.currentTarget)}
      aria-label={active ? 'Свернуть' : 'Во весь экран'}
      className={className}
    >
      {active ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
    </button>
  )
}
