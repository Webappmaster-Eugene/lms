import Link from 'next/link'

import { formatRubles } from '@/lib/bootcamp-admission'
import type { StudentMeetingCharge } from '@/server/tutoring-student-payments'

export function StudentPayments({ charges, streamHref }: { charges: StudentMeetingCharge[]; streamHref?: string }) {
  if (!charges.length) return null
  const due = charges.filter(charge => charge.status === 'due')
  const history = charges.filter(charge => charge.status !== 'due')
  const hasSeveralStreams = new Set(charges.map(charge => charge.streamId)).size > 1

  function row(charge: StudentMeetingCharge) {
    const title = (hasSeveralStreams ? charge.streamTitle + ' · ' : '') + 'Встреча ' + charge.meeting
    const status = { paid: 'Оплачено', due: 'К оплате', cancelled: 'Отменено' }[charge.status]
    return <li key={charge.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-1">
      {streamHref && charge.canOpenMeeting ? <Link href={streamHref + '?meeting=' + charge.meeting + '#payment'}
        className="rounded font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">{title}</Link> : <span>{title}</span>}
      <span>{status} · {formatRubles(charge.amountKopecks)}</span>
    </li>
  }
  return <section aria-label="Оплата занятий" className="min-w-0 space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
    <h2 className="font-semibold">{due.length ? 'К оплате ' + formatRubles(due.reduce((sum, charge) => sum + charge.amountKopecks, 0)) : 'Оплата занятий'}</h2>
    {due.length > 0 && <ul>{due.map(row)}</ul>}
    {history.length > 0 && (streamHref ? <details>
      <summary className="w-fit cursor-pointer rounded py-1 font-medium focus-visible:outline-2 focus-visible:outline-ring">История оплаты</summary>
      <ul>{history.map(row)}</ul>
    </details> : <ul>{history.map(row)}</ul>)}
  </section>
}
