'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isLessonFullscreen, lessonFullscreenTarget } from '@/lib/lesson-fullscreen'

type Props = { prevHref: string | null; nextHref: string | null }

/** Стрелки не должны угонять ввод: в заметках, комментариях и редакторе кода они двигают курсор. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor'))
}

/** Фокус на плеере: стрелки перематывают его сами, урок менять нельзя. */
function isOnPlayer(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('video, [data-lesson-video], [role="slider"]'))
}

const FULLSCREEN_SEEK_SECONDS = 5

/** Нативное видео перематываем сами: в полноэкранном режиме фокус не обязан быть на нём. */
function seekFullscreenVideo(element: Element, seconds: number): boolean {
  if (!(element instanceof HTMLVideoElement)) return false
  const end = Number.isFinite(element.duration) ? element.duration : Number.POSITIVE_INFINITY
  element.currentTime = Math.min(end, Math.max(0, element.currentTime + seconds))
  return true
}

/** ← и → — соседние уроки, как листание в читалке; во весь экран - перемотка. */
export function LessonKeyboardNav({ prevHref, nextHref }: Props) {
  const router = useRouter()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (isTyping(event.target) || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
      const lessonMode = isLessonFullscreen()
      const fullscreen = lessonMode ? lessonFullscreenTarget()?.querySelector('video') : document.fullscreenElement
      if (lessonMode || fullscreen) {
        // preventDefault снимает и перемотку браузера: иначе шаг посчитался бы дважды.
        if (fullscreen && seekFullscreenVideo(fullscreen, event.key === 'ArrowLeft' ? -FULLSCREEN_SEEK_SECONDS : FULLSCREEN_SEEK_SECONDS)) event.preventDefault()
        return
      }
      if (isOnPlayer(event.target)) return
      const href = event.key === 'ArrowLeft' ? prevHref : nextHref
      if (!href) return
      event.preventDefault()
      router.push(href)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prevHref, nextHref, router])

  return null
}
