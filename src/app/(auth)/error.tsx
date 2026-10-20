'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ErrorScreen, errorSecondaryAction } from '@/components/errors/ErrorScreen'
import { RetryButton } from '@/components/errors/RetryButton'
import { useErrorReport } from '@/components/errors/use-error-report'

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = useErrorReport(error)
  const pathname = usePathname()
  // Отписка открывается из письма без входа: ссылка на вход там только сбила бы с толку.
  const showLogin = !pathname?.startsWith('/unsubscribe') && pathname !== '/login'

  return (
    <ErrorScreen
      compact
      status="500"
      tone="danger"
      eyebrow="Сбой на нашей стороне"
      title="Страница не загрузилась"
      description="Мы уже получили отчёт. Попробуйте ещё раз через минуту — данные вашего аккаунта в безопасности."
      terminal={[
        { kind: 'command', text: `open ${pathname ?? '/'}` },
        { kind: 'error', text: 'Error: сервис временно недоступен' },
        { kind: 'hint', text: 'retry' },
      ]}
      reference={reference}
      actions={
        <>
          <RetryButton reset={reset} />
          {showLogin && <Link href="/login" className={errorSecondaryAction}>На страницу входа</Link>}
        </>
      }
    />
  )
}
