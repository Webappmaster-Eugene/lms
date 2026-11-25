import { managementPrimary } from '@/components/content-management/ManagementHeading'
import { TUTORING_MEETING_MINUTES } from '@/lib/tutoring'
import type { TutoringCharge } from '@/payload-types'
import { recordTutoringCharge } from '@/server/tutoring-actions'

const amount = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' })
const field = 'min-w-0 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

export function MeetingPaymentStatus({ charge }: { charge: Pick<TutoringCharge, 'status' | 'amountKopecks' | 'minutes' | 'hourlyKopecks' | 'attendedAt'> }) {
  if (charge.status === 'cancelled') return <p className="text-sm">{charge.attendedAt ? 'Начисление отменено, оплаты нет' : 'Занятие отменено, оплаты нет'}</p>
  return <p className="text-sm">
    <strong>{charge.status === 'paid' ? 'Оплачено' : 'К оплате'} {amount.format(charge.amountKopecks / 100)}</strong>
    <span className="block text-muted-foreground">{charge.minutes} мин · {amount.format(charge.hourlyKopecks / 100)} за час</span>
  </p>
}

export function MentorMeetingPayment({ stream, participant, meeting, charge, hourlyKopecks }: {
  stream: number; participant: number; meeting: number; charge: TutoringCharge | null; hourlyKopecks?: number | null
}) {
  const action = recordTutoringCharge.bind(null, stream, participant, meeting)
  const rate = charge?.hourlyKopecks || hourlyKopecks
  return <section id="payment" className="space-y-3 rounded-xl border border-border bg-card p-4">
    <h3 className="font-semibold">Оплата встречи {meeting}</h3>
    {charge && <MeetingPaymentStatus charge={charge} />}
    {(charge?.status === 'due' || charge?.status === 'paid') && <form action={action}>
      <input name="revision" type="hidden" value={charge?.updatedAt ?? ''} />
      {charge.status === 'due' ? <button name="intent" value="paid" className={managementPrimary}>Отметить оплату</button>
        : <button name="intent" value="reopen" className="min-h-11 text-sm text-muted-foreground hover:underline">Снять отметку об оплате</button>}
    </form>}
    {charge?.status !== 'paid' && <details>
      <summary className="cursor-pointer text-sm">{charge ? 'Изменить начисление' : 'Указать стоимость вручную'}</summary>
      <form action={action} className="mt-2 flex min-w-0 flex-wrap items-end gap-3">
        <input name="revision" type="hidden" value={charge?.updatedAt ?? ''} />
        <label className="grid gap-1 text-sm">Фактическое время, мин
          <input className={field} name="minutes" type="number" min="1" max="1440" required defaultValue={charge?.minutes || TUTORING_MEETING_MINUTES} />
        </label>
        <label className="grid gap-1 text-sm">Ставка, ₽ за час
          <input className={field} name="rate" inputMode="decimal" required defaultValue={rate ? String(rate / 100) : ''} />
        </label>
        <button name="intent" value="charge" className={managementPrimary}>Рассчитать оплату</button>
        {charge?.status !== 'cancelled' && <button name="intent" value="cancel" formNoValidate className="min-h-11 px-3 text-sm text-muted-foreground hover:underline">Отменить начисление</button>}
      </form>
    </details>}
  </section>
}
