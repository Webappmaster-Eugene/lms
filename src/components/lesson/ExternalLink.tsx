import { ExternalLink as ExternalLinkIcon } from 'lucide-react'

type Platform = 'boosty' | 'telegram' | 'youtube' | 'github' | 'other'

type Props = {
  title: string
  url: string
  platform?: Platform | null
  description?: string | null
}

const PLATFORM_LABELS: Record<Platform, string> = {
  boosty: 'Boosty',
  telegram: 'Telegram',
  youtube: 'YouTube',
  github: 'GitHub',
  other: 'Ссылка',
}

const PLATFORM_COLORS: Record<Platform, string> = {
  boosty: 'bg-orange-500/10 text-orange-500',
  telegram: 'bg-sky-500/10 text-sky-500',
  youtube: 'bg-red-500/10 text-red-500',
  github: 'bg-gray-500/10 text-gray-400',
  other: 'bg-primary/10 text-primary',
}

export function ExternalLinkBlock({ title, url, platform, description }: Props) {
  const p = platform ?? 'other'

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${PLATFORM_COLORS[p]}`}>
        <ExternalLinkIcon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-foreground group-hover:text-primary transition-colors">
          {title}
        </p>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{PLATFORM_LABELS[p]}</p>
      </div>
      <ExternalLinkIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
    </a>
  )
}
