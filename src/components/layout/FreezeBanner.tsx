import Link from 'next/link'
import { formatFreezeDate } from '@/lib/account-freeze'

/** За 14 дней до плановой заморозки: ученик успевает написать наставнику и продлить доступ. */
export function FreezeBanner({ startsAt }: { startsAt: string }) {
  return (
    <aside aria-label="Срок доступа" className="mx-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground lg:mx-8">
      Доступ к платформе открыт до {formatFreezeDate(startsAt)}. Чтобы продолжить обучение,{' '}
      <Link href="/help" className="font-semibold underline underline-offset-2">напишите наставнику</Link>.
    </aside>
  )
}
