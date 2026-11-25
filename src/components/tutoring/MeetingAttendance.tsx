import { managementPrimary } from '@/components/content-management/ManagementHeading'
import { TUTORING_MEETING_MINUTES, tutoringPrograms } from '@/lib/tutoring'
import type { TutoringParticipant, TutoringStream } from '@/payload-types'
import { tutoringStudentName } from '@/server/tutoring'
import { completeTutoringMeeting } from '@/server/tutoring-actions'

export function MeetingAttendance({ stream, meeting, members, attended, started }: {
  stream: TutoringStream
  meeting: number
  members: TutoringParticipant[]
  attended: Set<number>
  started: boolean
}) {
  const active = members.filter(member => member.active)
  const eligible = active.filter(member => !attended.has(member.id) && Math.max(stream.currentMeeting, member.currentMeeting) === meeting)
  const labels = new Map<string, number>()
  for (const member of eligible) {
    const label = tutoringStudentName(member)
    labels.set(label, (labels.get(label) ?? 0) + 1)
  }
  let explanation
  if (!started) explanation = 'Присутствующих можно отметить после начала занятия.'
  else if (!eligible.length && !attended.size) explanation = 'Эта встреча сейчас не открыта ни у одного активного ученика.'
  else if (!stream.hourlyKopecks && eligible.length) explanation = <>Для расчета оплаты <a className="text-primary underline" href="?schedule=1#schedule">укажите стоимость часа в настройках потока</a>.</>

  return <section id="attendance" aria-labelledby="attendance-title" className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
    <h2 id="attendance-title" className="font-semibold">Посещение встречи {meeting}</h2>
    {attended.size > 0 && <p className="wrap-anywhere text-sm">Присутствовали: {members.filter(m => attended.has(m.id)).map(tutoringStudentName).join(', ')}.</p>}
    {explanation && <p className="text-sm text-muted-foreground">{explanation}</p>}
    {started && eligible.length > 0 && !!stream.hourlyKopecks && <form action={completeTutoringMeeting.bind(null, stream.id, meeting, stream.updatedAt)} className="space-y-3">
        <fieldset className="min-w-0 space-y-1">
          <legend className="text-sm font-medium">Кто был на занятии</legend>
          {eligible.map(member => {
            const name = tutoringStudentName(member)
            const email = typeof member.student === 'number' ? '' : member.student.email
            return <label key={member.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" name="participant" value={member.id} defaultChecked={active.length === 1} />
              <span className="min-w-0 break-words">{name}{(labels.get(name) ?? 0) > 1 && email && email !== name ? ` (${email})` : ''}</span>
            </label>
          })}
        </fieldset>
        <label className="grid w-fit max-w-full gap-1 text-sm">Фактическое время, мин
          <input className="min-w-0 rounded-md border border-input bg-background px-3 py-2" name="minutes" type="number" min={1} max={1440} defaultValue={TUTORING_MEETING_MINUTES} required />
        </label>
        <p className="text-sm text-muted-foreground">
          {meeting < tutoringPrograms[stream.program].meetings ? 'У отмеченных учеников откроется следующая встреча. ' : ''}
          Стоимость для каждого рассчитывается по ставке {(stream.hourlyKopecks / 100).toLocaleString('ru-RU')} ₽ за час.
        </p>
        <button className={managementPrimary}>Завершить встречу</button>
      </form>}
  </section>
}
