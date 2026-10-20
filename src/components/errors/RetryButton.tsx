'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { errorPrimaryAction } from '@/components/errors/ErrorScreen'

/**
 * Один reset() перерисовывает только клиентскую часть сегмента: упавший
 * серверный компонент так и останется упавшим. Поэтому сначала refresh —
 * свежий запрос на сервер, затем reset в одном переходе.
 */
export function RetryButton({ reset, className = errorPrimaryAction }: { reset: () => void; className?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => {
        router.refresh()
        reset()
      })}
      className={`${className} disabled:opacity-60`}
    >
      <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
      {pending ? 'Загружаем…' : 'Попробовать снова'}
    </button>
  )
}
