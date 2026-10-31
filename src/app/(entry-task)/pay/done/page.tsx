import type { Metadata } from 'next'

import { PaymentStatusRefresh } from '@/components/bootcamp/PaymentStatusRefresh'
import { getPayload } from '@/lib/payload'
import { successReturnState } from '@/server/bootcamp-payment'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'Оплата буткемпа - MentorCareer' },
  robots: { index: false, follow: false },
}

const SUPPORT = 'support@mentorcareer.ru'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** SuccessURL магазина: итог оплаты берём из базы, а не из самого факта возврата. */
export default async function PaymentDonePage({ searchParams }: Props) {
  const raw = await searchParams
  const params = Object.fromEntries(Object.entries(raw).flatMap(([key, value]) => typeof value === 'string' ? [[key, value]] : []))
  const state = await successReturnState(await getPayload(), params)
  const support = <a className="underline underline-offset-4" href={`mailto:${SUPPORT}`}>{SUPPORT}</a>
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{state.kind === 'paid' ? 'Оплата получена' : 'Проверяем оплату'}</h1>
      <div className="rounded-xl border border-border bg-card px-5 py-4 text-base leading-relaxed" aria-live="polite">
        {state.kind === 'paid' && (
          <p>Спасибо! Оплата {state.amount} получена, номер заказа {state.invId}. В течение нескольких минут на почту придут письма с доступом к учебному кабинету и GitLab курса. Начните с методички недели 0.</p>
        )}
        {state.kind === 'pending' && (
          <>
            <p>Ждём подтверждения от Робокассы, обычно это меньше минуты. Страница обновится сама.</p>
            <p className="mt-2 text-muted-foreground">Если подтверждение не придёт за 15 минут, а деньги списаны, напишите нам на {support} и укажите номер заказа {state.invId}.</p>
            <PaymentStatusRefresh />
          </>
        )}
        {state.kind === 'invalid' && (
          <p>Не удалось проверить ответ платёжного сервиса. Если деньги списаны, письмо об оплате придёт в течение нескольких минут. Если его нет, напишите нам на {support}.</p>
        )}
      </div>
    </article>
  )
}
