import Link from 'next/link'
import type { ReactNode } from 'react'

export const managementLink = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
export const managementPrimary = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring'

export function ManagementHeading({ title, description, breadcrumbs, actions }: {
  title: string
  description?: string
  breadcrumbs?: { href: string; label: string }[]
  actions?: ReactNode
}) {
  return (
    <header className="space-y-4">
      <nav aria-label="Путь к учебному контенту" className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <Link href="/manage" className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Учебный контент</Link>
        {breadcrumbs?.map((crumb) => (
          <span key={crumb.href} className="inline-flex min-w-0 items-center gap-3">
            <span aria-hidden="true">/</span>
            <Link href={crumb.href} className="break-words hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{crumb.label}</Link>
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="break-words text-2xl font-bold text-foreground">{title}</h1>
          {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function PublicationStatus({ published }: { published: boolean }) {
  return <span className={`rounded-md px-2 py-1 text-xs font-medium ${published ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground'}`}>{published ? 'Опубликован' : 'Черновик'}</span>
}
