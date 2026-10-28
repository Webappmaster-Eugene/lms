'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LifeBuoy } from 'lucide-react'
import { ErrorScreen, errorSecondaryAction } from '@/components/errors/ErrorScreen'
import { RetryButton } from '@/components/errors/RetryButton'
import { supportHref, useErrorReport } from '@/components/errors/use-error-report'

export default function FrontendError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = useErrorReport(error)
  const pathname = usePathname()

  return (
    <ErrorScreen
      status="500"
      tone="danger"
      eyebrow="Сбой на нашей стороне"
      title="Страница не загрузилась"
      description="Отчёт об ошибке уже у разработчиков. Попробуйте открыть страницу ещё раз - чаще всего это помогает. Ваш прогресс сохранён."
      terminal={[
        { kind: 'command', text: `open ${pathname ?? '/'}` },
        { kind: 'error', text: 'Error: страница упала при загрузке' },
        { kind: 'comment', text: 'отчёт отправлен, уже разбираемся' },
        { kind: 'hint', text: 'retry' },
      ]}
      reference={reference}
      actions={
        <>
          <RetryButton reset={reset} />
          <Link href="/" className={errorSecondaryAction}>На дашборд</Link>
          <Link href={supportHref(reference, pathname)} className={errorSecondaryAction}>
            <LifeBuoy className="h-4 w-4" aria-hidden="true" />
            Написать в поддержку
          </Link>
        </>
      }
    />
  )
}
