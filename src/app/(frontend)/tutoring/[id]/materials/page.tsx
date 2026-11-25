import Link from 'next/link'
import { StudentPayments } from '@/components/tutoring/StudentPayments'
import { requireTutoringProgram } from '@/server/tutoring-bootcamps'
import { tutoringMeetings } from '@/server/tutoring'
import { studentMeetingCharges } from '@/server/tutoring-student-payments'

export const metadata = { title: 'Мои материалы' }

export default async function TutoringMaterials({ params }: { params: Promise<{ id: string }> }) {
  const { payload, req, course, base, openThrough, libraryMemberships } = await requireTutoringProgram((await params).id)
  const [available, charges] = await Promise.all([
    tutoringMeetings(payload, req, course.program, openThrough),
    studentMeetingCharges(payload, req, libraryMemberships.filter(({ stream }) => stream.program === course.program)),
  ])
  const link = 'block rounded px-3 py-3 font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
  return <section className="max-w-4xl space-y-4">
    <h1 className="text-2xl font-semibold">Мои материалы</h1>
    <StudentPayments charges={charges} />
    <Link className={link} href={`${base}/introduction`}>Вводная встреча</Link>
    <ol className="divide-y divide-border border-y border-border">{available.map(meeting =>
      <li key={meeting.id}><Link className={link} href={`${base}/lectures/${meeting.number}`}>
        <span className="block text-sm font-normal text-muted-foreground">Встреча {meeting.number}</span>
        {meeting.title}
      </Link></li>)}</ol>
  </section>
}
