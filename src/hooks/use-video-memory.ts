'use client'

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
    const fromLink =
      consumedHref !== href && isPrimary(video) ? parseTimeParam(new URL(href).searchParams.get('t')) : null
    if (fromLink !== null) consumedHref = href
    pendingRef.current = fromLink ?? resumeTarget(readPosition(key), duration)
    const initialRate = readRate()
    rateRef.current = initialRate
    setRateState(initialRate)
    video.playbackRate = initialRate

    const tryResume = () => {
      const target = pendingRef.current
      if (target === null || !canSeek(video, target)) return
      pendingRef.current = null
      video.currentTime = target
      if (announceRef.current) setResumedFrom(target)
    }

    const onTime = () => {
      if (pendingRef.current !== null) return
      const t = video.currentTime
      if (Math.abs(t - lastSavedRef.current) < SAVE_EVERY_SECONDS) return
      lastSavedRef.current = t
      savePosition(key, t)
    }
    const onPause = () => {
      if (pendingRef.current === null && video.currentTime > 0) savePosition(key, video.currentTime)
    }
    let finished = false
    const onEnded = () => {
      finished = true
      clearPosition(key)
      window.dispatchEvent(new CustomEvent(VIDEO_ENDED_EVENT))
    }
    const onPlay = () => {
      finished = false
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
      if (!finished) onPause()
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
  }, [videoRef, key, duration, canSeek])

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
    clearPosition(key)
    setResumedFrom(null)
    lastSavedRef.current = 0
    if (videoRef.current) videoRef.current.currentTime = 0
  }, [videoRef, key])

  return { resumedFrom, restart, rate, setRate }
}
