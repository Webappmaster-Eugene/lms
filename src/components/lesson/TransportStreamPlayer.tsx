'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

type Props = {
  /** Адрес нашего прокси: mpegts.js читает файл запросами из JS. */
  src: string
  onFailure: () => void
}

/**
 * Проигрывает записи в контейнере MPEG-TS.
 *
 * Браузеры такой контейнер нативно не поддерживают (`canPlayType('video/mp2t')`
 * пустой), поэтому поток разбирается в mp4-фрагменты на клиенте и скармливается
 * MediaSource. Библиотека тяжёлая, грузим её только для таких видео.
 */
export function TransportStreamPlayer({ src, onFailure }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    let destroy: (() => void) | null = null

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
          { type: 'mpegts', url: absolute, isLive: false, cors: false, withCredentials: true },
          // Перемотка работает Range-запросами, поэтому файл не тянется целиком
          { enableWorker: true, lazyLoad: true, lazyLoadMaxDuration: 3 * 60, seekType: 'range' },
        )

        player.on(mpegts.Events.ERROR, () => {
          if (!cancelled) onFailure()
        })

        player.attachMediaElement(element)
        player.load()

        destroy = () => {
          player.destroy()
        }

        setLoading(false)
      } catch {
        if (!cancelled) onFailure()
      }
    }

    void start(video)

    return () => {
      cancelled = true
      destroy?.()
    }
  }, [src, onFailure])

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-black">
      <video ref={videoRef} className="aspect-video w-full" controls preload="metadata" />
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        </div>
      )}
    </div>
  )
}
