import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'
import { ArrowLeft, Clock } from 'lucide-react'
import { RichText, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'
import { guideHeadings, guideReadingMinutes } from '@/lib/guides'
import { routeSlug } from '@/lib/route-slug'
import { metaDescription } from '@/lib/site-metadata'
import { formatDate } from '@/lib/utils'
import { getLearningRequest } from '@/server/learning-request'

type Props = {
  params: Promise<{ slug: string }>
}

/** Метаданные и страница читают один гайд — запрос к базе один на рендер. */
const loadGuide = cache(async (slug: string) => {
  const { payload, user, req } = await getLearningRequest()
  if (!user) return { user, guide: undefined }
  const result = await payload.find({
    collection: 'guides',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    req,
  })
  return { user, guide: result.docs[0] }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { guide } = await loadGuide(routeSlug((await params).slug))
  if (!guide) return { title: 'Гайд' }
  return { title: guide.title, description: metaDescription(guide.summary) }
}

export default async function GuidePage({ params }: Props) {
  const slug = routeSlug((await params).slug)
  const { user, guide } = await loadGuide(slug)
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/guides/${slug}`)}`)
  if (!guide) return notFound()

  const headings = guideHeadings(guide.content)
  const anchors = new Map(headings.map((heading) => [heading.index, heading.id]))
  const converters: JSXConvertersFunction = ({ defaultConverters }) => ({
    ...defaultConverters,
    heading: ({ node, nodesToJSX, parent, childIndex }) => {
      const Tag = node.tag
      const id = parent.type === 'root' ? anchors.get(childIndex) : undefined
      return <Tag id={id} className={id ? 'scroll-mt-20' : undefined}>{nodesToJSX({ nodes: node.children })}</Tag>
    },
  })

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link href="/guides" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Все гайды
      </Link>

      <header className="space-y-3">
        {!guide.isPublished && <p className="inline-block rounded-md bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground">Черновик — ученики его пока не видят</p>}
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{guide.title}</h1>
        <p className="text-base leading-relaxed text-muted-foreground">{guide.summary}</p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true" />{guideReadingMinutes(guide.content)} мин чтения</span>
          <span>Обновлён <time dateTime={guide.updatedAt}>{formatDate(guide.updatedAt)}</time></span>
        </p>
      </header>

      {headings.length > 1 && (
        <nav aria-labelledby="guide-contents-title" className="rounded-xl border border-border bg-card p-4 sm:p-5">
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

      <div className="prose prose-sm dark:prose-invert max-w-none break-words sm:prose-base prose-headings:text-foreground prose-a:text-primary prose-strong:text-foreground">
        <RichText data={guide.content} converters={converters} disableContainer />
      </div>

      <footer className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Что-то не получилось или остались вопросы? Напишите в разделе <Link href="/help#support" className="font-medium text-primary underline-offset-2 hover:underline">«Помощь»</Link> — подскажем.
      </footer>
    </article>
  )
}
