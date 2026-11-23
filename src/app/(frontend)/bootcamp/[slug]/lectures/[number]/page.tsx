import Link from 'next/link'
import { notFound } from 'next/navigation'

import { TutoringMeetingCard } from '@/components/tutoring/TutoringMeetingCard'
import { isTutoringMeeting } from '@/lib/tutoring'
import { bootcampLectureArea } from '@/server/tutoring-bootcamps'
import { tutoringMeeting } from '@/server/tutoring'

export const metadata = { title: 'Лекция буткемпа' }

export default async function BootcampLecture({ params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number: raw } = await params
  const area = await bootcampLectureArea(slug)
  const number = Number(raw)
  if (!area || String(number) !== raw || !isTutoringMeeting(number, area.course.program)) notFound()
  const meeting = await tutoringMeeting(area.payload, area.req, area.course.program, number, false)
  if (!meeting) notFound()
  return <div className="mx-auto max-w-4xl space-y-5">
    <Link href={area.base} className="text-sm font-semibold text-primary hover:underline">Все лекции буткемпа</Link>
    <h1 className="sr-only">{meeting.title}</h1>
    <TutoringMeetingCard meeting={meeting} practiceLink={(path) => path.startsWith('/lessons/') ? path : null} />
  </div>
}
