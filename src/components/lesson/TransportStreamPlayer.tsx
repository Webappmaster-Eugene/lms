'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react'

import { useVideoMemory } from '@/hooks/use-video-memory'
import { formatTime } from '@/lib/video-memory'
import { VideoMemoryBar } from './VideoMemoryBar'
import { VideoShareButton } from './VideoShareButton'

type Props = {
  /** Адрес нашего прокси: mpegts.js читает файл запросами из JS. */
  src: string
  /** Исходный адрес ролика — под ним запоминается место остановки. */
  memoryKey: string
  /**
   * Длительность из урока. В контейнере MPEG-TS её нет, поэтому браузер
   * считает такое видео бесконечным: нативная шкала пустая и перемотки нет.
   */
  durationMinutes?: number | null
  onFailure: () => void
}

type PlayerHandle = {
  destroy: () => void
}

/**
 * Проигрывает записи в контейнере MPEG-TS.
 *
 * Браузеры такой контейнер нативно не поддерживают (`canPlayType('video/mp2t')`
 * пустой), поэтому поток разбирается в mp4-фрагменты на клиенте и скармливается
 * MediaSource. Библиотека тяжёлая — грузим её только для таких видео.
 *
 * Управление своё: у MediaSource без длительности нативная панель показывает
 * видео как эфир. Перемотка идёт через плеер — он запрашивает нужный кусок
 * файла по диапазону байт, а не докачивает всё подряд.
 */
/** Прыгать можно только внутрь уже загруженного куска — см. seekTo. */
function bufferedCovers(video: HTMLVideoElement, seconds: number): boolean {
  const { buffered } = video
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= seconds && seconds <= buffered.end(i) - 0.001) return true
  }
  return false
}

export function TransportStreamPlayer({ src, memoryKey, durationMinutes, onFailure }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const playerRef = useRef<PlayerHandle | null>(null)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [position, setPosition] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [bufferAheadBudget, setBufferAheadBudget] = useState(30 * 60)

  const duration = durationMinutes ? durationMinutes * 60 : 0
  const memory = useVideoMemory(videoRef, memoryKey, { duration: duration || null, canSeek: bufferedCovers })
  const requestedBudget = Math.max(30 * 60, (memory.waitingFrom ?? 0) + 60)
  // Shrinking this budget after a successful resume would recreate the source at zero.
  if (requestedBudget > bufferAheadBudget) setBufferAheadBudget(requestedBudget)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false

    async function start(element: HTMLVideoElement) {
      try {
        const mpegts = (await import('mpegts.js')).default
        if (cancelled) return

        if (!mpegts.isSupported()) {
          onFailure()
          return
        }

        // Загрузчик работает в blob-воркере, где у относительного адреса нет базы
        const absolute = new URL(src, window.location.origin).toString()

        const player = mpegts.createPlayer(
          {
            type: 'mpegts',
            url: absolute,
            isLive: false,
            cors: false,
            withCredentials: true,
            ...(duration ? { duration: duration * 1000 } : {}),
          },
          {
            enableWorker: true,
            seekType: 'range',
            // Пока paused-видео стоит на нуле, загрузчик должен дойти до
            // сохранённой позиции даже за пределами обычных 30 минут.
            lazyLoad: true,
            lazyLoadMaxDuration: bufferAheadBudget,
            lazyLoadRecoverDuration: 60,
            // Просмотренное из памяти вычищаем, но с запасом назад
            autoCleanupSourceBuffer: true,
            autoCleanupMaxBackwardDuration: 5 * 60,
            autoCleanupMinBackwardDuration: 3 * 60,
          },
        )

        player.on(mpegts.Events.ERROR, () => {
          if (!cancelled) onFailure()
        })

        player.attachMediaElement(element)
        player.load()

        playerRef.current = {
          destroy: () => {
            player.destroy()
          },
        }

        setReady(true)
      } catch {
        if (!cancelled) onFailure()
      }
    }

    void start(video)

    return () => {
      cancelled = true
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [src, duration, onFailure, bufferAheadBudget])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const sync = () => {
      setPosition(video.currentTime)
      setBuffered(video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onVolume = () => setMuted(video.muted)

    video.addEventListener('timeupdate', sync)
    video.addEventListener('progress', sync)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('volumechange', onVolume)

    return () => {
      video.removeEventListener('timeupdate', sync)
      video.removeEventListener('progress', sync)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('volumechange', onVolume)
    }
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play().catch(() => undefined)
    else video.pause()
  }, [])

  /**
   * В MPEG-TS нет оглавления, поэтому прыгнуть можно только по уже прочитанной
   * части файла. Просьбу уйти дальше приводим к её краю: файл догружается
   * заметно быстрее просмотра, так что через несколько секунд доступно больше.
   */
  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current
    if (!video || video.buffered.length === 0) return

    const first = video.buffered.start(0)
    const last = video.buffered.end(video.buffered.length - 1)
    const target = Math.min(Math.max(seconds, first), Math.max(first, last - 0.001))

    video.currentTime = target
    setPosition(target)
  }, [])

  const onScrub = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!duration) return
      const rect = event.currentTarget.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
      seekTo(ratio * duration)
    },
    [duration, seekTo],
  )

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-black">
        <div className="relative">
          <video
            ref={videoRef}
            className="aspect-video w-full"
            playsInline
            disableRemotePlayback
            onContextMenu={(event) => event.preventDefault()}
            onClick={togglePlay}
          />
          {!ready && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-white/70" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 bg-black px-3 py-2 text-white">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Пауза' : 'Смотреть'}
            className="rounded p-1 transition-colors hover:bg-white/10"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>

          <span className="w-24 flex-shrink-0 text-xs tabular-nums text-white/80">
            {formatTime(position)} / {duration ? formatTime(duration) : '—'}
          </span>

          <div
            role="slider"
            aria-label="Перемотка"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(position)}
            tabIndex={0}
            onClick={onScrub}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') seekTo(position + 10)
              if (event.key === 'ArrowLeft') seekTo(position - 10)
            }}
            title="Перемотка доступна по загруженной части — она обгоняет просмотр"
            className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/20"
          >
            {duration > 0 && (
              <>
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-white/30"
                  style={{ width: `${Math.min(100, (buffered / duration) * 100)}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-white"
                  style={{ width: `${Math.min(100, (position / duration) * 100)}%` }}
                />
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              const video = videoRef.current
              if (video) video.muted = !video.muted
            }}
            aria-label={muted ? 'Включить звук' : 'Выключить звук'}
            className="rounded p-1 transition-colors hover:bg-white/10"
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>

          <button
            type="button"
            onClick={() => void videoRef.current?.requestFullscreen?.().catch(() => undefined)}
            aria-label="Во весь экран"
            className="rounded p-1 transition-colors hover:bg-white/10"
          >
            <Maximize2 className="h-5 w-5" />
          </button>
        </div>
      </div>
      <VideoMemoryBar {...memory} />
      <VideoShareButton videoRef={videoRef} videoId={memoryKey} />
    </div>
  )
}
