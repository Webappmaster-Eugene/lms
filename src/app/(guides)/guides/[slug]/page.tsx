import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ArrowLeft, Clock, Download, Lock } from 'lucide-react'
import { BookmarkButton } from '@/components/bookmarks/BookmarkButton'
import { GuideFeedback, type GuideReadState } from '@/components/guides/GuideFeedback'
import { GuideMarkdown } from '@/components/guides/GuideMarkdown'
import { GuideSideToc } from '@/components/guides/GuideSideToc'
import { ShareGuideButton } from '@/components/guides/ShareGuideButton'
import { findBookmarkId } from '@/lib/bookmarks'
import { guideMarkdownHeadings } from '@/lib/guide-markdown'
import { guideReadingMinutes } from '@/lib/guides'
import { guideSeo, guideStructuredData } from '@/lib/guide-seo'
import { learningRelationId } from '@/lib/learning-access'
import { routeSlug } from '@/lib/route-slug'
import { formatDate } from '@/lib/utils'
import { GUIDE_FEEDBACK_MAX } from '@/payload/collections/GuideReads'
import { getLearningRequest } from '@/server/learning-request'
import type { Guide } from '@/payload-types'

type Props = {
  params: Promise<{ slug: string }>
}

type LoadedGuide = Awaited<ReturnType<typeof getLearningRequest>> & { guide: Guide | undefined }

/** Метаданные и страница читают один гайд — запрос к базе один на рендер. */
const loadGuide = cache(async (slug: string): Promise<LoadedGuide> => {
  const { payload, user, req } = await getLearningRequest()
  const result = await payload.find({
    collection: 'guides',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    req,
  })
  return { payload, user, req, guide: result.docs[0] }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { guide } = await loadGuide(routeSlug((await params).slug))
  if (!guide) return { title: 'Гайд' }
  return guideSeo(guide)
}

/** Ссылка на гайд из урока или чата ведёт сюда, даже если гайд ученику не выдан: объясняем, что делать. */
function ClosedGuide() {
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-border bg-card px-5 py-10 text-center">
      <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-bold text-foreground">Этот гайд вам пока не открыт</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Гайды выдаёт ментор. Если он вам нужен, напишите в разделе <Link href="/help#support" className="font-medium text-primary underline-offset-2 hover:underline">«Помощь»</Link> — откроем.
      </p>
      <Link href="/guides" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Все гайды
      </Link>
    </div>
  )
}

export default async function GuidePage({ params }: Props) {
  const slug = routeSlug((await params).slug)
  const { payload, user, req, guide } = await loadGuide(slug)
  if (!guide) {
    if (!user) notFound()
    const exists = await payload.count({ collection: 'guides', where: { and: [{ slug: { equals: slug } }, { isPublished: { equals: true } }] }, overrideAccess: true, req })
    return exists.totalDocs ? <ClosedGuide /> : notFound()
  }

  const markdown = guide.markdown ?? ''
  const headings = guideMarkdownHeadings(markdown)
  const isAdmin = user?.role === 'admin'
  // Закладка и отзыв на черновик не показываются — их не дают создать.
  const [bookmarkId, read] = guide.isPublished && user
    ? await Promise.all([
      findBookmarkId(payload, user.id, { guide: guide.id }),
      isAdmin ? null : payload.find({ collection: 'guide-reads', where: { and: [{ user: { equals: user.id } }, { guide: { equals: guide.id } }] }, select: { helpful: true, comment: true }, limit: 1, depth: 0, overrideAccess: false, req }).then((result) => result.docs[0] ?? null),
    ])
    : [null, null]
  const readState: GuideReadState | null = read ? { id: read.id, helpful: read.helpful ?? null, comment: read.comment ?? null } : null
  const categoryId = learningRelationId(guide.category)
  const category = categoryId != null
    ? (await payload.findByID({ collection: 'guide-categories', id: categoryId, depth: 0, overrideAccess: true, req }).catch(() => null))?.title ?? null
    : null

  return (
    <div className="mx-auto max-w-3xl min-[1400px]:grid min-[1400px]:max-w-[calc(48rem+15rem+2.5rem)] min-[1400px]:grid-cols-[minmax(0,48rem)_15rem] min-[1400px]:gap-10">
      <article className="min-w-0 space-y-6">
        {guide.isPublic && guide.isPublished && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: guideStructuredData(guide) }} />}
        <Link href="/guides" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Все гайды
        </Link>

        <header className="space-y-3">
          {!guide.isPublished && <p className="inline-block rounded-md bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground">Черновик — ученики его пока не видят</p>}
          {category && <p className="text-xs font-semibold uppercase tracking-wide text-primary">{category}</p>}
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{guide.title}</h1>
          <p className="text-base leading-relaxed text-muted-foreground">{guide.summary}</p>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true" />{guide.readingMinutes ?? guideReadingMinutes(markdown)} мин чтения</span>
            {guide.reviewedAt
              ? <span>Данные проверены <time dateTime={guide.reviewedAt}>{formatDate(guide.reviewedAt)}</time></span>
              : <span>Обновлён <time dateTime={guide.updatedAt}>{formatDate(guide.updatedAt)}</time></span>}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/guides/${encodeURIComponent(guide.slug)}/download`}
              download
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Скачать .md
            </a>
            {guide.isPublished && user && <BookmarkButton target={{ guide: guide.id }} initialId={bookmarkId} />}
            <ShareGuideButton title={guide.title} />
          </div>
        </header>

        {headings.length > 1 && (
          <nav aria-labelledby="guide-contents-title" className="rounded-xl border border-border bg-card p-4 sm:p-5 min-[1400px]:hidden">
            <h2 id="guide-contents-title" className="text-sm font-semibold text-foreground">Содержание</h2>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm marker:text-muted-foreground">
              {headings.map((heading) => (
                <li key={heading.id}>
                  <a href={`#${heading.id}`} className="text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{heading.title}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <GuideMarkdown markdown={markdown} />

        {guide.isPublished && user && !isAdmin && <GuideFeedback guideId={guide.id} initial={readState} maxComment={GUIDE_FEEDBACK_MAX} />}
        {isAdmin && (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Ученики видят здесь вопрос «Гайд помог?». Ответы — в CMS: <Link href={`/admin/collections/guide-reads?where[guide][equals]=${guide.id}`} className="font-medium text-primary underline-offset-2 hover:underline">прочтения и отзывы</Link>.
          </p>
        )}

        <footer className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Что-то не получилось или остались вопросы? Напишите в разделе <Link href="/help#support" className="font-medium text-primary underline-offset-2 hover:underline">«Помощь»</Link> — подскажем.
        </footer>
      </article>

      {headings.length > 1 && (
        <aside className="hidden min-[1400px]:block">
          <GuideSideToc headings={headings.map(({ id, title }) => ({ id, title }))} />
        </aside>
      )}
    </div>
  )
}
