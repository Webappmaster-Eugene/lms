'use client'

import { useState } from 'react'
import { Check, Download, Link2 } from 'lucide-react'

/** Печать браузера умеет «Сохранить как PDF» — отдельный генератор PDF не нужен. */
export function CertificateActions() {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setCopyFailed(false)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('[certificate] ссылка не скопирована', error)
      setCopyFailed(true)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-lg bg-primary min-h-11 px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Скачать PDF
      </button>
      <button
        type="button"
        onClick={copyLink}
        className="inline-flex items-center gap-2 rounded-lg border border-border min-h-11 px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
      >
        {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
        {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
      </button>
      {copyFailed && (
        <p role="alert" className="w-full text-sm text-destructive">
          Не удалось скопировать — скопируйте адрес из строки браузера.
        </p>
      )}
      <p className="w-full text-xs text-muted-foreground">
        В окне печати выберите «Сохранить как PDF». Страница доступна только вам после входа; для отправки другим сохраните PDF.
      </p>
    </div>
  )
}
