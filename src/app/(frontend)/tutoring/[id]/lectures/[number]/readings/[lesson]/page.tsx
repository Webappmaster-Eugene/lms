import { notFound } from 'next/navigation'
import { TutoringReading } from '@/components/tutoring/TutoringReading'
import { isTutoringMeeting } from '@/lib/tutoring'
import { requireTutoringProgram } from '@/server/tutoring-bootcamps'

export default async function LectureReading({ params }: { params: Promise<{ id: string; number: string; lesson: string }> }) {
  const { id, number: raw, lesson } = await params
  const context = await requireTutoringProgram(id)
  const number = Number(raw)
  if (String(number) !== raw || !isTutoringMeeting(number, context.course.program)) notFound()
  return <TutoringReading context={context} number={number} lesson={lesson} back={`${context.base}/lectures/${number}`} />
}
