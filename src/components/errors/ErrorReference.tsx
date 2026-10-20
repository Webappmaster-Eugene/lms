'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Код ошибки, по которому поддержка найдёт событие в Sentry. */
export function ErrorReference({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
      window.setTimeout(() => setState('idle'), 2000)
    } catch {
      // Без HTTPS или разрешения буфер недоступен: код остаётся на экране, просим выделить его.
      setState('failed')
    }
  }

  return (
    <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
      <span>Код ошибки:</span>
      <code className="rounded-md bg-muted px-2 py-1 font-mono text-foreground">{value}</code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {state === 'copied' ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        <span aria-live="polite">{state === 'copied' ? 'Скопировано' : state === 'failed' ? 'Не удалось скопировать — выделите код вручную' : 'Скопировать'}</span>
      </button>
    </p>
  )
}
