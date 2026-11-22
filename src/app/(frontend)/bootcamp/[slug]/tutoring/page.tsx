import Link from 'next/link'

import { TUTORING_MEETING_MINUTES } from '@/lib/tutoring'

import { requireTutoringBootcamp } from '@/server/tutoring-bootcamps'
import { tutoringMeetings } from '@/server/tutoring'

export const metadata = { title: 'Репетиторство' }

export default async function BootcampTutoring({ params }: { params: Promise<{ slug: string }> }) {
  const { payload, req, isAdmin, course, base, memberships } = await requireTutoringBootcamp((await params).slug)
  const link = 'block rounded-md px-3 py-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
  if (!isAdmin) return <section className="space-y-4">
    <h1 className="text-2xl font-semibold">Мои потоки</h1>
    <ul className="divide-y divide-border border-y border-border">
      {memberships.filter(({ stream }) => stream.program === course.program).map(({ stream, member }) => <li key={member.id}>
        <Link href={`${base}/streams/${stream.id}`} className={link}>
          <span className="block font-semibold">{stream.title}</span>
          <span className="text-sm text-muted-foreground">Ваша встреча {member.currentMeeting}</span>
        </Link>
      </li>)}
    </ul>
  </section>

  const meetings = await tutoringMeetings(payload, req, course.program)
  const weeks = Map.groupBy(meetings, ({ number }) => Math.ceil(number / 2))
  return <section className="space-y-5">
    <h1 className="text-2xl font-semibold">Лекции</h1>
    {!meetings.length && <p className="text-muted-foreground">Лекции ещё не загружены.</p>}
    <div className="grid gap-4 md:grid-cols-2">
      {[...weeks].map(([week, lectures]) => <section key={week} className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 px-3 text-sm font-semibold text-muted-foreground">Неделя {week}</h2>
        <ul className="divide-y divide-border">
          {lectures.map(meeting => <li key={meeting.number}>
            <Link href={`${base}/lectures/${meeting.number}`} className={link}>
              <span className="block text-xs text-muted-foreground">{meeting.number % 2 ? 'Вторник' : 'Четверг'} · {TUTORING_MEETING_MINUTES} минут</span>
              <span className="font-semibold">{meeting.title}</span>
            </Link>
          </li>)}
        </ul>
      </section>)}
    </div>
  </section>
}
