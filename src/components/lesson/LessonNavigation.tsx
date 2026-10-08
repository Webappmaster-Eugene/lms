import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type LessonLink = { slug: string; title: string }

export function LessonNavigation({ previous, next }: { previous: LessonLink | null; next: LessonLink | null }) {
  if (!previous && !next) return null
  return (
    <nav aria-label="Навигация по урокам" className="grid min-w-0 gap-3 sm:grid-cols-2">
      {previous && (
        <Link href={`/lessons/${previous.slug}`} aria-label={`Предыдущий урок: ${previous.title}`} title="Предыдущий урок (←)" className="flex min-h-16 min-w-0 items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <ChevronLeft aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0"><span className="block text-xs text-muted-foreground">Предыдущий урок</span><span className="mt-1 block break-words text-sm font-medium leading-5">{previous.title}</span></span>
        </Link>
      )}
      {next && (
        <Link href={`/lessons/${next.slug}`} aria-label={`Следующий урок: ${next.title}`} title="Следующий урок (→)" className="flex min-h-16 min-w-0 items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring sm:col-start-2">
          <span className="min-w-0 flex-1"><span className="block text-xs text-muted-foreground">Следующий урок</span><span className="mt-1 block break-words text-sm font-medium leading-5">{next.title}</span></span>
          <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </nav>
  )
}
