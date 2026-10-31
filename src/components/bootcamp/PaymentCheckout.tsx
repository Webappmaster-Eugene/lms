'use client'

import { useState } from 'react'

type Props = { token: string, amount: string, offerUrl: string }

/** Согласие с офертой и переход на страницу Робокассы. Ссылку на оплату строит сервер. */
export function PaymentCheckout({ token, amount, offerUrl }: Props) {
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pay = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/bootcamp/pay/${encodeURIComponent(token)}/start`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptOffer: accepted }),
      })
      const data = await response.json().catch(() => null) as { url?: string, error?: string } | null
      if (!response.ok || !data?.url) throw new Error(data?.error ?? `Сервер ответил ${response.status}. Обновите страницу и попробуйте ещё раз.`)
      window.location.assign(data.url)
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : String(payError))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 text-base leading-relaxed">
        <input type="checkbox" className="mt-1.5 size-5 shrink-0" checked={accepted} disabled={busy} onChange={(event) => setAccepted(event.target.checked)} />
        <span>Принимаю условия <a className="underline underline-offset-4" href={offerUrl} target="_blank" rel="noopener noreferrer">договора-оферты</a></span>
      </label>
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-ring"
        disabled={!accepted || busy}
        onClick={() => void pay()}
      >
        {busy ? 'Переходим к оплате…' : `Перейти к оплате ${amount}`}
      </button>
      {error && <p className="text-destructive" role="alert">{error}</p>}
    </div>
  )
}
