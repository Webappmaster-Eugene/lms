import { createLocalReq } from 'payload'

import { guideDownloadDisposition, guideMarkdownFile } from '@/lib/guide-file'
import { getPayload } from '@/lib/payload'
import { routeSlug } from '@/lib/route-slug'
import { siteUrl } from '@/lib/site-metadata'

type Context = { params: Promise<{ slug: string }> }

/** Гайд файлом `.md`: скачать можно ровно то, что можно прочитать на странице. */
export async function GET(request: Request, { params }: Context): Promise<Response> {
  const slug = routeSlug((await params).slug)
  const payload = await getPayload()
  // Доступ к гайдам кэшируется на запрос Payload — один req на авторизацию и выборку.
  const req = await createLocalReq({}, payload)
  const { user } = await payload.auth({ headers: request.headers, req })
  const result = await payload.find({
    collection: 'guides',
    where: { slug: { equals: slug } },
    select: { title: true, slug: true, summary: true, markdown: true, updatedAt: true, reviewedAt: true },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user,
    req,
  })
  const guide = result.docs[0]
  const markdown = guide?.markdown?.trim()
  if (!guide || !markdown) return new Response('Гайд не найден', { status: 404 })

  return new Response(guideMarkdownFile({ ...guide, markdown }, siteUrl()), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': guideDownloadDisposition(guide.slug),
      // Файл зависит от выданного доступа — общие кэши его хранить не должны.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
