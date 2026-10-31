import type { Metadata } from 'next'

import { CandidateFrame } from '@/components/bootcamp/CandidateFrame'
import { getPayload } from '@/lib/payload'
import { noteFailReturn } from '@/server/bootcamp-payment'
import { candidateLanding } from '@/server/bootcamp-programs'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'Оплата не прошла - MentorCareer' },
  robots: { index: false, follow: false },
}

const SUPPORT = 'support@mentorcareer.ru'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** FailURL магазина: подписи у него нет, поэтому данные заявки здесь не показываем. */
export default async function PaymentFailPage({ searchParams }: Props) {
  const { InvId } = await searchParams
  const payload = await getPayload()
  await noteFailReturn(payload, typeof InvId === 'string' ? InvId : undefined)
  const landing = await candidateLanding(payload)
  return (
    <CandidateFrame {...landing}>
    <article className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Оплата не прошла</h1>
      <div className="rounded-xl border border-border bg-card px-5 py-4 text-base leading-relaxed">
        <p>Платёж не завершён, деньги за него не списаны. Попробуйте ещё раз по ссылке из письма о допуске: можно выбрать другую карту или СБП.</p>
        <p className="mt-2 text-muted-foreground">Если не получается, напишите нам на <a className="underline underline-offset-4" href={`mailto:${SUPPORT}`}>{SUPPORT}</a>.</p>
      </div>
    </article>
    </CandidateFrame>
  )
}
