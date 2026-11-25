'use client'

import { useActionState } from 'react'

import { managementPrimary } from '@/components/content-management/ManagementHeading'
import { TUTORING_INTRODUCTION_MINUTES, type TutoringProgram } from '@/lib/tutoring'
import { createTutoringStream } from '@/server/tutoring-actions'

const field = 'min-h-11 w-full min-w-0 rounded-md border border-input bg-background p-2'
const label = 'grid min-w-0 grid-cols-1 gap-1 text-sm'

export function TutoringStreamForm({ program, creationKey, calendars, initialError }: {
  program: TutoringProgram; creationKey: string; calendars: { id: number; label: string }[]; initialError?: string
}) {
  const [state, submit, pending] = useActionState(createTutoringStream.bind(null, program), null)

  return <form key={state?.failureId} action={submit} aria-labelledby="create-stream-heading" className="@container grid h-fit min-w-0 grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5">
    <h2 id="create-stream-heading" className="text-lg font-semibold">Создать поток</h2>
    <input type="hidden" name="creationKey" value={creationKey} />
    {(state?.message || initialError) && <p role="alert" className="wrap-anywhere text-sm text-destructive">{state?.message || initialError}</p>}
    <label className={label}>Название<input className={field} name="title" defaultValue={state?.fields.title ?? ''} required maxLength={120} /></label>
    <div className="grid grid-cols-1 gap-2 @min-[18rem]:grid-cols-[minmax(0,1fr)_7.5rem]">
      <label className={label}>Первый вторник<input className={field} name="date" defaultValue={state?.fields.date ?? ''} type="date" /></label>
      <label className={label}>Время МСК<input className={field} name="time" type="time" defaultValue={state?.fields.time ?? '20:00'} required /></label>
    </div>
    {calendars.length > 0 && <label className={label}>Взять календарь буткемпа
      <select name="calendar" defaultValue={state?.fields.calendar ?? ''} className={field}>
        <option value="">Своя дата начала</option>
        {calendars.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>}
    <label className={label}>Вводная встреча, МСК
      <input className={field} name="introductionStartsAt" defaultValue={state?.fields.introductionStartsAt ?? ''} type="datetime-local" aria-describedby="introduction-time-hint" />
      <span id="introduction-time-hint" className="text-xs text-muted-foreground">{TUTORING_INTRODUCTION_MINUTES} минут, бесплатно. Можно назначить позже.</span>
    </label>
    <label className={label}>Ссылка на созвон<input className={field} name="meetingUrl" defaultValue={state?.fields.meetingUrl ?? ''} type="url" maxLength={1000} /></label>
    <label className={label}>Ставка за час, ₽
      <input className={field} name="rate" defaultValue={state?.fields.rate ?? ''} inputMode="decimal" required maxLength={10} />
    </label>
    <label className={label}>Кого пригласить
      <textarea className={field} name="inviteEmails" defaultValue={state?.fields.inviteEmails ?? ''} rows={3} required aria-describedby="invite-emails-hint" />
      <span id="invite-emails-hint" className="text-sm text-muted-foreground">По одному адресу на строку. Можно написать имя и фамилию в формате Анна Иванова &lt;anna@example.ru&gt;. Черновик сохраняет адреса до открытия потока.</span>
    </label>
    <button disabled={pending} name="intent" value="open" className={managementPrimary}>Открыть поток и пригласить</button>
    <button disabled={pending} name="intent" value="draft" formNoValidate className="min-h-11 rounded-md border border-input px-4 text-sm font-semibold hover:bg-accent">Сохранить черновик</button>
  </form>
}
