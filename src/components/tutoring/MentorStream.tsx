import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ManagementHeading, managementLink, managementPrimary } from '@/components/content-management/ManagementHeading'
import { TutoringMeetingCard } from '@/components/tutoring/TutoringMeetingCard'
import { PendingTutoringInvitations } from '@/components/tutoring/PendingTutoringInvitations'
import { MentorProject, ProjectCheck } from '@/components/tutoring/ProjectStatus'
import { tutoringMergeRequest, tutoringProject, tutoringVerdict } from '@/server/tutoring-projects'
import { MentorMeetingPayment } from '@/components/tutoring/MeetingPayment'
import { MeetingAttendance } from '@/components/tutoring/MeetingAttendance'
import { TutoringSeriesForm } from '@/components/tutoring/TutoringSeriesForm'
import { managedDocument, relationId } from '@/lib/content-management/pages'
import { isTutoringMeeting, moscowMeetingInput, scheduledTutoringMeeting, TUTORING_INTRODUCTION_MINUTES, tutoringDateLabel, tutoringPrograms, tutoringStatuses } from '@/lib/tutoring'
import { tutoringScheduleSlots, tutoringScheduleTimeline } from '@/lib/tutoring-schedule'
import type { requireTutoringProgram } from '@/server/tutoring-bootcamps'
import { closeTutoringEnrollment, addTutoringParticipant, gradeTutoringHomework, releaseFirstLecture, rescheduleTutoringIntroduction, rescheduleTutoringMeeting, rescheduleTutoringSeries, toggleTutoringStreamCalendar, updateTutoringParticipant, updateTutoringStream } from '@/server/tutoring-actions'
import { getTutoringCalendarSettings } from '@/server/tutoring-calendar-account'
import { googleCalendarAdminPath, tutoringGoogleConfig } from '@/server/tutoring-google'
import { tutoringMeeting, tutoringMeetings, tutoringParticipants, tutoringReviewMap, tutoringReviews, tutoringStudentName } from '@/server/tutoring'
import { tutoringCharge } from '@/server/tutoring-payments'
import { meetingCharges } from '@/server/tutoring-attendance'
import { tutoringScheduleRevision } from '@/server/tutoring-schedule'

type Query = { participant?: string; preview?: string; review?: string; schedule?: string; error?: string; saved?: string }
const field = 'min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm'
const focus = 'rounded text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring'

export async function MentorStream({ context, id, query }: { context: Awaited<ReturnType<typeof requireTutoringProgram>>; id: string; query: Query }) {
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
  const billingMeeting = stream.awaitingFirstLecture ? null : isTutoringMeeting(reviewNumber, stream.program) ? reviewNumber : selected?.currentMeeting
  const charge = selected && billingMeeting ? await tutoringCharge(payload, req, selected.id, billingMeeting) : null
  const studentId = relationId(selected?.student)
  const project = studentId ? await tutoringProject(payload, req, studentId, stream.program) : null
  const mrIid = project?.projectUrl && selectedReview?.submissionUrl ? tutoringMergeRequest(project.projectUrl, selectedReview.submissionUrl) : null
  const check = project && mrIid ? await tutoringVerdict(payload, req, project.id, mrIid) : null
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
  const groupMeeting = members.reduce((current, member) => member.active ? Math.max(current, member.currentMeeting) : current, stream.currentMeeting)
  const current = isTutoringMeeting(preview, stream.program) ? preview
    : selected?.active ? Math.max(stream.currentMeeting, selected.currentMeeting) : groupMeeting
  const currentSlot = scheduledTutoringMeeting(stream, current)
  const charges = stream.status === 'active' && !stream.awaitingFirstLecture
    ? await meetingCharges(payload, req, members.map(member => member.id), current) : []
  const attended = new Set(charges.flatMap(row => {
    const memberId = relationId(row.participant)
    return row.attendedAt && memberId !== null ? [memberId] : []
  }))

  return <>
    <Link href={`${base}/streams`} className={focus}>Все потоки репетиторства</Link>
    <ManagementHeading title={stream.title} description={`${program.label}, ${program.meetings} встреч`} />
    {query.error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{query.error}</p>}
    {query.saved && <p role="status" className="text-sm text-muted-foreground">{query.saved}</p>}

    <section aria-labelledby="opened" className="grid items-start gap-4 rounded-xl border border-border bg-muted/40 p-5 md:grid-cols-[1fr_auto]">
      {stream.awaitingFirstLecture ? <>
        <div><h2 id="opened" className="font-semibold">Вводная встреча</h2>
          <Link href={`${base}/introduction`} className={focus}>Открыть вводные материалы</Link>
        </div>
        {stream.status === 'active' && <form action={releaseFirstLecture.bind(null, stream.id, stream.updatedAt)}>
          <button className={managementPrimary}>Открыть первую лекцию</button>
        </form>}
      </> : <>
        <div><h2 id="opened" className="font-semibold">Встреча {current}. {nameByNumber.get(current) ?? 'Материалы готовятся'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tutoringDateLabel(currentSlot.start)}, МСК{currentSlot.moved && ' · Перенесено'}</p>
          {stream.meetingUrl && <Link href={stream.meetingUrl} target="_blank" rel="noopener noreferrer" className={focus}>Перейти на созвон</Link>}</div>
        {nameByNumber.has(current) && <Link className={managementPrimary} href={`${href}?preview=${current}#material`}>Открыть материалы встречи</Link>}
      </>}
    </section>
    {stream.status === 'active' && !stream.awaitingFirstLecture && <MeetingAttendance stream={stream} meeting={current}
      members={members} attended={attended} started={currentSlot.start.getTime() <= now} />}

    <details id="schedule" open={query.schedule === '1' || undefined} className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Календарь и настройки потока</summary>
      <form action={updateTutoringStream.bind(null, stream.id)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="updatedAt" value={stream.updatedAt} />
        <label className="grid gap-1 text-sm">Название<input className={field} name="title" required maxLength={120} defaultValue={stream.title} /></label>
        <label className="grid gap-1 text-sm">Доступ<select className={field} name="status" defaultValue={stream.status}>
          <option value="draft">Черновик</option><option value="active">Открыт ученикам</option><option value="archived">Архив</option>
        </select></label>
        <label className="grid gap-1 text-sm">Ссылка на созвон<input className={field} name="meetingUrl" type="url" defaultValue={stream.meetingUrl ?? ''} /></label>
        <label className="grid gap-1 text-sm">Ставка, ₽ за час<input className={field} name="rate" inputMode="decimal" required={!!stream.hourlyKopecks}
          defaultValue={stream.hourlyKopecks ? String(stream.hourlyKopecks / 100) : ''} /></label>
        {stream.status === 'draft' && <label className="grid gap-1 text-sm sm:col-span-2">Кого пригласить при открытии
          <textarea name="pendingInviteEmails" className={field} rows={3} defaultValue={stream.pendingInviteEmails ?? ''} />
          <span className="text-muted-foreground">Каждый адрес с новой строки.</span>
        </label>}
        {stream.awaitingFirstLecture ? <input type="hidden" name="current" value={stream.currentMeeting} /> :
          <label className="grid gap-1 text-sm">Открыть всем материалы по встречу<select className={field} name="current" defaultValue={stream.currentMeeting}>{meetingOptions}</select></label>}
        <div className="sm:col-span-2"><button className={managementPrimary}>Сохранить настройки</button></div>
      </form>
      <section className="mt-5 space-y-2 border-t border-border pt-4">
        <h3 className="font-semibold"><Link className={focus} href={`${base}/introduction`}>Вводная встреча</Link></h3>
        <p className="text-sm text-muted-foreground">
          {stream.introductionStartsAt ? <time dateTime={stream.introductionStartsAt}>{tutoringDateLabel(new Date(stream.introductionStartsAt))}, МСК</time> : 'Дата пока не назначена'} · {TUTORING_INTRODUCTION_MINUTES} минут · Бесплатно
        </p>
        {stream.status !== 'archived' && (stream.introductionStartsAt ? Date.parse(stream.introductionStartsAt) > now : !stream.awaitingFirstLecture || schedule.every(slot => Date.parse(slot.startsAt) > now)) &&
          <form action={rescheduleTutoringIntroduction.bind(null, stream.id)} className="flex min-w-0 flex-wrap items-end gap-2">
            <input name="expectedStart" type="hidden" value={stream.introductionStartsAt ?? ''} />
            <label className="grid min-w-0 gap-1 text-sm">Дата и время вводной, МСК
              <input className={`${field} w-full`} type="datetime-local" name="introductionStartsAt" required
                defaultValue={stream.introductionStartsAt ? moscowMeetingInput(new Date(stream.introductionStartsAt)) : undefined} />
            </label>
            <button className={managementPrimary}>{stream.introductionStartsAt ? 'Перенести вводную' : 'Назначить вводную'}</button>
          </form>}
      </section>
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
      {stream.status !== 'archived' && <TutoringSeriesForm key={revision} slots={schedule} now={now} introductionStartsAt={stream.introductionStartsAt} awaitingFirstLecture={stream.awaitingFirstLecture}
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

    <PendingTutoringInvitations stream={stream} />
    <section aria-labelledby="students" className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0">
        <h2 id="students" className="mb-3 text-lg font-semibold">Ученики и успеваемость</h2>
        {members.length ? <ul className="divide-y divide-border border-y border-border">
          {members.map(member => {
            const total = totals.get(member.id)
            return <li key={member.id}><Link href={`${href}?participant=${member.id}#student`} aria-current={selected?.id === member.id ? 'page' : undefined}
              className="grid gap-1 rounded px-2 py-3 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[1fr_auto]">
              <span className="font-semibold">{tutoringStudentName(member)}{!member.active && <span className="font-normal text-muted-foreground"> · {member.graduatedThrough != null ? 'выпускник' : 'доступ закрыт'}</span>}</span>
              <span className="text-muted-foreground">Встреча {member.currentMeeting} · принято {total?.accepted ?? 0} · на проверке {total?.pending ?? 0}</span>
            </Link></li>
          })}
        </ul> : <p className="text-sm text-muted-foreground">В потоке пока нет учеников.</p>}
      </div>
      <form action={addTutoringParticipant.bind(null, stream.id)} className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">Добавить ученика</h3>
        <label className="grid gap-1 text-sm">Почта ученика<input className={field} name="email" type="email" required /></label>
        <button className={managementPrimary}>Добавить в поток</button>
      </form>
    </section>

    {selected && <section id="student" className="space-y-5 border-t border-border pt-5" aria-labelledby="student-title">
      <h2 id="student-title" className="text-xl font-semibold">{tutoringStudentName(selected)}</h2>
      {selected.introSubmissionUrl && <Link className={focus} href={selected.introSubmissionUrl}
        rel="noopener noreferrer" target="_blank">Открыть пробную работу вводной встречи</Link>}
      <MentorProject stream={stream.id} participant={selected.id} project={project} inviteEmail={selected.gitlabInviteEmail} enabled={selected.active && stream.status === 'active'} />
      {billingMeeting && <MentorMeetingPayment stream={stream.id} participant={selected.id} meeting={billingMeeting} charge={charge} hourlyKopecks={stream.hourlyKopecks} />}
      {selected.graduatedThrough == null && <form action={updateTutoringParticipant.bind(null, stream.id, selected.id)} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="revision" value={selected.updatedAt} />
        <label className="grid min-w-0 gap-1 text-sm">Текущая встреча ученика<select className={field} name="current" defaultValue={selected.currentMeeting}>{stream.awaitingFirstLecture ? <option value={1}>Вводная встреча</option> : meetingOptions}</select></label>
        <label className="grid gap-1 text-sm">Доступ<select className={field} name="active" defaultValue={selected.active ? 'yes' : 'no'}>
          <option value="yes">Открыт</option><option value="no">Закрыт</option>
        </select></label>
        <button className={managementPrimary}>Сохранить отметку</button>
      </form>}
      {selected.active && stream.status === 'active' && <form action={closeTutoringEnrollment.bind(null, stream.id, selected.id, selected.updatedAt, 'graduate')} className="space-y-2">
        <p className="text-sm text-muted-foreground">{stream.awaitingFirstLecture ? 'После выпуска у ученика останется вводная встреча.' : `После выпуска ученик сможет читать материалы по встречу ${Math.max(stream.currentMeeting, selected.currentMeeting)} включительно.`} Сдача работ завершится.</p>
        <button className={managementLink}>Завершить обучение</button>
      </form>}
      {selected.graduatedThrough != null && <form action={closeTutoringEnrollment.bind(null, stream.id, selected.id, selected.updatedAt, 'revoke')} className="space-y-2">
        <p className="text-sm">Обучение завершено. {selected.graduatedThrough === 0 ? 'Выпускнику доступна вводная встреча.' : `Доступны материалы по встречу ${selected.graduatedThrough} включительно.`}</p>
        <button className={managementLink}>Закрыть доступ к материалам</button>
      </form>}
      {!stream.awaitingFirstLecture && selectedWork && <form id="homework" action={gradeTutoringHomework.bind(null, stream.id, selected.id, selectedWork.number)} className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <h3 className="font-semibold">Встреча {selectedWork.number}. {selectedWork.title}</h3>
        {selectedReview?.submissionUrl && <Link className={managementLink} href={selectedReview.submissionUrl} target="_blank" rel="noopener noreferrer">Открыть работу ученика</Link>}
        {check && <ProjectCheck check={check} />}
        <input type="hidden" name="updatedAt" value={selectedReview?.updatedAt ?? ''} />
        {selectedReview?.status !== 'submitted' && <label className="grid gap-1 text-sm">Статус<select className={field} name="status" defaultValue={selectedReview?.status ?? 'assigned'}>
          {Object.entries(tutoringStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>}
        <label className="grid gap-1 text-sm">Комментарий ученику<textarea className={field} name="feedback" rows={3} maxLength={3000} defaultValue={selectedReview?.feedback ?? ''} /></label>
        {selectedReview?.status === 'submitted' ? <div className="flex flex-wrap items-center gap-3">
          <button name="status" value="accepted" className={managementPrimary}>Принять работу</button>
          <button name="status" value="changes" className={managementLink}>Вернуть на доработку</button>
        </div> : <div><button className={managementPrimary}>Сохранить результат проверки</button></div>}
      </form>}
      {!stream.awaitingFirstLecture && <ul aria-label="Домашние работы ученика" className="divide-y divide-border border-y border-border">
        {materials.map(material => {
          const review = selectedReviews.get(material.number)
          return <li key={material.number} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Link className={focus} href={`${href}?participant=${selected.id}&review=${material.number}#homework`}>{material.number}. {material.title}</Link>
            <span className="rounded bg-muted px-2 py-1 text-sm">{tutoringStatuses[review?.status ?? 'assigned']}</span>
          </li>
        })}
      </ul>}
    </section>}
  </>
}
