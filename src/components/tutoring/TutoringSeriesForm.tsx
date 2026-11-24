'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

import { managementPrimary } from '@/components/content-management/ManagementHeading'
import { moscowMeetingInput, tutoringDateLabel } from '@/lib/tutoring'
import { planTutoringScheduleChange, tutoringScheduleDefaults, type TutoringScheduleSlot } from '@/lib/tutoring-schedule'

const field = 'w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm'

function SaveSchedule({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return <button type="submit" className={`${managementPrimary} disabled:opacity-50`} disabled={disabled || pending}>
    {pending ? 'Сохраняем расписание…' : 'Сохранить расписание'}
  </button>
}

function PreviewRows({ rows }: { rows: TutoringScheduleSlot[] }) {
  return <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
    {rows.map(row => <li key={row.meeting} className="flex min-w-0 flex-wrap gap-x-2">
      <span>Встреча №{row.meeting}</span>
      <time className="text-muted-foreground" dateTime={row.startsAt}>{tutoringDateLabel(new Date(row.startsAt))}</time>
      {row.startsAt !== row.scheduledAt && <span className="text-muted-foreground">· перенос сохранён</span>}
    </li>)}
  </ol>
}

export function TutoringSeriesForm({ slots, now, introductionStartsAt, awaitingFirstLecture, action }: {
  slots: TutoringScheduleSlot[]
  now: number
  introductionStartsAt?: string | null
  awaitingFirstLecture?: boolean | null
  action: (form: FormData) => Promise<void>
}) {
  const upcoming = slots.filter(slot => Date.parse(slot.startsAt) > now)
  const [draft, setDraft] = useState(() => {
    const first = upcoming[0]
    return { fromMeeting: first?.meeting ?? 0, ...(first ? tutoringScheduleDefaults(slots, first, now) : { firstStart: '', secondStart: '' }), keepOverrides: false }
  })
  if (!upcoming.length) return <p className="my-4 text-sm text-muted-foreground">В потоке нет предстоящих встреч.</p>

  const hasSecond = upcoming.some(slot => slot.meeting > draft.fromMeeting)
  const hasOverrides = upcoming.some(slot => slot.meeting >= draft.fromMeeting && slot.startsAt !== slot.scheduledAt)
  const plan = planTutoringScheduleChange(slots, draft, now, introductionStartsAt, awaitingFirstLecture)
  const disabled = 'error' in plan || plan.changed === 0

  function selectMeeting(value: string) {
    const first = upcoming.find(slot => slot.meeting === Number(value))
    if (first) setDraft({ ...draft, fromMeeting: first.meeting, ...tutoringScheduleDefaults(slots, first, now) })
  }

  function changeFirstStart(firstStart: string) {
    const before = Date.parse(`${draft.firstStart.slice(0, 10)}T00:00:00Z`)
    const after = Date.parse(`${firstStart.slice(0, 10)}T00:00:00Z`)
    const second = Date.parse(`${draft.secondStart}:00+03:00`) + after - before
    setDraft({ ...draft, firstStart, secondStart: Number.isFinite(second) ? moscowMeetingInput(new Date(second)) : draft.secondStart })
  }

  return <details className="mt-5 rounded-lg border border-border bg-muted/25 p-4">
    <summary className="w-fit cursor-pointer rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Изменить будущие встречи</summary>
    <form action={action} className="mt-4 space-y-4">
      <label className="grid gap-1 text-sm sm:max-w-md">Начиная со встречи
        <select className={field} name="fromMeeting" value={draft.fromMeeting} onChange={event => selectMeeting(event.target.value)}>
          {upcoming.map(slot => <option key={slot.meeting} value={slot.meeting}>№{slot.meeting} · {tutoringDateLabel(new Date(slot.startsAt))}</option>)}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1 text-sm">Начало первой встречи, МСК
          <input className={field} type="datetime-local" name="firstStart" required value={draft.firstStart} onChange={event => changeFirstStart(event.target.value)} />
        </label>
        {hasSecond && <label className="grid min-w-0 gap-1 text-sm">Начало второй встречи, МСК
          <input className={field} type="datetime-local" name="secondStart" required value={draft.secondStart} onChange={event => setDraft({ ...draft, secondStart: event.target.value })} />
        </label>}
      </div>
      {hasSecond && <p className="text-sm text-muted-foreground">Эти два дня и время будут повторяться каждую неделю.</p>}
      {hasOverrides && <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="keepOverrides" value="yes" checked={draft.keepOverrides} className="mt-1" onChange={event => setDraft({ ...draft, keepOverrides: event.target.checked })} />
        Сохранить ранее перенесённые встречи
      </label>}
      {'error' in plan ? <p role="status" className="text-sm text-destructive">{plan.error}</p> : plan.changed > 0 ?
        <section aria-label="Предпросмотр расписания" className="space-y-2 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">Новые даты, МСК</h3>
          <PreviewRows rows={plan.rows.slice(0, 4)} />
          {plan.rows.length > 4 && <details>
            <summary className="w-fit cursor-pointer rounded text-sm text-primary focus-visible:outline-2 focus-visible:outline-ring">Остальные встречи ({plan.rows.length - 4})</summary>
            <div className="mt-2"><PreviewRows rows={plan.rows.slice(4)} /></div>
          </details>}
        </section> : <p className="text-sm text-muted-foreground">График совпадает с текущим расписанием.</p>}
      <SaveSchedule disabled={disabled} />
    </form>
  </details>
}
