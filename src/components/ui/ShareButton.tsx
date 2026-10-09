'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { shareableURL } from '@/lib/shared-url'

export function ShareButton({ title, label = 'Поделиться ссылкой', getHref }: { title?: string; label?: string; getHref?: () => string }) {
  const [message, setMessage] = useState('')
  const [manualURL, setManualURL] = useState('')
  const share = async () => {
    setMessage('')
    setManualURL('')
    let url: string
    try { url = shareableURL(getHref?.() ?? window.location.href, window.location.origin) }
    catch { setMessage('Ссылку на эту страницу отправить нельзя'); return }
    if (navigator.share) {
      try { await navigator.share({ title, url }); return }
      catch (error) { if (error instanceof Error && error.name === 'AbortError') return }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setMessage('Ссылка скопирована')
    } catch {
      setManualURL(url)
      setMessage('Выделите и скопируйте ссылку')
    }
  }
  return (
    <div className="space-y-1">
      <button type="button" onClick={() => void share()} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <Share2 className="h-4 w-4" aria-hidden="true" />{label}
      </button>
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
      {manualURL && <input readOnly value={manualURL} aria-label="Ссылка для копирования" onFocus={(event) => event.currentTarget.select()} className="w-full rounded-md border border-border bg-card p-2 text-xs" />}
    </div>
  )
}
