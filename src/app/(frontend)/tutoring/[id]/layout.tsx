import type { ReactNode } from 'react'
import Link from 'next/link'
import { TutoringNavigation } from '@/components/tutoring/TutoringNavigation'
import { requireTutoringProgram } from '@/server/tutoring-bootcamps'
import { isTutoringProgram, tutoringPrograms } from '@/lib/tutoring'

export default async function TutoringLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isTutoringProgram(id)) return children
  const { base, isAdmin } = await requireTutoringProgram(id)
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="space-y-2">
      <Link href="/tutoring" className="text-sm text-primary hover:underline">Менторство</Link>
      <p className="text-xl font-semibold">{tutoringPrograms[id].label}</p>
      {isAdmin ? <TutoringNavigation base={base} /> :
        <Link href={`${base}/materials`} className="inline-block rounded py-1 text-sm font-semibold text-primary hover:underline">Мои материалы</Link>}
    </header>
    {children}
  </div>
}
