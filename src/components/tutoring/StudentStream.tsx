import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { IntroPractice } from '@/components/tutoring/IntroPractice'
import { ProjectCheck, ProjectStatus } from '@/components/tutoring/ProjectStatus'
import { tutoringMergeRequest, tutoringProject, tutoringVerdict } from '@/server/tutoring-projects'
import { MeetingPaymentStatus } from '@/components/tutoring/MeetingPayment'
import { tutoringCharge } from '@/server/tutoring-payments'
import { TutoringMeetingCard } from '@/components/tutoring/TutoringMeetingCard'
import { isTutoringMeeting, TUTORING_INTRODUCTION_MINUTES, tutoringDateLabel, tutoringPrograms, tutoringStatuses } from '@/lib/tutoring'
import { tutoringScheduleSlots, tutoringScheduleTimeline, type TutoringScheduleSlot } from '@/lib/tutoring-schedule'
import { cn } from '@/lib/utils'
import type { requireTutoringProgram } from '@/server/tutoring-bootcamps'
import { tutoringOpenThrough } from '@/server/tutoring-access'
import { submitTutoringHomework } from '@/server/tutoring-actions'
import { tutoringMeeting, tutoringMeetings, tutoringReviewMap, tutoringReviews } from '@/server/tutoring'

type Query = { meeting?: string; saved?: string; error?: string }
export async function StudentStream({ context, id, query }: { context: Awaited<ReturnType<typeof requireTutoringProgram>>; id: string; query: Query }) {
  const { payload, req, course, base, user, memberships } = context
  const membership = memberships.find(({ stream }) => String(stream.id) === id && stream.program === course.program)
  if (!membership) {
    const graduate = context.libraryMemberships.find(({ member, stream }) =>
      member.graduatedThrough != null && String(stream.id) === id && stream.program === course.program)
    if (!graduate) notFound()
    if (query.meeting === undefined) redirect(`${base}/materials`)
    const number = Number(query.meeting)
    if (!isTutoringMeeting(number, course.program) || String(number) !== query.meeting || number > graduate.openThrough) notFound()
    redirect(`${base}/lectures/${number}`)
  }
  const { stream, member } = membership
  const selected = query.meeting === undefined ? member.currentMeeting : Number(query.meeting)
  const open = tutoringOpenThrough(stream, member)
  const introOnly = open === 0
  if (!isTutoringMeeting(selected, stream.program) || (selected > open && (!introOnly || query.meeting !== undefined))) notFound()
  const [materials, meeting, reviews, charge, project] = await Promise.all([
    tutoringMeetings(payload, req, stream.program),
    introOnly ? null : tutoringMeeting(payload, req, stream.program, selected, false),
    introOnly ? [] : tutoringReviews(payload, req, [member.id]),
    introOnly ? null : tutoringCharge(payload, req, member.id, selected),
    tutoringProject(payload, req, user.id, stream.program),
  ])
  const byMeeting = tutoringReviewMap(reviews)
  const review = byMeeting.get(selected)
  const mrIid = project?.projectUrl && review?.submissionUrl ? tutoringMergeRequest(project.projectUrl, review.submissionUrl) : null
  const check = project && mrIid ? await tutoringVerdict(payload, req, project.id, mrIid) : null
  const status = review?.status ?? 'assigned'
  const canSubmit = status === 'assigned' || status === 'changes'
  const accepted = reviews.filter(row => row.status === 'accepted').length
  const program = tutoringPrograms[stream.program]
  const now = new Date().getTime()
  const { upcoming, past } = tutoringScheduleTimeline(tutoringScheduleSlots(stream), now)
  const names = new Map(materials.map(material => [material.number, material.title]))

  function meetingRow({ meeting: number, startsAt, scheduledAt }: TutoringScheduleSlot) {
    const title = names.get(number)
    const meetingReview = byMeeting.get(number)
    const description = <><span className="block font-medium">{title ? `${number}. ${title}` : `Встреча ${number}`}</span>
      <span className="mt-1 block text-xs text-muted-foreground">
        <time dateTime={startsAt}>{tutoringDateLabel(new Date(startsAt))}, МСК</time>{startsAt !== scheduledAt && ' · Перенесено'}
        {meetingReview && ` · ${tutoringStatuses[meetingReview.status]}`}
      </span></>
    return <li key={number}>
      {number <= open ? <Link href={`${base}/streams/${stream.id}?meeting=${number}`} aria-current={selected === number ? 'page' : undefined}
        className={cn('block break-words rounded-md px-2 py-2.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring', selected === number && 'bg-primary/10')}>{description}</Link>
      : <div className="break-words px-2 py-2.5 text-sm text-muted-foreground">{description}<span className="mt-1 block text-xs">Откроется позже</span></div>}
    </li>
  }

  const introduction = <div className="mb-3 space-y-1 border-b border-border px-2 pb-3 text-sm">
    <Link href={`${base}/introduction`} className="block rounded font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">Вводная встреча</Link>
    <span className="block text-xs text-muted-foreground">
      {stream.introductionStartsAt ? <time dateTime={stream.introductionStartsAt}>{tutoringDateLabel(new Date(stream.introductionStartsAt))}, МСК</time> : 'Без назначенной даты'} · {TUTORING_INTRODUCTION_MINUTES} минут · Бесплатно
    </span>
    {stream.meetingUrl && stream.introductionStartsAt && Date.parse(stream.introductionStartsAt) + TUTORING_INTRODUCTION_MINUTES * 60_000 > now && <Link href={stream.meetingUrl} target="_blank" rel="noopener noreferrer" className="block rounded text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">Созвон вводной встречи</Link>}
  </div>

  return <div className="mx-auto max-w-5xl space-y-6">
    <Link href={base} className="rounded text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">Мои потоки репетиторства</Link>
    <header className="border-b border-border pb-4">
      <h1 className="text-2xl font-semibold">{stream.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{program.label}{introOnly ? ' · вводная встреча' : ` · ваша встреча ${member.currentMeeting} · принято работ ${accepted}`}</p>
    </header>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-5">
        {introOnly && <section className="rounded-xl border border-border bg-card p-4" aria-label="Начало обучения">
          {introduction}
          <p className="mb-4 text-sm">После вводной наставник откроет первую техническую лекцию.</p>
          <IntroPractice stream={stream.id} participant={member} project={project} />
        </section>}
        {meeting && <TutoringMeetingCard meeting={meeting} stream={stream} practiceLink={(path) => `${base}/streams/${id}/readings/${selected}/${path.slice(9)}`} />}
        {!introOnly && !meeting && <p className="rounded-lg bg-muted p-4 text-sm">Материалы этой встречи готовятся. Проверьте позже.</p>}
        {charge && <section className="rounded-xl border border-border bg-card p-4" aria-label="Оплата встречи"><MeetingPaymentStatus charge={charge} /></section>}
        {meeting && <section id="homework" aria-labelledby="submit-title" className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 id="submit-title" className="font-semibold">Сдача домашней работы</h2>
          <ProjectStatus project={project} />
          {check && <ProjectCheck check={check} />}
          <p className="text-sm">Статус: <strong>{tutoringStatuses[status]}</strong></p>
          {query.error && <p role="alert" className="text-sm text-destructive">{query.error}</p>}
          {query.saved && status === 'submitted' && <p role="status" className="text-sm text-muted-foreground">Работа отправлена на проверку</p>}
          {review?.feedback && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">{review.feedback}</p>}
          {review?.submissionUrl && <Link href={review.submissionUrl} target="_blank" rel="noopener noreferrer"
            className="block break-all rounded text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">Открыть отправленную работу</Link>}
          {canSubmit && meeting.homework.length > 1 && <p className="text-sm text-muted-foreground">
            Если работы лежат в двух запросах на слияние, укажите здесь второй. В его описании добавьте ссылку на первый.
          </p>}
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
        {!introOnly && introduction}
        <h2 className="mb-2 px-2 text-sm font-semibold">Предстоящие встречи</h2>
        {upcoming.length ? <ol className="divide-y divide-border">{upcoming.map(meetingRow)}</ol> :
          <p className="px-2 text-sm text-muted-foreground">Предстоящих встреч пока нет.</p>}
        {past.length > 0 && <details open={past.some(slot => slot.meeting === selected) || undefined} className="mt-2 border-t border-border pt-2">
          <summary className="cursor-pointer rounded px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Прошедшие встречи ({past.length})</summary>
          <ol className="mt-2 divide-y divide-border">{past.map(meetingRow)}</ol>
        </details>}
      </nav>
    </div>
  </div>
}
