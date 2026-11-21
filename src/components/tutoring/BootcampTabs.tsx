import Link from 'next/link'
import { cn } from '@/lib/utils'

export function BootcampTabs({ label, items }: { label: string; items: { href: string; label: string; active: boolean }[] }) {
  return <nav aria-label={label} className="flex flex-wrap gap-x-5 border-b border-border">
    {items.map(({ href, label: title, active }) => <Link key={href} href={href} aria-current={active ? 'page' : undefined}
      className={cn('inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring',
        active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
      {title}
    </Link>)}
  </nav>
}
