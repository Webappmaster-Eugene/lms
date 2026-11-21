import Link from 'next/link'

import { ManagementHeading, managementLink, managementPrimary } from '@/components/content-management/ManagementHeading'
import { TutoringMeetingCard } from '@/components/tutoring/TutoringMeetingCard'
import { managedDocument, requireContentAdmin, relationId } from '@/lib/content-management/pages'
import { isTutoringMeeting, tutoringDateLabel, tutoringMeetingDate, tutoringPrograms, tutoringStatuses } from '@/lib/tutoring'
import { getLearningRequest } from '@/server/learning-request'
import { addTutoringParticipant, gradeTutoringHomework, updateTutoringParticipant, updateTutoringStream } from '@/server/tutoring-actions'
import { tutoringMeeting, tutoringMeetings, tutoringParticipants, tutoringReviewMap, tutoringReviews, tutoringStudentName } from '@/server/tutoring'

type Query = { participant?: string; preview?: string; review?: string; error?: string; saved?: string }
const field = 'min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm'
const focus = 'rounded text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring'

export const metadata = { title: 'Журнал репетиторства' }

export default async function TutoringManageStreamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const [{ id }, query, { req }] = await Promise.all([params, searchParams, getLearningRequest()])
  const [{ payload }, stream] = await Promise.all([requireContentAdmin(), managedDocument('tutoring-streams', id)])
  const [members, materials] = await Promise.all([
    tutoringParticipants(payload, req, stream.id),
    tutoringMeetings(payload, req, stream.program),
  ])
  const reviews = await tutoringReviews(payload, req, members.map(member => member.id))
  const selected = members.find(member => String(member.id) === query.participant)
  const selectedReviews = tutoringReviewMap(reviews.filter(review => relationId(review.participant) === selected?.id))
  const totals = new Map<number, { accepted: number; pending: number }>()
  for (const review of reviews) {
    const id = relationId(review.participant)
    if (id === null) continue
    const row = totals.get(id) ?? { accepted: 0, pending: 0 }
    if (review.status === 'accepted') row.accepted++
    if (review.status === 'submitted') row.pending++
    totals.set(id, row)
  }
  const preview = Number(query.preview)
  const reviewNumber = Number(query.review)
  const selectedReview = selectedReviews.get(reviewNumber)
  const selectedWork = materials.find(x => x.number === reviewNumber)
  const meeting = isTutoringMeeting(preview, stream.program) ? await tutoringMeeting(payload, req, stream.program, preview, true) : null
  const program = tutoringPrograms[stream.program]
  const localStart = new Date(Date.parse(stream.startsAt) + 3 * 3_600_000).toISOString()
  const href = `/manage/tutoring/${stream.id}`
  const numbers = Array.from({ length: program.meetings }, (_, i) => i + 1)
  const nameByNumber = new Map(materials.map(material => [material.number, material.title]))
  const meetingOptions = numbers.map(n => <option key={n} value={n}>{n}. {nameByNumber.get(n) ?? 'Материалы готовятся'}</option>)

  return <>
    <Link href="/manage/tutoring" className={focus}>Все потоки репетиторства</Link>
    <ManagementHeading title={stream.title} description={`${program.label}, ${program.meetings} встреч по вторникам и четвергам`} />
    {query.error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{query.error}</p>}
    {query.saved && <p role="status" className="text-sm text-muted-foreground">{query.saved}</p>}

    <section aria-labelledby="opened" className="grid items-start gap-4 rounded-xl border border-border bg-muted/40 p-5 md:grid-cols-[1fr_auto]">
      <div><h2 id="opened" className="font-semibold">Поток дошёл до встречи {stream.currentMeeting}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{nameByNumber.get(stream.currentMeeting) ?? 'Программа ещё не загружена'}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tutoringDateLabel(tutoringMeetingDate(stream.startsAt, stream.currentMeeting))}, МСК</p></div>
      {nameByNumber.has(stream.currentMeeting) && <Link className={managementPrimary} href={`${href}?preview=${stream.currentMeeting}#material`}>Открыть материалы встречи</Link>}
    </section>

    <details className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Календарь и настройки потока</summary>
      <form action={updateTutoringStream.bind(null, stream.id)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Название<input className={field} name="title" required maxLength={120} defaultValue={stream.title} /></label>
        <label className="grid gap-1 text-sm">Доступ<select className={field} name="status" defaultValue={stream.status}>
          <option value="draft">Черновик</option><option value="active">Открыт ученикам</option><option value="archived">Архив</option>
        </select></label>
        <label className="grid gap-1 text-sm">Первый вторник<input className={field} name="date" type="date" required defaultValue={localStart.slice(0, 10)} /></label>
        <label className="grid gap-1 text-sm">Время МСК<input className={field} name="time" type="time" required defaultValue={localStart.slice(11, 16)} /></label>
        <label className="grid gap-1 text-sm">Ссылка на созвон<input className={field} name="meetingUrl" type="url" defaultValue={stream.meetingUrl ?? ''} /></label>
        <label className="grid gap-1 text-sm">Текущая встреча потока<select className={field} name="current" defaultValue={stream.currentMeeting}>{meetingOptions}</select></label>
        <div className="sm:col-span-2"><button className={managementPrimary}>Сохранить настройки</button></div>
      </form>
      <ol className="mt-5 grid gap-1 border-t border-border pt-4 sm:grid-cols-2" aria-label="Календарь встреч">
        {materials.map(material => <li key={material.number} className="text-sm">
          <Link className={focus} href={`${href}?preview=${material.number}#material`}>{material.number}. {material.title}</Link>
          <p className="text-xs text-muted-foreground">{tutoringDateLabel(tutoringMeetingDate(stream.startsAt, material.number))}, МСК</p>
        </li>)}
      </ol>
    </details>

    {meeting && <div id="material"><TutoringMeetingCard meeting={meeting} stream={stream} mentor /></div>}

    <section aria-labelledby="students" className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0">
        <h2 id="students" className="mb-3 text-lg font-semibold">Ученики и успеваемость</h2>
        {members.length ? <ul className="divide-y divide-border border-y border-border">
          {members.map(member => {
            const total = totals.get(member.id)
            return <li key={member.id}><Link href={`${href}?participant=${member.id}#student`} aria-current={selected?.id === member.id ? 'page' : undefined}
              className="grid gap-1 rounded px-2 py-3 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[1fr_auto]">
              <span className="font-semibold">{tutoringStudentName(member)}{!member.active && <span className="font-normal text-muted-foreground"> · доступ закрыт</span>}</span>
              <span className="text-muted-foreground">Встреча {member.currentMeeting} · принято {total?.accepted ?? 0} · на проверке {total?.pending ?? 0}</span>
            </Link></li>
          })}
        </ul> : <p className="text-sm text-muted-foreground">В потоке пока нет учеников.</p>}
      </div>
      <form action={addTutoringParticipant.bind(null, stream.id)} className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">Добавить ученика</h3>
        <label className="grid gap-1 text-sm">Почта аккаунта<input className={field} name="email" type="email" required /></label>
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" name="paid" type="checkbox" value="yes" required />Оплата репетиторства получена</label>
        <button className={managementPrimary}>Добавить в поток</button>
      </form>
    </section>

    {selected && <section id="student" className="space-y-5 border-t border-border pt-5" aria-labelledby="student-title">
      <h2 id="student-title" className="text-xl font-semibold">{tutoringStudentName(selected)}</h2>
      <form action={updateTutoringParticipant.bind(null, stream.id, selected.id)} className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 gap-1 text-sm">Текущая встреча ученика<select className={field} name="current" defaultValue={selected.currentMeeting}>{meetingOptions}</select></label>
        <label className="grid gap-1 text-sm">Доступ<select className={field} name="active" defaultValue={selected.active ? 'yes' : 'no'}>
          <option value="yes">Открыт</option><option value="no">Закрыт</option>
        </select></label>
        <button className={managementPrimary}>Сохранить отметку</button>
      </form>
      {selectedWork && <form id="homework" action={gradeTutoringHomework.bind(null, stream.id, selected.id, selectedWork.number)} className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">Встреча {selectedWork.number}. {selectedWork.title}</h3>
        {selectedReview?.submissionUrl && <Link className={managementLink} href={selectedReview.submissionUrl} target="_blank" rel="noopener noreferrer">Открыть работу ученика</Link>}
        <input type="hidden" name="updatedAt" value={selectedReview?.updatedAt ?? ''} />
        <label className="grid gap-1 text-sm">Статус<select className={field} name="status" defaultValue={selectedReview?.status ?? 'assigned'}>
          {Object.entries(tutoringStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">Комментарий ученику<textarea className={field} name="feedback" rows={3} maxLength={3000} defaultValue={selectedReview?.feedback ?? ''} /></label>
        <div><button className={managementPrimary}>Сохранить результат проверки</button></div>
      </form>}
      <ul aria-label="Домашние работы ученика" className="divide-y divide-border border-y border-border">
        {materials.map(material => {
          const review = selectedReviews.get(material.number)
          return <li key={material.number} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Link className={focus} href={`${href}?participant=${selected.id}&review=${material.number}#homework`}>{material.number}. {material.title}</Link>
            <span className="rounded bg-muted px-2 py-1 text-sm">{tutoringStatuses[review?.status ?? 'assigned']}</span>
          </li>
        })}
      </ul>
    </section>}
  </>
}
