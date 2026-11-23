import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ReplacePresentation } from '@/components/tutoring/ReplacePresentation'
import { TutoringMeetingCard } from '@/components/tutoring/TutoringMeetingCard'
import { isTutoringMeeting } from '@/lib/tutoring'
import { tutoringMeeting } from '@/server/tutoring'
import { requireTutoringProgram } from '@/server/tutoring-bootcamps'

export const metadata = { title: 'Лекция репетиторства' }

export default async function TutoringLecture({ params }: { params: Promise<{ id: string; number: string }> }) {
  const { id, number: rawNumber } = await params
  const { payload, req, isAdmin, course, base } = await requireTutoringProgram(id)
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
