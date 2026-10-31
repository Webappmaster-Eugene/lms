import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PaymentCheckout } from '@/components/bootcamp/PaymentCheckout'
import { OFFER_URL } from '@/lib/bootcamp-admission'
import { getPayload } from '@/lib/payload'
import { findLeadByPaymentToken, paymentPageState } from '@/server/bootcamp-payment'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'Оплата буткемпа - MentorCareer' },
  robots: { index: false, follow: false },
}

const SUPPORT = 'support@mentorcareer.ru'

type Props = { params: Promise<{ token: string }> }

/** Личная страница оплаты: ссылка приходит в письме о допуске. */
export default async function PaymentPage({ params }: Props) {
  const { token } = await params
  const payload = await getPayload()
  const lead = await findLeadByPaymentToken(payload, token)
  if (!lead) notFound()
  const state = await paymentPageState(payload, lead)
  const card = 'rounded-xl border border-border bg-card px-5 py-4 text-base leading-relaxed'
  const support = <a className="underline underline-offset-4" href={`mailto:${SUPPORT}`}>{SUPPORT}</a>

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Оплата буткемпа {state.program}</h1>
        {state.kind === 'open' && (
          <p className="text-lg leading-relaxed text-muted-foreground">
            {state.name ? `${state.name}, вы` : 'Вы'} допущены на буткемп. Чтобы занять место в потоке, оплатите участие до {state.dueDate} включительно.
          </p>
        )}
      </header>

      {state.kind === 'open' && (
        <>
          <div className={card}>
            <p>Сумма: <strong>{state.amount}</strong> за весь поток.</p>
            <p className="mt-2 text-muted-foreground">Оплата проходит на странице платёжного сервиса Робокасса: картой, через СБП или в рассрочку от банка-партнёра без переплаты. Чек придёт на email из приложения «Мой налог».</p>
            <p className="mt-2 text-muted-foreground">Сразу после оплаты на почту придут два письма: приглашение в учебный кабинет MentorCareer и ссылка для пароля в GitLab курса.</p>
            {state.test && <p className="mt-2 font-medium">Магазин работает в тестовом режиме: деньги не списываются.</p>}
          </div>
          <PaymentCheckout token={token} amount={state.amount} offerUrl={OFFER_URL} />
        </>
      )}
      {state.kind === 'paid' && (
        <div className={card}>
          <p>Оплата получена, спасибо! Письма с доступом к учебному кабинету и GitLab курса уже должны быть на вашей почте. Если их нет, проверьте папку «Спам» и напишите нам на {support}.</p>
        </div>
      )}
      {state.kind === 'expired' && (
        <div className={card}>
          <p>Срок оплаты прошёл {state.dueDate}. Напишите нам на {support}: если в потоке ещё есть места, мы пришлём новую ссылку.</p>
        </div>
      )}
      {state.kind === 'closed' && (
        <div className={card}>
          <p>Эта ссылка на оплату больше не действует. Если вы думаете, что это ошибка, напишите нам на {support}.</p>
        </div>
      )}
      {state.kind === 'unavailable' && (
        <div className={card}>
          <p>Оплата временно недоступна. Напишите нам на {support}, и мы поможем.</p>
        </div>
      )}
      <p className="text-sm text-muted-foreground">Ссылка на эту страницу личная, пожалуйста, не пересылайте её.</p>
    </article>
  )
}
