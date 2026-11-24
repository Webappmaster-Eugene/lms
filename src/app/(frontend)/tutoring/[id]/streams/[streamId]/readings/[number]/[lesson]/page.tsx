import { notFound } from 'next/navigation'

import { TutoringReading } from '@/components/tutoring/TutoringReading'
import { isTutoringMeeting } from '@/lib/tutoring'
import { requireTutoringProgram } from '@/server/tutoring-bootcamps'

export default async function StreamReading({ params }: {
  params: Promise<{ id: string; streamId: string; number: string; lesson: string }>
}) {
  const { id, streamId, number: raw, lesson } = await params
  const context = await requireTutoringProgram(id)
  const number = Number(raw)
  if (String(number) !== raw || !isTutoringMeeting(number, context.course.program) || !/^[1-9]\d*$/.test(streamId)) notFound()
  const membership = context.libraryMemberships.find(({ stream }) => String(stream.id) === streamId && stream.program === context.course.program)
  if (!context.isAdmin && (!membership || number > membership.openThrough)) notFound()
  const back = membership?.member.graduatedThrough != null ? `${context.base}/lectures/${number}` : `${context.base}/streams/${streamId}?meeting=${number}`
  return <TutoringReading context={context} number={number} lesson={lesson} back={back} />
}
