'use client'

export default function ContentError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-xl border border-border p-6">
      <h2 className="font-semibold">Не удалось загрузить учебный контент</h2>
      <p className="text-sm text-muted-foreground">Проверьте соединение и попробуйте ещё раз.</p>
      <button type="button" onClick={reset} className="min-h-[44px] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Попробовать ещё раз</button>
    </div>
  )
}
