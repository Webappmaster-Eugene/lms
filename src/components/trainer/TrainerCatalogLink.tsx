import Link from 'next/link'
import type { ReactNode } from 'react'

export function TrainerCatalogLink({ allowed, href, className, children }: { allowed: boolean; href: string; className: string; children: ReactNode }) {
  return allowed
    ? <Link href={href} className={className}>{children}</Link>
    : <div className={className} data-access="locked">{children}</div>
}
