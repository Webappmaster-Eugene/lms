'use client'

import { learningStorageKey, readLocalLearningPosition, saveLocalLearningPosition, useLessonLearning } from '@/components/lesson/LessonLearningProvider'
import { newerPosition, type VideoPosition } from '@/lib/learning-state'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import {
  clearPosition,
  readPosition,
  readRate,
  resumeTarget,
  savePosition,
  parseTimeParam,
  saveRate,
  VIDEO_ENDED_EVENT,
  VIDEO_SEEK_EVENT,
} from '@/lib/video-memory'

/**
 * Метку `?t=` забирает первое видео страницы, один раз на адрес: иначе
 * перерисовка плеера снова прыгала бы на метку, а переход по SPA к другой
 * метке — наоборот, игнорировался бы.
 */
let consumedHref: string | null = null

/** Основное видео урока — первое на странице: к нему относятся метки из заметок. */
const isPrimary = (video: HTMLVideoElement) => document.querySelector('video') === video

/** Как часто записывать позицию во время просмотра. */
const SAVE_EVERY_SECONDS = 5

type Options = {
  /** Длительность из урока — у потока MPEG-TS браузер её не знает. */
  duration?: number | null
  /**
   * Можно ли уже прыгнуть в эту секунду. Нативный плеер докачает нужный кусок
   * сам, а поток MPEG-TS перематывается только по загруженной части.
   */
  canSeek?: (video: HTMLVideoElement, seconds: number) => boolean
}

const nativeCanSeek = (video: HTMLVideoElement) => video.readyState >= HTMLMediaElement.HAVE_METADATA

/**
 * Продолжение с места остановки и запомненная скорость.
 * `key` — исходный адрес ролика: адрес прокси у одного видео бывает разным.
 */
export function useVideoMemory(videoRef: RefObject<HTMLVideoElement | null>, key: string, options: Options = {}) {
  const { duration = null, canSeek = nativeCanSeek } = options
  const learning = useLessonLearning()
  const userId = learning?.userId
  const lessonId = learning?.lessonId
  const syncReady = learning?.ready ?? true
  const syncPositions = learning?.positions
  const syncSave = learning?.save
  const storageKey = userId && lessonId ? learningStorageKey(userId, lessonId, key) : null
  const interactedRef = useRef(false)
  const restoringRef = useRef(false)
  const observedRef = useRef<VideoPosition | undefined>(undefined)
  const networkSavedAt = useRef(0)
  const saveObservedRef = useRef<(seconds: number, ended?: boolean, keepalive?: boolean) => void>(() => undefined)
  const [waitingFrom, setWaitingFrom] = useState<number | null>(null)
  const [resumedFrom, setResumedFrom] = useState<number | null>(null)
  const [rate, setRateState] = useState(1)
  const pendingRef = useRef<number | null>(null)
  // «Продолжили с …» — только про возврат к месту остановки, не про переход по метке заметки.
  const announceRef = useRef(true)
  const lastSavedRef = useRef(0)
  const rateRef = useRef(1)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const href = window.location.href
    const selectedVideo = new URL(href).searchParams.get('video')
    const fromLink =
      consumedHref !== href && (selectedVideo ? selectedVideo === key : isPrimary(video)) ? parseTimeParam(new URL(href).searchParams.get('t')) : null
    const saved = storageKey ? newerPosition(syncPositions?.[key], readLocalLearningPosition(storageKey)) : undefined
    pendingRef.current = fromLink ?? (interactedRef.current ? null : storageKey ? (saved && !saved.ended && saved.seconds > 0 ? saved.seconds : null) : resumeTarget(readPosition(key), duration))
    if (saved && !observedRef.current) observedRef.current = saved
    let alive = true
    const persistObserved = (seconds: number, ended = false, keepalive = false) => {
      if (!storageKey || !syncSave) { if (!ended) savePosition(key, seconds); return }
      const previous = observedRef.current
      // A late pause/pagehide from an idle tab keeps the timestamp of the real change.
      const position = previous && previous.seconds === Math.floor(seconds) && previous.ended === ended
        ? previous : { seconds: Math.floor(seconds), at: Date.now(), ended }
      observedRef.current = position
      saveLocalLearningPosition(storageKey, position)
      syncSave(key, position, keepalive)
      networkSavedAt.current = Date.now()
    }
    saveObservedRef.current = persistObserved
    if (syncReady && storageKey && saved && (!syncPositions?.[key] || saved.at > syncPositions[key].at)) {
      syncSave?.(key, saved)
    }
    const initialRate = readRate()
    rateRef.current = initialRate
    setRateState(initialRate)
    video.playbackRate = initialRate

    const tryResume = () => {
      const target = pendingRef.current
      if (!syncReady || target === null) return
      if (!canSeek(video, target)) { setWaitingFrom(target); return }
      setWaitingFrom(null)
      pendingRef.current = null
      restoringRef.current = true
      video.currentTime = target
      if (fromLink !== null) consumedHref = href
      if (announceRef.current) setResumedFrom(target)
    }

    const onTime = () => {
      if (pendingRef.current !== null) return
      if (!storageKey) interactedRef.current = true
      if (!interactedRef.current) return
      const t = video.currentTime
      if (storageKey && (!observedRef.current || observedRef.current.seconds !== Math.floor(t))) {
        observedRef.current = { seconds: Math.floor(t), at: Date.now(), ended: false }
      }
      if (Math.abs(t - lastSavedRef.current) < SAVE_EVERY_SECONDS) return
      lastSavedRef.current = t
      if (storageKey && Date.now() - networkSavedAt.current < 10_000) {
        if (observedRef.current) saveLocalLearningPosition(storageKey, observedRef.current)
      } else persistObserved(t)
    }
    const onPause = () => {
      if (pendingRef.current === null && interactedRef.current) persistObserved(video.currentTime)
    }
    let finished = false
    const onEnded = () => {
      finished = true
      persistObserved(video.currentTime, true)
      clearPosition(key)
      window.dispatchEvent(new CustomEvent(VIDEO_ENDED_EVENT))
    }
    const onPlay = () => {
      interactedRef.current = true
      finished = false
      if (!syncReady) pendingRef.current = null
    }
    const onSeeked = () => {
      if (restoringRef.current) { restoringRef.current = false; return }
      interactedRef.current = true
      if (pendingRef.current === null) persistObserved(video.currentTime)
    }
    const onPageHide = () => {
      if (!finished && interactedRef.current && pendingRef.current === null) persistObserved(video.currentTime, false, true)
    }
    const onOnline = () => {
      if (alive && storageKey) {
        const local = readLocalLearningPosition(storageKey)
        if (local) syncSave?.(key, local)
      }
    }
    // Новый источник сбрасывает скорость на 1 — возвращаем выбранную.
    const onMetadata = () => {
      video.playbackRate = rateRef.current
      tryResume()
    }
    // Скорость, поменянная во встроенном меню браузера, тоже запоминается.
    const onRate = () => {
      if (video.playbackRate === rateRef.current) return
      rateRef.current = video.playbackRate
      setRateState(video.playbackRate)
      saveRate(video.playbackRate)
    }

    const onSeek = (event: Event) => {
      const seconds = (event as CustomEvent<{ seconds?: number }>).detail?.seconds
      if (typeof seconds !== 'number' || !isPrimary(video)) return
      announceRef.current = false
      pendingRef.current = seconds
      setResumedFrom(null)
      tryResume()
      video.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    }

    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('online', onOnline)
    video.addEventListener('seeked', onSeeked)
    window.addEventListener(VIDEO_SEEK_EVENT, onSeek)
    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('progress', tryResume)
    video.addEventListener('canplay', tryResume)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('play', onPlay)
    video.addEventListener('ratechange', onRate)
    tryResume()

    return () => {
      // Переход на другой урок посреди просмотра — паузы не будет, фиксируем здесь.
      alive = false
      if (!finished) onPageHide()
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('online', onOnline)
      video.removeEventListener('seeked', onSeeked)
      window.removeEventListener(VIDEO_SEEK_EVENT, onSeek)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('progress', tryResume)
      video.removeEventListener('canplay', tryResume)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('ratechange', onRate)
    }
  }, [videoRef, key, duration, canSeek, storageKey, syncReady, syncPositions, syncSave])

  const setRate = useCallback(
    (next: number) => {
      rateRef.current = next
      setRateState(next)
      saveRate(next)
      if (videoRef.current) videoRef.current.playbackRate = next
    },
    [videoRef],
  )

  const restart = useCallback(() => {
    pendingRef.current = null
    setWaitingFrom(null)
    clearPosition(key)
    setResumedFrom(null)
    lastSavedRef.current = 0
    interactedRef.current = true
    if (videoRef.current) videoRef.current.currentTime = 0
    if (storageKey) saveObservedRef.current(0)
  }, [videoRef, key, storageKey])

  return { resumedFrom, waitingFrom, restart, rate, setRate }
}
