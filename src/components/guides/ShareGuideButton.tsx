'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'

export function ShareGuideButton({ title }: { title: string }) {
  const [message, setMessage] = useState('')
  async function share() {
    const url = `${window.location.origin}${window.location.pathname}`
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
      } else {
        await navigator.clipboard.writeText(url)
        setMessage('Ссылка скопирована')
      }
    } catch (error) {
      if ((error instanceof Error || error instanceof DOMException) && error.name === 'AbortError') return
      setMessage('Скопируйте ссылку из адресной строки')
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={share} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        <Share2 className="h-4 w-4" aria-hidden="true" />Поделиться
      </button>
      <span role="status" className="text-xs text-muted-foreground">{message}</span>
    </span>
  )
}
