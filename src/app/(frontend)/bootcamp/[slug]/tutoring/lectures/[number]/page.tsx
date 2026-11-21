import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ReplacePresentation } from '@/components/tutoring/ReplacePresentation'
import { TutoringMeetingCard } from '@/components/tutoring/TutoringMeetingCard'
import { isTutoringMeeting } from '@/lib/tutoring'
import { tutoringMeeting } from '@/server/tutoring'
import { requireTutoringBootcamp } from '@/server/tutoring-bootcamps'

export const metadata = { title: 'Лекция репетиторства' }

export default async function TutoringLecture({ params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number: rawNumber } = await params
  const { payload, req, isAdmin, course, base } = await requireTutoringBootcamp(slug)
  const number = Number(rawNumber)
  if (!isAdmin || String(number) !== rawNumber || !isTutoringMeeting(number, course.program)) notFound()
  const meeting = await tutoringMeeting(payload, req, course.program, number, true)
  if (!meeting) notFound()

  return <div className="max-w-4xl space-y-5">
    <Link href={base} className="text-sm font-semibold text-primary hover:underline">Все лекции</Link>
    <h1 className="sr-only">{meeting.title}</h1>
    <TutoringMeetingCard meeting={meeting} mentor />
    <ReplacePresentation id={meeting.id} updatedAt={meeting.updatedAt} manual={meeting.deckOrigin === 'manual'} />
  </div>
}
