'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react'

type Props = {
  /** Адрес нашего прокси: mpegts.js читает файл запросами из JS. */
  src: string
  /**
   * Длительность из урока. В контейнере MPEG-TS её нет, поэтому браузер
   * считает такое видео бесконечным: нативная шкала пустая и перемотки нет.
   */
  durationMinutes?: number | null
  onFailure: () => void
}

type PlayerHandle = {
  seek: (seconds: number) => void
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
export function TransportStreamPlayer({ src, durationMinutes, onFailure }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const playerRef = useRef<PlayerHandle | null>(null)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [position, setPosition] = useState(0)
  const [buffered, setBuffered] = useState(0)

  const duration = durationMinutes ? durationMinutes * 60 : 0

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
          // Перемотка запрашивает нужный диапазон байт, файл целиком не тянется
          { enableWorker: true, lazyLoad: true, lazyLoadMaxDuration: 3 * 60, seekType: 'range' },
        )

        player.on(mpegts.Events.ERROR, () => {
          if (!cancelled) onFailure()
        })

        player.attachMediaElement(element)
        player.load()

        playerRef.current = {
          seek: (seconds) => {
            player.currentTime = seconds
          },
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
  }, [src, duration, onFailure])

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

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current
    if (!video) return
    const target = Math.max(0, seconds)
    // Внутри уже загруженного куска хватает обычной перемотки
    if (video.buffered.length > 0 && target >= video.buffered.start(0) && target <= video.buffered.end(video.buffered.length - 1)) {
      video.currentTime = target
    } else {
      playerRef.current?.seek(target)
    }
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
    <div className="overflow-hidden rounded-xl border border-border bg-black">
      <div className="relative">
        <video
          ref={videoRef}
          className="aspect-video w-full"
          playsInline
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
  )
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(secs).padStart(2, '0')}`
}
