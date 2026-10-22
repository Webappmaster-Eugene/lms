import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Clock, Compass } from 'lucide-react'
import { collectAllPages } from '@/lib/paginate'
import { guideReadingMinutes } from '@/lib/guides'
import { formatDate } from '@/lib/utils'
import { getLearningRequest } from '@/server/learning-request'

export const metadata: Metadata = {
  title: 'Гайды',
}

export default async function GuidesPage() {
  const { payload, user, req } = await getLearningRequest()
  if (!user) redirect('/login?redirect=%2Fguides')

  // Отбор делает access: ученик получает назначенные ему опубликованные гайды, админ — все, включая черновики.
  const guides = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'guides',
        sort: ['order', 'id'],
        select: { title: true, slug: true, summary: true, markdown: true, content: true, isPublished: true, updatedAt: true },
        depth: 0,
        overrideAccess: false,
        req,
        page,
        limit,
      }),
    { label: 'гайды' },
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Compass className="h-7 w-7 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Гайды</h1>
        </div>
        <p className="text-sm text-muted-foreground">Пошаговые инструкции для поиска работы и карьеры — открывайте в любом порядке</p>
      </div>

      {guides.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-12 text-center text-muted-foreground">
          {user.role === 'admin' ? (
            <p>Гайдов пока нет. Создайте первый в CMS — раздел «Гайды»</p>
          ) : (
            <p>Вам пока не открыт ни один гайд. Гайды выдаёт ментор — если нужен конкретный, напишите в разделе <Link href="/help#support" className="font-medium text-primary underline-offset-2 hover:underline">«Помощь»</Link></p>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {guides.map((guide) => (
            <li key={guide.id}>
              <Link
                href={`/guides/${guide.slug}`}
                className="group flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring sm:p-5"
              >
                {!guide.isPublished && <span className="mb-2 self-start rounded-md bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground">Черновик</span>}
                <h2 className="font-semibold text-foreground transition-colors group-hover:text-primary">{guide.title}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{guide.summary}</p>
                <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{guideReadingMinutes(guide)} мин чтения</span>
                  <span>Обновлён <time dateTime={guide.updatedAt}>{formatDate(guide.updatedAt)}</time></span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
