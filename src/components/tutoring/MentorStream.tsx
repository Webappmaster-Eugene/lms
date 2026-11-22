import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ManagementHeading, managementLink, managementPrimary } from '@/components/content-management/ManagementHeading'
import { TutoringMeetingCard } from '@/components/tutoring/TutoringMeetingCard'
import { TutoringSeriesForm } from '@/components/tutoring/TutoringSeriesForm'
import { managedDocument, relationId } from '@/lib/content-management/pages'
import { isTutoringMeeting, moscowMeetingInput, scheduledTutoringMeeting, tutoringDateLabel, tutoringPrograms, tutoringStatuses } from '@/lib/tutoring'
import { tutoringScheduleSlots, tutoringScheduleTimeline } from '@/lib/tutoring-schedule'
import type { requireTutoringBootcamp } from '@/server/tutoring-bootcamps'
import { addTutoringParticipant, gradeTutoringHomework, rescheduleTutoringMeeting, rescheduleTutoringSeries, toggleTutoringStreamCalendar, updateTutoringParticipant, updateTutoringStream } from '@/server/tutoring-actions'
import { getTutoringCalendarSettings } from '@/server/tutoring-calendar-account'
import { googleCalendarAdminPath, tutoringGoogleConfig } from '@/server/tutoring-google'
import { tutoringMeeting, tutoringMeetings, tutoringParticipants, tutoringReviewMap, tutoringReviews, tutoringStudentName } from '@/server/tutoring'
import { tutoringScheduleRevision } from '@/server/tutoring-schedule'

type Query = { participant?: string; preview?: string; review?: string; schedule?: string; error?: string; saved?: string }
const field = 'min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm'
const focus = 'rounded text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring'

export async function MentorStream({ context, id, query }: { context: Awaited<ReturnType<typeof requireTutoringBootcamp>>; id: string; query: Query }) {
  const { payload, req, user, course, base } = context
  const stream = await managedDocument('tutoring-streams', id)
  if (stream.program !== course.program) notFound()
  const calendarAvailable = !!tutoringGoogleConfig()
  const [members, materials, calendar] = await Promise.all([
    tutoringParticipants(payload, req, stream.id),
    tutoringMeetings(payload, req, stream.program),
    calendarAvailable ? getTutoringCalendarSettings(payload, req, user.id) : null,
  ])
  const streamInCalendar = !!calendar?.streams?.some(row => row.streamId === stream.id)
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
  const now = new Date().getTime()
  const schedule = tutoringScheduleSlots(stream)
  const revision = tutoringScheduleRevision(schedule)
  const { upcoming, past } = tutoringScheduleTimeline(schedule, now)
  const href = `${base}/streams/${stream.id}`
  const numbers = Array.from({ length: program.meetings }, (_, i) => i + 1)
  const nameByNumber = new Map(materials.map(material => [material.number, material.title]))
  const meetingOptions = numbers.map(n => <option key={n} value={n}>{n}. {nameByNumber.get(n) ?? 'Материалы готовятся'}</option>)
  const currentSlot = scheduledTutoringMeeting(stream, stream.currentMeeting)

  return <>
    <Link href={`${base}/streams`} className={focus}>Все потоки репетиторства</Link>
    <ManagementHeading title={stream.title} description={`${program.label}, ${program.meetings} встреч`} />
    {query.error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{query.error}</p>}
    {query.saved && <p role="status" className="text-sm text-muted-foreground">{query.saved}</p>}

    <section aria-labelledby="opened" className="grid items-start gap-4 rounded-xl border border-border bg-muted/40 p-5 md:grid-cols-[1fr_auto]">
      <div><h2 id="opened" className="font-semibold">Поток дошёл до встречи {stream.currentMeeting}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{nameByNumber.get(stream.currentMeeting) ?? 'Программа ещё не загружена'}</p>
        <p className="mt-1 text-sm text-muted-foreground">{tutoringDateLabel(currentSlot.start)}, МСК{currentSlot.moved && ' · Перенесено'}</p></div>
      {nameByNumber.has(stream.currentMeeting) && <Link className={managementPrimary} href={`${href}?preview=${stream.currentMeeting}#material`}>Открыть материалы встречи</Link>}
    </section>

    <details id="schedule" open={query.schedule === '1' || undefined} className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Календарь и настройки потока</summary>
      <form action={updateTutoringStream.bind(null, stream.id)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Название<input className={field} name="title" required maxLength={120} defaultValue={stream.title} /></label>
        <label className="grid gap-1 text-sm">Доступ<select className={field} name="status" defaultValue={stream.status}>
          <option value="draft">Черновик</option><option value="active">Открыт ученикам</option><option value="archived">Архив</option>
        </select></label>
        <label className="grid gap-1 text-sm">Ссылка на созвон<input className={field} name="meetingUrl" type="url" defaultValue={stream.meetingUrl ?? ''} /></label>
        <label className="grid gap-1 text-sm">Текущая встреча потока<select className={field} name="current" defaultValue={stream.currentMeeting}>{meetingOptions}</select></label>
        <div className="sm:col-span-2"><button className={managementPrimary}>Сохранить настройки</button></div>
      </form>
      {calendarAvailable && <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-sm">
        <Link className={focus} href={googleCalendarAdminPath}>Google Calendar</Link>
        {calendar?.status === 'connected' || calendar?.status === 'reconnect' ? <>
          <span className="text-muted-foreground">
            {calendar.status === 'reconnect' ? 'Нужно переподключить аккаунт'
              : streamInCalendar && stream.status === 'draft' ? 'Занятия появятся после открытия потока'
                : streamInCalendar && stream.status === 'active' ? 'Синхронизация потока включена' : 'Синхронизация потока выключена'}
          </span>
          {(streamInCalendar || stream.status !== 'archived') && <form action={toggleTutoringStreamCalendar.bind(null, stream.id)}>
            <button className={managementLink} name="enable" value={streamInCalendar ? 'no' : 'yes'}>
              {streamInCalendar ? 'Убрать поток из календаря' : 'Добавить поток в календарь'}
            </button>
          </form>}
        </> : <span className="text-muted-foreground">Подключите аккаунт Google в админке</span>}
      </div>}
      {stream.status !== 'archived' && <TutoringSeriesForm key={revision} slots={schedule} now={now}
        action={rescheduleTutoringSeries.bind(null, stream.id, revision)} />}
      <ol className="mt-5 grid gap-x-6 divide-y divide-border border-t border-border sm:grid-cols-2" aria-label="Календарь встреч">
        {[...upcoming, ...past].map(({ meeting: number }) => {
          const title = nameByNumber.get(number)
          const { original, start, moved } = scheduledTutoringMeeting(stream, number)
          const local = moscowMeetingInput(start)
          return <li key={number} className="space-y-1 py-2 text-sm">
            {title ? <Link className={focus} href={`${href}?preview=${number}#material`}>{number}. {title}</Link> : <span>Встреча {number}</span>}
            <p className="text-xs text-muted-foreground">{tutoringDateLabel(start)}, МСК{moved && ' · Перенесено'}</p>
            {stream.status !== 'archived' && start.getTime() > now && <details>
              <summary className={`${focus} w-fit cursor-pointer`}>Перенести<span className="sr-only"> встречу {number}</span></summary>
              <form action={rescheduleTutoringMeeting.bind(null, stream.id, number)} className="mt-2 flex flex-wrap items-end gap-2">
                <input name="expectedStart" type="hidden" value={start.toISOString()} />
                <label className="grid gap-1">Дата<input name="date" className={field} type="date" required defaultValue={local.slice(0, 10)} /></label>
                <label className="grid gap-1">Время МСК<input name="time" className={field} type="time" required defaultValue={local.slice(11)} /></label>
                <button className={managementPrimary}>Сохранить время</button>
                {moved && original.getTime() > now && <button name="intent" value="reset" formNoValidate className={managementLink}>Вернуть по расписанию</button>}
              </form>
            </details>}
          </li>
        })}
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
