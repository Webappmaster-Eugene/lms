'use client'

import { useState } from 'react'
import { ExternalLink, Play, Clock, AlertTriangle } from 'lucide-react'

import { parsePublicResourceUrl } from '@/lib/yandex-disk-url'

type Props = {
  title: string
  videoUrl: string
  displayMode: 'embed' | 'link'
  description?: string | null
  durationMinutes?: number | null
}

/**
 * Определяет sandbox-политику в зависимости от источника видео.
 * YouTube не требует allow-same-origin.
 */
function getSandboxPolicy(url: string): string {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'allow-scripts allow-popups'
  }
  return 'allow-scripts allow-same-origin allow-popups'
}

function getEmbedUrl(url: string): string {
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/,
  )
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`
  }

  return url
}

/** Ссылка на файл Яндекс.Диска, которую наш сервер превращает в прямой поток. */
function getStreamUrl(videoUrl: string): string {
  return `/api/yandex-disk/stream?url=${encodeURIComponent(videoUrl)}`
}

export function VideoPlayer({ title, videoUrl, displayMode, description, durationMinutes }: Props) {
  const [streamFailed, setStreamFailed] = useState(false)

  const isYandexDisk = parsePublicResourceUrl(videoUrl) !== null

  if (displayMode === 'link') {
    return (
      <VideoLinkCard
        title={title}
        videoUrl={videoUrl}
        description={description}
        durationMinutes={durationMinutes}
      />
    )
  }

  // Яндекс.Диск запрещает встраивание своих страниц в iframe, поэтому его видео
  // проигрывается нативным плеером через серверный редирект на прямую ссылку.
  if (isYandexDisk) {
    if (streamFailed) {
      return (
        <VideoLinkCard
          title={title}
          videoUrl={videoUrl}
          description={description}
          durationMinutes={durationMinutes}
          note="Видео не удалось загрузить в плеер — откройте его на Яндекс.Диске"
        />
      )
    }

    return (
      <div className="space-y-3">
        <VideoHeading title={title} description={description} durationMinutes={durationMinutes} />
        <div className="overflow-hidden rounded-xl border border-border bg-black">
          <video
            key={videoUrl}
            src={getStreamUrl(videoUrl)}
            className="aspect-video w-full"
            controls
            preload="metadata"
            controlsList="nodownload"
            onError={() => setStreamFailed(true)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <VideoHeading title={title} description={description} durationMinutes={durationMinutes} />
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border">
        <iframe
          src={getEmbedUrl(videoUrl)}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          sandbox={getSandboxPolicy(videoUrl)}
        />
      </div>
    </div>
  )
}

function VideoHeading({
  title,
  description,
  durationMinutes,
}: Pick<Props, 'title' | 'description' | 'durationMinutes'>) {
  return (
    <>
      <div className="flex items-center gap-3">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {durationMinutes && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {durationMinutes} мин
          </span>
        )}
      </div>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </>
  )
}

function VideoLinkCard({
  title,
  videoUrl,
  description,
  durationMinutes,
  note,
}: Pick<Props, 'title' | 'videoUrl' | 'description' | 'durationMinutes'> & { note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-info/10">
          <Play className="h-6 w-6 text-info" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          {durationMinutes && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {durationMinutes} мин
            </p>
          )}
          {note && (
            <p className="mt-1 flex items-center gap-1 text-xs text-warning">
              <AlertTriangle className="h-3 w-3" />
              {note}
            </p>
          )}
        </div>
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Смотреть
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}
