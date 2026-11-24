import Link from 'next/link'
import { redirect } from 'next/navigation'

import { TUTORING_MEETING_MINUTES } from '@/lib/tutoring'

import { legacyTutoringStream, requireTutoringProgram } from '@/server/tutoring-bootcamps'
import { tutoringMeetings } from '@/server/tutoring'

export const metadata = { title: 'Репетиторство' }

export default async function BootcampTutoring({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  if (/^[1-9]\d*$/.test(id)) return legacyTutoringStream(id, await searchParams)
  const { payload, req, isAdmin, course, base, memberships } = await requireTutoringProgram(id)
  const link = 'block rounded-md px-3 py-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
  if (!isAdmin && !memberships.some(({ stream }) => stream.program === course.program)) redirect(`${base}/materials`)
  if (!isAdmin) return <section className="space-y-4">
    <h1 className="text-2xl font-semibold">Мои потоки</h1>
    <ul className="divide-y divide-border border-y border-border">
      {memberships.filter(({ stream }) => stream.program === course.program).map(({ stream, member }) => <li key={member.id}>
        <Link href={`${base}/streams/${stream.id}`} className={link}>
          <span className="block font-semibold">{stream.title}</span>
          <span className="text-sm text-muted-foreground">{stream.awaitingFirstLecture ? 'Вводная встреча' : `Ваша встреча ${member.currentMeeting}`}</span>
        </Link>
      </li>)}
    </ul>
  </section>

  const meetings = await tutoringMeetings(payload, req, course.program)
  const weeks = Map.groupBy(meetings, ({ number }) => Math.ceil(number / 2))
  return <section className="space-y-5">
    <h1 className="text-2xl font-semibold">Лекции</h1>
    <Link href={`${base}/introduction`} className={link}><span className="block text-sm text-muted-foreground">60 минут · бесплатно</span><span className="font-semibold">Вводная встреча</span></Link>
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
