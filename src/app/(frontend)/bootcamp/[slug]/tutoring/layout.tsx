import type { ReactNode } from 'react'
import Link from 'next/link'
import { BootcampTabs } from '@/components/tutoring/BootcampTabs'
import { TutoringNavigation } from '@/components/tutoring/TutoringNavigation'
import { requireTutoringBootcamp } from '@/server/tutoring-bootcamps'

export default async function TutoringLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { course, base, hasManuals, isAdmin } = await requireTutoringBootcamp((await params).slug)
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="space-y-2">
      <Link href="/bootcamp" className="text-sm text-primary hover:underline">Буткемпы</Link>
      <p className="text-xl font-semibold">{course.title}</p>
      <BootcampTabs label="Разделы буткемпа" items={[
        ...(hasManuals ? [{ href: `/bootcamp/${encodeURIComponent(course.slug)}`, label: 'Методички', active: false }] : []),
        { href: base, label: 'Репетиторство', active: true },
      ]} />
      {isAdmin && <TutoringNavigation base={base} />}
    </header>
    {children}
  </div>
}
