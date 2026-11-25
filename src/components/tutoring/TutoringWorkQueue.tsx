import Link from 'next/link'

import { scheduledTutoringMeeting, TUTORING_INTRODUCTION_MINUTES, tutoringDateLabel, tutoringPrograms, type TutoringProgram } from '@/lib/tutoring'
import { formatRubles } from '@/lib/bootcamp-admission'
import type { TutoringStream } from '@/payload-types'
import { taskLabels, tutoringWorkQueue, type TutoringTask, type TutoringTaskKind } from '@/server/tutoring-work-queue'

type NextMeeting = { stream: TutoringStream; date: Date; number?: number }
const taskKinds: TutoringTaskKind[] = ['review', 'project', 'payment']
const focus = 'rounded text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring'

function nextMeeting(streams: TutoringStream[], now: number) {
  const upcoming: NextMeeting[] = []
  for (const stream of streams) {
    if (stream.status !== 'active') continue
    if (stream.awaitingFirstLecture) {
      if (stream.introductionStartsAt && Date.parse(stream.introductionStartsAt) + TUTORING_INTRODUCTION_MINUTES * 60_000 > now) {
        upcoming.push({ stream, date: new Date(stream.introductionStartsAt) })
      }
      continue
    }
    for (let number = stream.currentMeeting; number <= tutoringPrograms[stream.program].meetings; number++) {
      const slot = scheduledTutoringMeeting(stream, number)
      if (slot.end.getTime() <= now) continue
      upcoming.push({ stream, date: slot.start, number })
      break
    }
  }
  return upcoming.sort((a, b) => a.date.getTime() - b.date.getTime())[0]
}

function taskLink(base: string, task: TutoringTask) {
  const room = `${base}/streams/${task.stream}?participant=${task.member}`
  if (task.kind === 'project') return room + '#project'
  return room + `&review=${task.meeting}#${task.kind === 'payment' ? 'payment' : 'homework'}`
}

export async function TutoringWorkQueue({ program, streams, kind, page }: {
  program: TutoringProgram; streams: TutoringStream[]; kind?: string; page?: string
}) {
  const queue = await tutoringWorkQueue(program, kind, page)
  const path = queue.base + '/streams'
  const next = nextMeeting(streams, queue.now)
  const pendingInvites = streams.filter(stream => stream.status === 'active' && Array.isArray(stream.invitesAwaitingIdentity) && stream.invitesAwaitingIdentity.length)
  if (!next && !queue.kind && !queue.tasks.length && !pendingInvites.length) return null
  return <section className="space-y-4 border-b border-border pb-5" aria-label="Дела наставника" id="tasks">
    {next && !queue.kind && <div>
      <h2 className="font-semibold">Ближайшее занятие</h2>
      <Link className={focus} href={`${path}/${next.stream.id}${next.number ? `?preview=${next.number}#material` : ''}`}>
        {next.stream.title} · {next.number ? `Встреча ${next.number}` : 'Вводная встреча'} · {tutoringDateLabel(next.date)}, МСК
      </Link>
    </div>}
    {pendingInvites.length > 0 && !queue.kind && <div>
      <h2 className="font-semibold">Приглашения до сверки почты</h2>
      <ul>{pendingInvites.map(stream => <li key={stream.id}>
        <Link className={`block min-h-11 py-2 ${focus}`} href={`${path}/${stream.id}#pending-invitations`}>{stream.title} · Сверить адреса</Link>
      </li>)}</ul>
    </div>}
    {taskKinds.map(category => {
      const items = queue.tasks.filter(row => row.kind === category)
      if (!items.length) return null
      const groupPath = `${path}?tasks=${category}`
      return <div key={category}>
        <h2 className="font-semibold">{taskLabels[category]} ({items[0].total})</h2>
        <ul className="divide-y divide-border">{items.map(item =>
          <li key={`${item.member}-${item.meeting}`}><Link className={`block min-h-11 py-2 wrap-anywhere ${focus}`} href={taskLink(queue.base, item)}>
            {item.email} · {item.title}{item.meeting != null && ` · Встреча ${item.meeting}`}
            {item.amount != null && ` · ${formatRubles(Number(item.amount))}`}
          </Link></li>
        )}</ul>
        {!queue.kind && items[0].total > queue.size && <Link className={focus} href={groupPath + '#tasks'}>Показать все ({items[0].total})</Link>}
        {queue.kind && <nav className="flex flex-wrap gap-4" aria-label="Страницы списка">
          {queue.page > 1 && <Link className={focus} href={`${groupPath}&page=${queue.page - 1}#tasks`}>Назад</Link>}
          {items[0].total > queue.page * queue.size && <Link className={focus} href={`${groupPath}&page=${queue.page + 1}#tasks`}>Дальше</Link>}
        </nav>}
      </div>
    })}
    {queue.kind && <div>{!queue.tasks.length && <p>На этой странице дел нет.</p>}<Link className={focus} href={path + '#tasks'}>Все дела наставника</Link></div>}
  </section>
}
