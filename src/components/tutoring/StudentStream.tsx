import Link from 'next/link'
import { notFound } from 'next/navigation'

import { TutoringMeetingCard } from '@/components/tutoring/TutoringMeetingCard'
import { isTutoringMeeting, tutoringDateLabel, tutoringMeetingDate, tutoringPrograms, tutoringStatuses } from '@/lib/tutoring'
import { cn } from '@/lib/utils'
import type { requireTutoringBootcamp } from '@/server/tutoring-bootcamps'
import { tutoringOpenThrough } from '@/server/tutoring-access'
import { submitTutoringHomework } from '@/server/tutoring-actions'
import { tutoringMeeting, tutoringMeetings, tutoringReviewMap, tutoringReviews } from '@/server/tutoring'

type Query = { meeting?: string; saved?: string; error?: string }
export async function StudentStream({ context, id, query }: { context: Awaited<ReturnType<typeof requireTutoringBootcamp>>; id: string; query: Query }) {
  const { payload, req, course, base, memberships } = context
  const membership = memberships.find(({ stream }) => String(stream.id) === id && stream.program === course.program)
  if (!membership) notFound()
  const { stream, member } = membership
  const selected = query.meeting === undefined ? member.currentMeeting : Number(query.meeting)
  const open = tutoringOpenThrough(stream, member)
  if (!isTutoringMeeting(selected, stream.program) || selected > open) notFound()
  const [materials, meeting, reviews] = await Promise.all([
    tutoringMeetings(payload, req, stream.program),
    tutoringMeeting(payload, req, stream.program, selected, false),
    tutoringReviews(payload, req, [member.id]),
  ])
  const byMeeting = tutoringReviewMap(reviews)
  const review = byMeeting.get(selected)
  const status = review?.status ?? 'assigned'
  const canSubmit = status === 'assigned' || status === 'changes'
  const accepted = reviews.filter(row => row.status === 'accepted').length

  return <div className="mx-auto max-w-5xl space-y-6">
    <Link href={base} className="rounded text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">Мои потоки репетиторства</Link>
    <header className="border-b border-border pb-4">
      <h1 className="text-2xl font-semibold">{stream.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{tutoringPrograms[stream.program].label} · ваша встреча {member.currentMeeting} · принято работ {accepted}</p>
    </header>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-5">
        {meeting ? <TutoringMeetingCard meeting={meeting} stream={stream} /> :
          <p className="rounded-lg bg-muted p-4 text-sm">Материалы этой встречи готовятся. Проверьте позже.</p>}
        {meeting && <section id="homework" aria-labelledby="submit-title" className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 id="submit-title" className="font-semibold">Сдача домашней работы</h2>
          <p className="text-sm">Статус: <strong>{tutoringStatuses[status]}</strong></p>
          {query.error && <p role="alert" className="text-sm text-destructive">{query.error}</p>}
          {query.saved && status === 'submitted' && <p role="status" className="text-sm text-muted-foreground">Работа отправлена на проверку</p>}
          {review?.feedback && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">{review.feedback}</p>}
          {review?.submissionUrl && <Link href={review.submissionUrl} target="_blank" rel="noopener noreferrer"
            className="block break-all rounded text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">Открыть отправленную работу</Link>}
          {canSubmit && <form action={submitTutoringHomework.bind(null, stream.id, selected)} className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-0 flex-1 basis-44 gap-1 text-sm">Ссылка на работу
              <input name="submission" type="url" maxLength={1000} defaultValue={review?.submissionUrl ?? ''} required
                className="min-w-0 rounded-md border border-input bg-background px-3 py-2" />
            </label>
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring">Сдать работу</button>
          </form>}
        </section>}
      </div>
      <nav aria-label="Календарь репетиторства" className="min-w-0 rounded-xl border border-border p-3">
        <h2 className="mb-2 px-2 text-sm font-semibold">Встречи</h2>
        <ol className="divide-y divide-border">
          {materials.map(material => {
            const description = <><span className="block font-medium">{material.number}. {material.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{tutoringDateLabel(tutoringMeetingDate(stream.startsAt, material.number))}
                {byMeeting.has(material.number) && ` · ${tutoringStatuses[byMeeting.get(material.number)?.status ?? 'assigned']}`}</span></>
            return <li key={material.number}>
              {material.number <= open ? <Link href={`${base}/streams/${stream.id}?meeting=${material.number}`} aria-current={selected === material.number ? 'page' : undefined}
                className={cn('block break-words rounded-md px-2 py-2.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring', selected === material.number && 'bg-primary/10')}>{description}</Link>
              : <div className="break-words px-2 py-2.5 text-sm text-muted-foreground">{description}<span className="mt-1 block text-xs">Откроется позже</span></div>}
            </li>
          })}
        </ol>
      </nav>
    </div>
  </div>
}
