import type { Metadata } from 'next'
import Link from 'next/link'
import { MailCheck, MailX, TriangleAlert } from 'lucide-react'

import { getPayload } from '@/lib/payload'
import { emailBroadcastConsent } from '@/server/broadcasts/consent'
import { verifyUnsubscribeToken } from '@/server/broadcasts/unsubscribe-token'

export const metadata: Metadata = {
  title: 'Отписка от рассылок',
}

type SearchParams = Promise<{ token?: string | string[]; done?: string | string[]; error?: string | string[] }>

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ''

const primaryButton = 'flex w-full min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const secondaryButton = 'flex w-full min-h-11 items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function ConsentForm({ token, action, label, primary }: { token: string; action: 'unsubscribe' | 'resubscribe'; label: string; primary: boolean }) {
  return (
    <form method="post" action="/api/email/unsubscribe">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" className={primary ? primaryButton : secondaryButton}>{label}</button>
    </form>
  )
}

export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const token = single(params.token)
  const done = single(params.done)
  const failed = single(params.error) === 'failed'
  const userId = verifyUnsubscribeToken(token)
  const subscribed = userId === null ? null : await emailBroadcastConsent(await getPayload(), userId)

  const invalid = subscribed === null
  const Icon = invalid ? TriangleAlert : subscribed ? MailX : MailCheck
  const title = invalid ? 'Ссылка недействительна'
    : done === 'unsubscribed' && !subscribed ? 'Вы отписались от рассылок'
      : done === 'resubscribed' && subscribed ? 'Подписка возвращена'
        : subscribed ? 'Отписаться от рассылок?' : 'Вы не получаете рассылки'
  const description = invalid
    ? 'Откройте ссылку из последнего письма целиком или войдите на платформу и измените подписку в настройках уведомлений.'
    : subscribed
      ? 'Новости и объявления MentorCareer перестанут приходить на почту. Письма об аккаунте — приглашение и восстановление пароля — и уведомления на платформе останутся.'
      : 'Новости и объявления MentorCareer больше не придут на почту. Если передумаете, подписку можно вернуть одной кнопкой.'

  return (
    <div className="w-full max-w-md space-y-8 px-4">
      <div className="text-center">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${invalid ? 'bg-warning/15' : 'bg-primary'}`}>
          <Icon className={`h-8 w-8 ${invalid ? 'text-warning' : 'text-primary-foreground'}`} aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>

      {failed && !invalid && (
        <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Не удалось сохранить выбор. Попробуйте ещё раз через минуту.
        </p>
      )}

      <div className="space-y-3">
        {!invalid && (subscribed
          ? <ConsentForm token={token} action="unsubscribe" label="Отписаться от рассылок" primary />
          : <ConsentForm token={token} action="resubscribe" label="Вернуть подписку" primary={false} />)}
        <Link href={invalid ? '/settings/notifications' : '/'} className={secondaryButton}>
          {invalid ? 'Настройки уведомлений' : 'Открыть платформу'}
        </Link>
      </div>
    </div>
  )
}
