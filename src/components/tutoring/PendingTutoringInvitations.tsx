import Link from 'next/link'

import { managementLink, managementPrimary } from '@/components/content-management/ManagementHeading'
import type { TutoringStream } from '@/payload-types'
import { cancelWaitingTutoringInvite, retryTutoringInvitations } from '@/server/tutoring-actions'
import { tutoringInvitesAwaitingIdentity } from '@/server/tutoring-invitations'

export function PendingTutoringInvitations({ stream }: { stream: TutoringStream }) {
  const waiting = tutoringInvitesAwaitingIdentity(stream)
  if (!waiting.length) return null
  return <section id="pending-invitations" aria-labelledby="pending-invitations-title" className="min-w-0 space-y-3 rounded-xl border border-border p-4">
    <h2 id="pending-invitations-title" className="text-lg font-semibold">Нужно сверить почту</h2>
    <p className="text-sm text-muted-foreground">Откройте карточку ученика и проверьте, что указанный адрес принадлежит ему. После подтверждения вернитесь в поток и повторите приглашения.</p>
    <ul className="divide-y divide-border">
      {waiting.map(row => <li key={row.email} className="flex flex-wrap items-center gap-3 py-2 text-sm">
        <span className="min-w-0 wrap-anywhere">{row.email}</span>
        <Link className={managementLink} href={`/admin/learning-access?user=${row.studentId}#enrollment-identity`}>Сверить адрес<span className="sr-only"> {row.email}</span></Link>
        <form action={cancelWaitingTutoringInvite.bind(null, stream.id, row.studentId, row.email)}>
          <button className="min-h-11 text-muted-foreground hover:underline">Отменить приглашение<span className="sr-only"> {row.email}</span></button>
        </form>
      </li>)}
    </ul>
    {stream.status === 'active' && <form action={retryTutoringInvitations.bind(null, stream.id)}>
      <button className={managementPrimary}>Повторить приглашения</button>
    </form>}
  </section>
}
