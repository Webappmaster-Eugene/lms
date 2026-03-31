'use client'

import { ExternalLink, Play, Clock } from 'lucide-react'

type Props = {
  title: string
  videoUrl: string
  displayMode: 'embed' | 'link'
  description?: string | null
  durationMinutes?: number | null
}

/**
 * Преобразует ссылку на Яндекс.Диск в embed URL.
 * Яндекс.Диск публичные ссылки: https://disk.yandex.ru/i/... или https://disk.yandex.ru/d/...
 * Embed формат: https://disk.yandex.ru/i/... → добавляем ?iframe=1
 */
/**
 * Определяет sandbox-политику в зависимости от источника видео.
 * YouTube не требует allow-same-origin.
 * Яндекс.Диск требует allow-same-origin для корректной работы плеера.
 */
function getSandboxPolicy(url: string): string {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'allow-scripts allow-popups'
  }
  // Яндекс.Диск и другие — нужен same-origin для плеера
  return 'allow-scripts allow-same-origin allow-popups'
}

function getEmbedUrl(url: string): string {
  // YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/,
  )
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`
  }

  // Яндекс.Диск — добавляем параметр для iframe
  if (url.includes('disk.yandex')) {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}iframe=1`
  }

  // Для остальных возвращаем как есть
  return url
}

export function VideoPlayer({ title, videoUrl, displayMode, description, durationMinutes }: Props) {
  if (displayMode === 'link') {
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

  // Embed mode
  const embedUrl = getEmbedUrl(videoUrl)

  return (
    <div className="space-y-3">
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
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border">
        <iframe
          src={embedUrl}
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
