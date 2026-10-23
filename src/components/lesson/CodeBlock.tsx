'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'

const COPIED_MS = 2000
/** Метка «text» ничего не сообщает о коде — её не показываем. */
const PLAIN = new Set(['text', 'txt', 'plain', 'plaintext'])

/** Блок кода урока с меткой языка и кнопкой «Копировать». */
export function CodeBlock({ code, language, children }: { code: string; language: string | null; children: ReactNode }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    clearTimeout(timer.current)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Буфер обмена недоступен')
      await navigator.clipboard.writeText(code)
      setState('copied')
      timer.current = setTimeout(() => setState('idle'), COPIED_MS)
    } catch (error) {
      // Без HTTPS или разрешения браузера буфер недоступен: код остаётся на экране.
      console.warn('Не удалось скопировать код урока', error)
      setState('failed')
    }
  }

  const label = language && !PLAIN.has(language) ? language : null
  return (
    <div className="not-prose my-5 overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap items-center gap-x-3 border-b border-border bg-muted/60 py-0.5 pl-4 pr-1 text-xs text-muted-foreground">
        {label && <span className="font-mono">{label}</span>}
        <span role="status" className={state === 'failed' ? 'py-1 text-destructive' : 'sr-only'}>
          {state === 'failed' ? 'Не удалось скопировать — выделите код вручную' : state === 'copied' ? 'Код скопирован' : ''}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Копировать код"
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {state === 'copied' ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {state === 'copied' ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
      {children}
    </div>
  )
}
