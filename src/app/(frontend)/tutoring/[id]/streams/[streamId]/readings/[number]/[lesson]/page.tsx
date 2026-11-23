import Link from 'next/link'
import { notFound } from 'next/navigation'

import { LessonMarkdown } from '@/components/lesson/LessonMarkdown'
import { learningRelationId } from '@/lib/learning-access'
import { isTutoringMeeting } from '@/lib/tutoring'
import { tutoringOpenThrough } from '@/server/tutoring-access'
import { requireTutoringProgram } from '@/server/tutoring-bootcamps'
import { tutoringMeeting } from '@/server/tutoring'

export default async function TutoringReading({ params }: {
  params: Promise<{ id: string; streamId: string; number: string; lesson: string }>
}) {
  const { id, streamId, number: raw, lesson } = await params
  const { payload, req, course, base, isAdmin, memberships } = await requireTutoringProgram(id)
  const number = Number(raw)
  if (String(number) !== raw || !isTutoringMeeting(number, course.program) || !/^[1-9]\d*$/.test(streamId)) notFound()
  if (!isAdmin) {
    const membership = memberships.find(({ stream }) => String(stream.id) === streamId && stream.program === course.program)
    if (!membership || number > tutoringOpenThrough(membership.stream, membership.member)) notFound()
  }
  const material = await tutoringMeeting(payload, req, course.program, number, false)
  const related = material?.homework
    .map(task => task.practice)
    .filter((path): path is string => !!path && /^\/lessons\/[a-z0-9-]+-practice$/.test(path))
    .map(path => path.slice('/lessons/'.length, -'-practice'.length)) ?? []
  if (!related.some(slug => ['theory', 'practice', 'check'].some(part => lesson === `${slug}-${part}`))) notFound()
  // Оба продукта используют опубликованный урок, а доступ проверяется по встрече потока.
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
    <Link className="text-sm text-primary hover:underline" href={`${base}/streams/${streamId}?meeting=${number}`}>К материалам встречи</Link>
    <h1 className="text-2xl font-semibold">{reading.title}</h1>
    {markdown.map((block, index) => <LessonMarkdown key={block.id ?? index} markdown={block.markdown} anchorPrefix={`reading-${index}`} />)}
  </article>
}
