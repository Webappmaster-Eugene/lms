'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { swipeDirection, swipeTarget, type SwipeDirection, type SwipeLesson, type SwipeTarget } from '@/lib/lesson-swipe'

type Props = { slug: string; previous: SwipeLesson | null; next: SwipeLesson | null }

/** Кадр видео урока; значение - вид плеера: native, stream или embed. */
const VIDEO_SELECTOR = '[data-lesson-video]'
const CONTROL_SELECTOR = 'button, a, input, select, textarea, [role="slider"]'
/** Внизу нативного плеера шкала перемотки и громкость: их тянут пальцем вбок, это не листание. */
const NATIVE_CONTROLS_BAND_PX = 56
/** До этого сдвига неясно, листают видео или прокручивают страницу. */
const AXIS_LOCK_PX = 12
const DRAG_FACTOR = 0.4
const DRAG_LIMIT_PX = 96
/** Идти некуда: кадр чуть поддаётся и упирается, чтобы было видно, что жест замечен. */
const STOP_FACTOR = 0.15
const STOP_LIMIT_PX = 32
const RELEASE_TRANSITION = 'transform 150ms ease-out'
/** Переход дольше этого уже не продолжение жеста: старая передача не должна прокрутить случайный визит. */
const ARRIVAL_TTL_MS = 30_000
/** Полоса загрузки в шапке ловит только клики по ссылкам: пока сервер отвечает, о переходе говорит плашка. */
const PENDING_HINT_MS = 15_000

type Arrival = { slug: string; edge: 'first' | 'last'; play: boolean; expiresAt: number }
/** Переход клиентский, и модуль переживает смену урока: так новая страница узнаёт, куда прокрутить и запускать ли видео. */
let arrival: Arrival | null = null

type Gesture = {
  frame: HTMLElement
  frames: HTMLElement[]
  index: number
  x: number
  y: number
  startedAt: number
  rect: DOMRect
  horizontal: boolean
}

type Hint = { direction: SwipeDirection; label: string; armed: boolean; pending: boolean; top: number; left: number; maxWidth: number }

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function hintLabel(direction: SwipeDirection, target: SwipeTarget | null): string {
  if (!target) return direction === 'next' ? 'Дальше уроков нет' : 'Это первый урок'
  if (target.kind === 'video') return direction === 'next' ? 'Следующее видео' : 'Предыдущее видео'
  return `${direction === 'next' ? 'Следующий урок' : 'Предыдущий урок'}: ${target.title}`
}

function isPlaying(video: HTMLVideoElement | null): video is HTMLVideoElement {
  return Boolean(video && !video.paused && !video.ended)
}

/** Отказ автозапуска оставляет видео на паузе: дальше ученик нажмёт сам, повторять незачем. */
function playWhenReady(frame: HTMLElement) {
  const video = frame.querySelector('video')
  if (!video) return
  const play = () => { void video.play().catch(() => undefined) }
  // Потоковый плеер подключает источник позже: запуск до этого сорвётся при подключении.
  if (video.getAttribute('src') || video.currentSrc) play()
  else video.addEventListener('loadedmetadata', play, { once: true })
}

function drag(frame: HTMLElement, dx: number, canGo: boolean) {
  if (reducedMotion()) return
  const factor = canGo ? DRAG_FACTOR : STOP_FACTOR
  const limit = canGo ? DRAG_LIMIT_PX : STOP_LIMIT_PX
  frame.style.transition = 'none'
  frame.style.transform = `translateX(${Math.max(-limit, Math.min(limit, dx * factor))}px)`
}

function release(frame: HTMLElement) {
  if (!frame.style.transform) return
  frame.style.transition = RELEASE_TRANSITION
  frame.style.transform = ''
  frame.addEventListener('transitionend', () => { frame.style.transition = '' }, { once: true })
}

/** Смахивание по видео урока: влево - следующее видео или урок, вправо - предыдущее. */
export function LessonSwipeNav({ slug, previous, next }: Props) {
  const router = useRouter()
  const gesture = useRef<Gesture | null>(null)
  const [hint, setHint] = useState<Hint | null>(null)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Перерисовка во время жеста (плашка) не должна переподписывать слушатели и сбрасывать жест.
  const latest = useRef({ router, previous, next })
  useEffect(() => { latest.current = { router, previous, next } })

  // Прибытие после смахивания: переход шёл без штатной прокрутки, место выбираем сами.
  useEffect(() => {
    const pending = arrival
    if (!pending || pending.slug !== slug) return
    arrival = null
    if (Date.now() > pending.expiresAt) return
    const frames = Array.from(document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR))
    const frame = pending.edge === 'first' ? frames[0] : frames.at(-1)
    if (!frame) {
      window.scrollTo(0, 0)
      return
    }
    frame.scrollIntoView({ block: 'center' })
    if (pending.play) playWhenReady(frame)
  }, [slug])

  useEffect(() => {
    const targetOf = (direction: SwipeDirection, current: Gesture) =>
      swipeTarget(direction, current.index, current.frames.length, latest.current.previous, latest.current.next)

    const placeHint = (current: Gesture, direction: SwipeDirection, label: string, armed: boolean, pending: boolean): Hint => ({
      direction, label, armed, pending,
      top: current.rect.top + current.rect.height / 2,
      left: current.rect.left + current.rect.width / 2,
      maxWidth: Math.max(current.rect.width - 32, 160),
    })

    const cancel = () => {
      const current = gesture.current
      gesture.current = null
      if (current) release(current.frame)
      clearTimeout(pendingTimer.current)
      setHint(null)
    }

    const onStart = (event: TouchEvent) => {
      cancel()
      // Второй палец - это масштаб, а не листание.
      if (event.touches.length !== 1 || document.fullscreenElement) return
      const target = event.target
      if (!(target instanceof Element) || target.closest(CONTROL_SELECTOR)) return
      const frame = target.closest<HTMLElement>(VIDEO_SELECTOR)
      if (!frame) return
      const touch = event.touches[0]
      const rect = frame.getBoundingClientRect()
      if (frame.dataset.lessonVideo === 'native' && touch.clientY > rect.bottom - NATIVE_CONTROLS_BAND_PX) return
      const frames = Array.from(document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR))
      gesture.current = { frame, frames, index: frames.indexOf(frame), x: touch.clientX, y: touch.clientY, startedAt: performance.now(), rect, horizontal: false }
    }

    const onMove = (event: TouchEvent) => {
      const current = gesture.current
      if (!current) return
      if (event.touches.length !== 1) { cancel(); return }
      const touch = event.touches[0]
      const dx = touch.clientX - current.x
      const dy = touch.clientY - current.y
      if (!current.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return
        // Начали прокручивать страницу: этот жест больше не листание.
        if (Math.abs(dy) >= Math.abs(dx)) { cancel(); return }
        current.horizontal = true
      }
      const direction: SwipeDirection = dx < 0 ? 'next' : 'prev'
      const target = targetOf(direction, current)
      drag(current.frame, dx, target !== null)
      const armed = target !== null && swipeDirection({ dx, dy, ms: Infinity, width: current.rect.width }) === direction
      const label = hintLabel(direction, target)
      setHint((shown) => shown && shown.label === label && shown.armed === armed ? shown : placeHint(current, direction, label, armed, false))
    }

    const onEnd = (event: TouchEvent) => {
      const current = gesture.current
      cancel()
      if (!current) return
      const touch = event.changedTouches[0]
      if (!touch) return
      const direction = swipeDirection({ dx: touch.clientX - current.x, dy: touch.clientY - current.y, ms: performance.now() - current.startedAt, width: current.rect.width })
      if (!direction) return
      const target = targetOf(direction, current)
      if (!target) return
      const video = current.frame.querySelector('video')
      const playing = isPlaying(video)
      if (playing) video.pause()
      if (target.kind === 'video') {
        const frame = current.frames[target.index]
        frame.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
        // Запуск прямо в обработчике касания: iOS разрешает звук только так.
        if (playing) playWhenReady(frame)
        return
      }
      arrival = { slug: target.slug, edge: target.edge, play: playing, expiresAt: Date.now() + ARRIVAL_TTL_MS }
      latest.current.router.push(`/lessons/${target.slug}`, { scroll: false })
      // Новый урок заменит этот компонент вместе с плашкой; срок нужен, если переход сорвался.
      setHint(placeHint(current, direction, hintLabel(direction, target), true, true))
      pendingTimer.current = setTimeout(() => setHint(null), PENDING_HINT_MS)
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', cancel)
      if (gesture.current) release(gesture.current.frame)
      gesture.current = null
      clearTimeout(pendingTimer.current)
    }
  }, [])

  if (!hint) return null
  const Icon = hint.pending ? Loader2 : hint.direction === 'next' ? ChevronRight : ChevronLeft
  const icon = <Icon className={`h-4 w-4 shrink-0 ${hint.pending ? 'animate-spin motion-reduce:animate-none' : ''}`} />
  return (
    <div
      aria-hidden="true"
      style={{ top: hint.top, left: hint.left, maxWidth: hint.maxWidth }}
      className={`pointer-events-none fixed z-50 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium shadow-lg transition-colors ${hint.armed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/90 text-foreground'}`}
    >
      {hint.direction === 'prev' && icon}
      <span className="min-w-0 truncate">{hint.label}</span>
      {hint.direction === 'next' && icon}
    </div>
  )
}
