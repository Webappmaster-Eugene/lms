'use client'

type Props = {
  title: string
  embedUrl: string
  height?: number | null
}

export function MiroEmbed({ title, embedUrl, height }: Props) {
  const frameHeight = height ?? 600

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <div
        className="w-full overflow-hidden rounded-xl border border-border"
        style={{ height: `${frameHeight}px` }}
      >
        <iframe
          src={embedUrl}
          title={title}
          className="h-full w-full"
          allow="fullscreen"
          allowFullScreen
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      </div>
    </div>
  )
}
