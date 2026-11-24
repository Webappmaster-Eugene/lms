import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { IntroPractice } from '@/components/tutoring/IntroPractice'
import { tutoringProject } from '@/server/tutoring-projects'
import { SlidesBlock } from '@/components/lesson/SlidesBlock'
import { ReplacePresentation } from '@/components/tutoring/ReplacePresentation'
import { requireTutoringProgram } from '@/server/tutoring-bootcamps'

export const metadata = { title: 'Вводная встреча' }

export default async function Introduction({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params
  const query = await searchParams
  const { payload, req, course, base, isAdmin, user, memberships } = await requireTutoringProgram(id)
  const { docs: [intro] } = await payload.find({
    collection: 'tutoring-introductions', where: { program: { equals: course.program } }, limit: 1, depth: 1,
    req, user, overrideAccess: false, populate: { 'tutoring-deck-files': { filename: true } },
    select: { deckPdf: true, updatedAt: true, deckPptx: true, instructorNotes: true, deckOrigin: true },
  })
  const streams = memberships.filter(entry => entry.stream.program === course.program)
  const project = streams.length ? await tutoringProject(payload, req, user.id, course.program) : null
  const file = intro && typeof intro.deckPdf === 'object' && intro.deckPdf.filename
  const editable = isAdmin && intro?.deckPptx && typeof intro.deckPptx === 'object' && intro.deckPptx.filename
  return <article className="min-w-0 max-w-5xl space-y-5">
    <Link href={base} className="text-sm text-primary hover:underline">К программе</Link>
    <header>
      <p className="text-sm text-muted-foreground">60 минут · бесплатно</p>
      <h1 className="text-2xl font-semibold">Вводная встреча</h1>
    </header>
    {file ? <SlidesBlock title="Проект и порядок занятий" annotations={isAdmin} items={[{
      fileName: file, caption: 'Вводная встреча', url: `/api/tutoring-deck-files/file/${encodeURIComponent(file)}`,
    }]} /> : <p>Материалы вводной встречи готовятся.</p>}
    {query.error && <p role="alert">{query.error}</p>}
    {query.saved && <p role="status">{query.saved}</p>}
    {streams.map(({ member, stream }) => <div key={stream.id} className="space-y-2">
      {streams.length > 1 && <p className="font-medium">{stream.title}</p>}
      <IntroPractice stream={stream.id} participant={member} project={project} />
    </div>)}
    {editable && <a className="inline-flex min-h-11 items-center text-primary hover:underline"
      href={`/api/tutoring-deck-files/file/${encodeURIComponent(editable)}`} download>Скачать редактируемый PPTX</a>}
    {isAdmin && intro && <>
      <details className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer font-semibold">Сценарий и заметки ведущего</summary>
        <div className="prose prose-sm dark:prose-invert mt-4 max-w-prose prose-pre:overflow-x-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{intro.instructorNotes}</ReactMarkdown>
        </div>
      </details>
      <ReplacePresentation id={intro.id} updatedAt={intro.updatedAt} manual={intro.deckOrigin === 'manual'} introduction={course.program} />
    </>}
  </article>
}
