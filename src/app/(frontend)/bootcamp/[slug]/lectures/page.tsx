import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BootcampTabs } from '@/components/tutoring/BootcampTabs'
import { bootcampLectureArea } from '@/server/tutoring-bootcamps'
import { tutoringMeetings } from '@/server/tutoring'

export const metadata = { title: 'Лекции буткемпа' }

export default async function BootcampLectures({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const area = await bootcampLectureArea(slug)
  if (!area) notFound()
  const lectures = await tutoringMeetings(area.payload, area.req, area.course.program)

  return <section className="mx-auto max-w-4xl space-y-5">
    <h1 className="text-2xl font-semibold">{area.course.title}</h1>
    <BootcampTabs label="Разделы буткемпа" items={[
      { href: `/bootcamp/${encodeURIComponent(slug)}`, label: 'Методички', active: false },
      { href: area.base, label: 'Лекции', active: true },
    ]} />
    <ol className="divide-y divide-border border-y border-border">
      {lectures.map(lecture => <li key={lecture.number}>
        <Link className="block rounded px-3 py-3 font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring" href={`${area.base}/${lecture.number}`}>
          {lecture.number}. {lecture.title}
        </Link>
      </li>)}
    </ol>
    {!lectures.length && <p className="text-muted-foreground">Лекции пока не опубликованы.</p>}
  </section>
}
