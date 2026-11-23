import { managementPrimary } from '@/components/content-management/ManagementHeading'
import { TUTORING_MEETING_MINUTES } from '@/lib/tutoring'
import type { TutoringCharge } from '@/payload-types'
import { recordTutoringCharge } from '@/server/tutoring-actions'

const amount = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' })
const field = 'rounded-md border border-input bg-background px-3 py-2 text-sm'

export function MeetingPaymentStatus({ charge }: { charge: TutoringCharge }) {
  if (charge.status === 'cancelled') return <p className="text-sm">Занятие отменено, оплаты нет</p>
  return <p className="text-sm">
    <strong>{charge.status === 'paid' ? 'Оплачено' : 'К оплате'} {amount.format(charge.amountKopecks / 100)}</strong>
    <span className="block text-muted-foreground">{charge.minutes} мин · {amount.format(charge.hourlyKopecks / 100)} за час</span>
  </p>
}

export function MentorMeetingPayment({ stream, participant, meeting, charge }: {
  stream: number; participant: number; meeting: number; charge: TutoringCharge | null
}) {
  return <section id="payment" className="space-y-3 rounded-xl border border-border bg-card p-4">
    <h3 className="font-semibold">Оплата встречи {meeting}</h3>
    {charge && <MeetingPaymentStatus charge={charge} />}
    <form action={recordTutoringCharge.bind(null, stream, participant, meeting)} className="flex flex-wrap items-end gap-3">
      <input name="revision" type="hidden" value={charge?.updatedAt ?? ''} />
      {charge?.status === 'paid' ? (
        <button name="intent" value="reopen" className={managementPrimary}>Снять отметку об оплате</button>
      ) : <>
        <label className="grid gap-1 text-sm">Фактическое время, мин
          <input className={field} name="minutes" type="number" min="1" max="1440" required defaultValue={charge?.minutes || TUTORING_MEETING_MINUTES} />
        </label>
        <label className="grid gap-1 text-sm">Ставка, ₽ за час
          <input className={field} name="rate" inputMode="decimal" required defaultValue={charge?.hourlyKopecks ? String(charge.hourlyKopecks / 100) : ''} />
        </label>
        <button name="intent" value="charge" className={managementPrimary}>Рассчитать оплату</button>
        {charge?.status === 'due' && <button name="intent" value="paid" formNoValidate className={managementPrimary}>Отметить оплату</button>}
        {charge?.status !== 'cancelled' && <button name="intent" value="cancel" formNoValidate className="min-h-11 px-3 text-sm text-muted-foreground hover:underline">Отменено</button>}
      </>}
    </form>
  </section>
}
