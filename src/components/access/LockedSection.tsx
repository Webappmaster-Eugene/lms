import type { ReactNode } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'

type LockedSectionProps = {
  readonly title: string
  /** Что ученик найдёт в разделе, когда его откроют. */
  readonly description: ReactNode
  /** Как получить доступ, если путь не через ментора. */
  readonly help?: ReactNode
  readonly action?: ReactNode
}

export const HELP_LINK = <Link href="/help#support" className="font-medium text-primary underline-offset-2 hover:underline">«Помощь»</Link>

/** Раздел без доступа не прячется: объясняем, что в нём и как его получить. Заголовок страницы остаётся у неё самой. */
export function LockedSection({ title, description, help, action }: LockedSectionProps) {
  return (
    <section className="mx-auto max-w-xl space-y-4 rounded-xl border border-border bg-card px-5 py-10 text-center" aria-labelledby="locked-section-title">
      <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h2 id="locked-section-title" className="text-lg font-bold text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {help ?? <>Доступ выдаёт ментор. Если он вам нужен, напишите в разделе {HELP_LINK}.</>}
      </p>
      {action}
    </section>
  )
}
