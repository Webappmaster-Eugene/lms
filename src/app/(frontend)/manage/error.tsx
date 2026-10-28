'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ErrorScreen, errorSecondaryAction } from '@/components/errors/ErrorScreen'
import { RetryButton } from '@/components/errors/RetryButton'
import { useErrorReport } from '@/components/errors/use-error-report'

export default function ContentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = useErrorReport(error)
  const pathname = usePathname()

  return (
    <ErrorScreen
      status="500"
      tone="danger"
      eyebrow="Управление платформой"
      title="Раздел управления не загрузился"
      description="Несохранённые изменения формы могли потеряться, сохранённые - на месте. Ошибка уже отправлена в Sentry."
      terminal={[
        { kind: 'command', text: `open ${pathname ?? '/manage'}` },
        { kind: 'error', text: 'Error: раздел не загрузился' },
        { kind: 'comment', text: 'подробности - в Sentry по коду ниже' },
      ]}
      reference={reference}
      actions={
        <>
          <RetryButton reset={reset} />
          <Link href="/manage" className={errorSecondaryAction}>К разделу управления</Link>
        </>
      }
    />
  )
}
