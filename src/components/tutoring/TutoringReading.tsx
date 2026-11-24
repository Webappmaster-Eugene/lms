import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LessonMarkdown } from '@/components/lesson/LessonMarkdown'
import { learningRelationId } from '@/lib/learning-access'
import { tutoringReadingMarkdown, tutoringReadingTitle } from '@/lib/tutoring-reading'
import { tutoringMeeting } from '@/server/tutoring'
import type { requireTutoringProgram } from '@/server/tutoring-bootcamps'

export async function TutoringReading({ context, number, lesson, back }: {
  context: Awaited<ReturnType<typeof requireTutoringProgram>>; number: number; lesson: string; back: string
}) {
  const { payload, req, course, openThrough } = context
  if (number > openThrough) notFound()
  const material = await tutoringMeeting(payload, req, course.program, number, false)
  const related = material?.homework
    .map(task => task.practice)
    .filter((path): path is string => !!path && /^\/lessons\/[a-z0-9-]+-practice$/.test(path))
    .map(path => path.slice('/lessons/'.length, -'-practice'.length)) ?? []
  if (!related.some(slug => ['theory', 'practice', 'check'].some(part => lesson === `${slug}-${part}`))) notFound()
  // Привязка к домашней работе ограничивает перечень опубликованных методичек этой встречи.
  const { docs: [reading] } = await payload.find({
    collection: 'lessons', req, overrideAccess: true, depth: 0, limit: 1,
    where: { and: [{ course: { equals: course.id } }, { slug: { equals: lesson } }, { isPublished: { equals: true } }] },
    select: { title: true, content: true, section: true },
  })
  const sectionId = learningRelationId(reading?.section)
  if (sectionId !== null) {
    const section = await payload.findByID({
      collection: 'sections', id: sectionId, req, depth: 0, overrideAccess: true, disableErrors: true,
      select: { isPublished: true, course: true },
    })
    if (!section || section.isPublished === false || learningRelationId(section.course) !== course.id) notFound()
  }
  const markdown = reading?.content?.filter(block => block.blockType === 'markdown') ?? []
  if (!reading || !markdown.length) notFound()
  return <article className="mx-auto max-w-4xl space-y-6">
    <Link className="text-sm text-primary hover:underline" href={back}>К материалам встречи</Link>
    <h1 className="text-2xl font-semibold">{tutoringReadingTitle(reading.title)}</h1>
    {markdown.map((block, index) => <LessonMarkdown key={block.id ?? index} markdown={tutoringReadingMarkdown(block.markdown, !context.isAdmin && lesson.endsWith('-check'))} anchorPrefix={`reading-${index}`} />)}
  </article>
}
