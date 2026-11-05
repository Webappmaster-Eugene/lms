import Link from 'next/link'
import { Tent } from 'lucide-react'

import { LockedSection } from '@/components/access/LockedSection'

/**
 * Каталог курсов пуст. Буткемп в каталог не входит, и ученик буткемпа без других курсов
 * видел «Курсы вам пока не назначены», хотя учится: ведём его в раздел буткемпа.
 */
export function CoursesEmptyState({ hasBootcamp }: { readonly hasBootcamp: boolean }) {
  if (!hasBootcamp) {
    return <LockedSection title="Курсы вам пока не назначены" description="Здесь появятся курсы, которые откроет ментор, с программой и вашим прогрессом." />
  }
  return (
    <LockedSection
      title="Курсов вне буткемпа пока нет"
      description="Ваш буткемп - в отдельном разделе: там методички, уроки и прогресс по неделям. Здесь появятся другие курсы, когда их откроет ментор."
      action={
        <Link href="/bootcamp" className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring">
          <Tent className="h-4 w-4" aria-hidden="true" />
          Открыть буткемп
        </Link>
      }
    />
  )
}
