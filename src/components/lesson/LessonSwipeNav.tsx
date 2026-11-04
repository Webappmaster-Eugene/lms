'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { swipeDirection, swipeTarget, trackWheel, WHEEL_IDLE, type SwipeDirection, type SwipeLesson, type SwipeTarget } from '@/lib/lesson-swipe'
import { isTyping } from './LessonKeyboardNav'

type Props = { slug: string; previous: SwipeLesson | null; next: SwipeLesson | null }

/** Кадр видео урока; значение - вид плеера: native, stream или embed. */
const VIDEO_SELECTOR = '[data-lesson-video]'
/** Рамка потокового плеера с его кнопками: во весь экран разворачивается она, а не голое видео. */
const SHELL_SELECTOR = '[data-lesson-video-shell]'
const CONTROL_SELECTOR = 'button, a, input, select, textarea, [role="slider"]'
/** Внизу нативного плеера шкала перемотки и громкость: их тянут пальцем вбок, это не листание. */
const NATIVE_CONTROLS_BAND_PX = 56
/** Во весь экран кнопки браузера крупнее и стоят выше шкалы. */
const FULLSCREEN_CONTROLS_BAND_PX = 96
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

type Arrival = { slug: string; edge: 'first' | 'last'; play: boolean; fullscreen: boolean; expiresAt: number }
/** Переход клиентский, и модуль переживает смену урока: так новая страница узнаёт, куда прокрутить и запускать ли видео. */
let arrival: Arrival | null = null

/** Откуда листаем: один и тот же переход идёт от пальца, тачпада и клавиш. */
type Spot = { frame: HTMLElement; frames: HTMLElement[]; index: number; rect: DOMRect }

type Gesture = Spot & {
  x: number
  y: number
  startedAt: number
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

/** Развёрнутый элемент этого кадра: нативный плеер разворачивает сам <video>, потоковый - рамку с кнопками. */
function fullscreenHost(frame: HTMLElement): Element | null {
  const element = document.fullscreenElement
  return element && (frame.contains(element) || element.contains(frame)) ? element : null
}

/** Отказ браузера оставляет видео в обычном режиме: жест тачпада, в отличие от касания, права на вход не даёт. */
function enterFullscreen(frame: HTMLElement) {
  const target = frame.dataset.lessonVideo === 'native' ? frame.querySelector('video') : frame.closest(SHELL_SELECTOR)
  void target?.requestFullscreen?.().catch(() => undefined)
}

/** Поверх развёрнутого элемента новый не кладём: выход из него вернул бы предыдущую часть, а не страницу. */
async function moveFullscreen(frame: HTMLElement) {
  await document.exitFullscreen().catch(() => undefined)
  frame.scrollIntoView({ block: 'center' })
  enterFullscreen(frame)
}

function allFrames(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(VIDEO_SELECTOR))
}

/** Какое видео имеет в виду клавиша: развёрнутое, потом играющее, потом ближайшее к середине экрана. */
function currentFrame(frames: HTMLElement[]): HTMLElement | undefined {
  const active = frames.find((frame) => fullscreenHost(frame)) ?? frames.find((frame) => isPlaying(frame.querySelector('video')))
  if (active) return active
  const distance = (frame: HTMLElement) => {
    const rect = frame.getBoundingClientRect()
    return Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2)
  }
  return frames.reduce<HTMLElement | undefined>((best, frame) => (!best || distance(frame) < distance(best) ? frame : best), undefined)
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

/** Листание видео урока пальцем, тачпадом и Shift+N/P: вперёд - следующее видео или урок, назад - предыдущее. */
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
    const frames = allFrames()
    const frame = pending.edge === 'first' ? frames[0] : frames.at(-1)
    if (!frame) {
      window.scrollTo(0, 0)
      return
    }
    frame.scrollIntoView({ block: 'center' })
    if (pending.play) playWhenReady(frame)
    if (pending.fullscreen) enterFullscreen(frame)
  }, [slug])

  useEffect(() => {
    let wheel = WHEEL_IDLE
    const targetOf = (direction: SwipeDirection, current: Spot) =>
      swipeTarget(direction, current.index, current.frames.length, latest.current.previous, latest.current.next)

    const placeHint = (current: Spot, direction: SwipeDirection, label: string, armed: boolean, pending: boolean): Hint => ({
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

    const navigate = (spot: Spot, direction: SwipeDirection) => {
      const target = targetOf(direction, spot)
      if (!target) return
      const video = spot.frame.querySelector('video')
      const playing = isPlaying(video)
      const fullscreen = fullscreenHost(spot.frame) !== null
      if (playing) video.pause()
      if (target.kind === 'video') {
        const frame = spot.frames[target.index]
        if (fullscreen) void moveFullscreen(frame)
        else frame.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
        // Запуск прямо в обработчике касания: iOS разрешает звук только так.
        if (playing) playWhenReady(frame)
        return
      }
      arrival = { slug: target.slug, edge: target.edge, play: playing, fullscreen, expiresAt: Date.now() + ARRIVAL_TTL_MS }
      latest.current.router.push(`/lessons/${target.slug}`, { scroll: false })
      // Новый урок заменит этот компонент вместе с плашкой; срок нужен, если переход сорвался.
      setHint(placeHint(spot, direction, hintLabel(direction, target), true, true))
      pendingTimer.current = setTimeout(() => setHint(null), PENDING_HINT_MS)
    }

    const onStart = (event: TouchEvent) => {
      cancel()
      // Второй палец - это масштаб, а не листание.
      if (event.touches.length !== 1) return
      const target = event.target
      if (!(target instanceof Element) || target.closest(CONTROL_SELECTOR)) return
      const frame = target.closest<HTMLElement>(VIDEO_SELECTOR)
      if (!frame) return
      const touch = event.touches[0]
      // Развёрнутое видео лежит поверх страницы: у его кадра в потоке страницы другие размеры.
      const host = fullscreenHost(frame)
      const rect = (host ?? frame).getBoundingClientRect()
      const band = host ? FULLSCREEN_CONTROLS_BAND_PX : NATIVE_CONTROLS_BAND_PX
      if (frame.dataset.lessonVideo === 'native' && touch.clientY > rect.bottom - band) return
      const frames = allFrames()
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
      navigate(current, direction)
    }

    const onWheel = (event: WheelEvent) => {
      // С Ctrl тачпад сообщает о масштабе; вертикальный жест - прокрутка страницы.
      if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      const target = event.target
      if (!(target instanceof Element) || target.closest(CONTROL_SELECTOR)) return
      const frame = target.closest<HTMLElement>(VIDEO_SELECTOR)
      if (!frame) return
      // Иначе тот же жест уведёт браузер «назад» по истории.
      if (event.cancelable) event.preventDefault()
      const step = trackWheel(wheel, event.deltaX, event.timeStamp)
      wheel = step.track
      if (!step.direction) return
      const frames = allFrames()
      navigate({ frame, frames, index: frames.indexOf(frame), rect: (fullscreenHost(frame) ?? frame).getBoundingClientRect() }, step.direction)
    }

    const onKey = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.defaultPrevented) return
      // По коду клавиши, а не букве: в русской раскладке те же кнопки дают Т и З.
      const direction: SwipeDirection | null = event.code === 'KeyN' ? 'next' : event.code === 'KeyP' ? 'prev' : null
      if (!direction || isTyping(event.target)) return
      const frames = allFrames()
      const frame = currentFrame(frames)
      if (!frame) return
      event.preventDefault()
      navigate({ frame, frames, index: frames.indexOf(frame), rect: (fullscreenHost(frame) ?? frame).getBoundingClientRect() }, direction)
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', cancel, { passive: true })
    document.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', cancel)
      document.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
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
