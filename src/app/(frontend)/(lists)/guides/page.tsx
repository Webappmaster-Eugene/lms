import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, Clock, Compass } from 'lucide-react'
import { collectAllPages } from '@/lib/paginate'
import { GUIDE_CATEGORIES, guideCategoryLabel, guideIsNew, isGuideCategory } from '@/lib/guides'
import { learningRelationId } from '@/lib/learning-access'
import { cn, formatDate } from '@/lib/utils'
import { getLearningRequest } from '@/server/learning-request'

export const metadata: Metadata = {
  title: 'Гайды',
}

type Props = {
  searchParams: Promise<{ category?: string | string[] }>
}

export default async function GuidesPage({ searchParams }: Props) {
  const { payload, user, req } = await getLearningRequest()
  if (!user) redirect('/login?redirect=%2Fguides')
  const requested = (await searchParams).category
  const category = isGuideCategory(requested) ? requested : null

  // Отбор делает access: ученик получает назначенные ему опубликованные гайды, админ — все, включая черновики.
  const [guides, reads] = await Promise.all([
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'guides',
          sort: ['order', 'id'],
          select: { title: true, slug: true, summary: true, category: true, readingMinutes: true, reviewedAt: true, announcedAt: true, isPublished: true, updatedAt: true },
          depth: 0,
          overrideAccess: false,
          req,
          page,
          limit,
        }),
      { label: 'гайды' },
    ),
    collectAllPages(
      ({ page, limit }) => payload.find({ collection: 'guide-reads', where: { user: { equals: user.id } }, select: { guide: true }, depth: 0, sort: 'id', overrideAccess: false, req, page, limit }),
      { label: 'прочитанные гайды' },
    ),
  ])
  const read = new Set(reads.map((item) => learningRelationId(item.guide)))
  const present = GUIDE_CATEGORIES.filter((item) => guides.some((guide) => guide.category === item.value))
  const shown = category ? guides.filter((guide) => guide.category === category) : guides

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <Compass className="h-7 w-7 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Гайды</h1>
        </div>
        <p className="text-sm text-muted-foreground">Практические инструкции: карьера, работа с ИИ, своё дело — открывайте в любом порядке</p>
      </div>

      {/* Фильтр нужен, когда гайды есть хотя бы в двух категориях. */}
      {present.length > 1 && (
        <nav aria-label="Категории гайдов" className="flex flex-wrap gap-2">
          {[{ value: null, label: 'Все' }, ...present].map((item) => {
            const current = item.value === category
            return (
              <Link
                key={item.value ?? 'all'}
                href={item.value ? `/guides?category=${item.value}` : '/guides'}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-[36px] items-center rounded-full border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                  current ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      )}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-5 py-12 text-center text-muted-foreground">
          {category ? (
            <p>В этой категории гайдов пока нет. <Link href="/guides" className="font-medium text-primary underline-offset-2 hover:underline">Показать все</Link></p>
          ) : user.role === 'admin' ? (
            <p>Гайдов пока нет. Создайте первый в CMS — раздел «Гайды»</p>
          ) : (
            <p>Вам пока не открыт ни один гайд. Гайды выдаёт ментор — если нужен конкретный, напишите в разделе <Link href="/help#support" className="font-medium text-primary underline-offset-2 hover:underline">«Помощь»</Link></p>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {shown.map((guide) => {
            const isRead = read.has(guide.id)
            const isNew = user.role !== 'admin' && guideIsNew(guide.announcedAt, isRead)
            const label = guideCategoryLabel(guide.category)
            return (
              <li key={guide.id}>
                <Link
                  href={`/guides/${guide.slug}`}
                  className="group flex h-full flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring sm:p-5"
                >
                  {(!guide.isPublished || isNew || label) && (
                    <span className="mb-2 flex flex-wrap items-center gap-2">
                      {!guide.isPublished && <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground">Черновик</span>}
                      {isNew && <span className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">Новое</span>}
                      {label && <span className="text-xs font-semibold uppercase tracking-wide text-primary">{label}</span>}
                    </span>
                  )}
                  <h2 className="font-semibold text-foreground transition-colors group-hover:text-primary">{guide.title}</h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{guide.summary}</p>
                  <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {guide.readingMinutes ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{guide.readingMinutes} мин чтения</span> : null}
                    {guide.reviewedAt
                      ? <span>Проверен <time dateTime={guide.reviewedAt}>{formatDate(guide.reviewedAt)}</time></span>
                      : <span>Обновлён <time dateTime={guide.updatedAt}>{formatDate(guide.updatedAt)}</time></span>}
                    {isRead && <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" />Прочитан</span>}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
