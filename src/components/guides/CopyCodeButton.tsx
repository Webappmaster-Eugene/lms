'use client'

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Команды из гайда копируют в терминал — кнопка избавляет от выделения мышью. */
export function CopyCodeButton({ code }: { code: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), 2000)
    return () => clearTimeout(timer)
  }, [state])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setState('copied')
    } catch (error) {
      console.error('Не удалось скопировать код гайда', error)
      setState('failed')
    }
  }

  const label = state === 'copied' ? 'Скопировано' : state === 'failed' ? 'Не удалось скопировать' : 'Копировать'
  return (
    <button
      type="button"
      onClick={copy}
      className="absolute right-2 top-2 inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-border bg-background/90 px-2 text-xs text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      {state === 'copied' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      <span aria-live="polite">{label}</span>
    </button>
  )
}
