'use client'

import { AlertCircle, RefreshCw } from 'lucide-react'

export default function FrontendError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-bold text-foreground">Что-то пошло не так</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md">
          Произошла ошибка при загрузке страницы. Попробуйте обновить.
        </p>
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <RefreshCw className="h-4 w-4" />
        Попробовать снова
      </button>
    </div>
  )
}
