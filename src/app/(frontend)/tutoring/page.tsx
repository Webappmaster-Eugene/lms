import Link from 'next/link'
import { managementLink, ManagementHeading } from '@/components/content-management/ManagementHeading'
import { tutoringPrograms } from '@/lib/tutoring'
import { tutoringArea, tutoringPath } from '@/server/tutoring-bootcamps'

export const metadata = { title: 'Менторство' }

export default async function TutoringPage() {
  const { isAdmin, tutoring, memberships } = await tutoringArea()
  return <section className="mx-auto max-w-4xl space-y-6">
    <ManagementHeading title="Менторство" />
    {isAdmin ? <ul className="divide-y divide-border border-y border-border">
      {tutoring.map(({ program }) => <li key={program} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-5">
        <p className="font-semibold">{tutoringPrograms[program].label}</p>
        <div className="flex gap-4">
          <Link className={managementLink} href={tutoringPath(program)}>Лекции</Link>
          <Link className={managementLink} href={tutoringPath(program) + '/streams'}>Потоки</Link>
        </div>
      </li>)}
    </ul> : memberships.length ? <ul className="divide-y divide-border border-y border-border">
      {memberships.map(({ stream, member }) => <li key={member.id}>
        <Link href={`${tutoringPath(stream.program)}/streams/${stream.id}`} className="block rounded px-3 py-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <span className="block font-semibold">{stream.title}</span>
          <span className="text-sm text-muted-foreground">{tutoringPrograms[stream.program].label} · встреча {member.currentMeeting}</span>
        </Link>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">Наставник пока не открыл вам группу.</p>}
  </section>
}
