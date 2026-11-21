import Link from 'next/link'
import { redirect } from 'next/navigation'

import { tutoringPrograms } from '@/lib/tutoring'
import { getLearningRequest } from '@/server/learning-request'
import { tutoringMemberships } from '@/server/tutoring-access'

export const metadata = { title: 'Репетиторство' }

export default async function TutoringPage() {
  const { payload, user, req } = await getLearningRequest()
  if (!user) redirect('/login')
  const memberships = await tutoringMemberships(payload, req, user.id)
  return <div className="mx-auto max-w-4xl space-y-5">
    <h1 className="text-2xl font-semibold">Репетиторство</h1>
    {!memberships.length ? <p className="text-muted-foreground">У вас пока нет открытых потоков репетиторства.</p> :
      <ul className="divide-y divide-border border-y border-border">
        {memberships.map(({ stream, member }) => <li key={member.id}>
          <Link href={`/tutoring/${stream.id}`} className="block rounded px-2 py-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            <span className="block font-semibold">{stream.title}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{tutoringPrograms[stream.program].label} · ваша встреча {member.currentMeeting}</span>
          </Link>
        </li>)}
      </ul>}
  </div>
}
