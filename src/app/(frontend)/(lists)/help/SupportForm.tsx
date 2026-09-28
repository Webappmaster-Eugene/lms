'use client'

import { useState } from 'react'
import { Send, CheckCircle2 } from 'lucide-react'

export function SupportForm() {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!subject.trim() || !message.trim()) {
      setError('Заполните все поля')
      return
    }

    setIsSubmitting(true)

    try {
      const res = await fetch('/api/support-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Произошла ошибка')
        return
      }

      setSubmitted(true)
      setSubject('')
      setMessage('')
    } catch {
      setError('Ошибка сети. Попробуйте позже.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-3" />
        <p className="font-medium text-foreground">Сообщение отправлено</p>
        <p className="mt-1 text-sm text-muted-foreground">Мы рассмотрим ваше обращение как можно скорее.</p>
        <button
          onClick={() => setSubmitted(false)}
          className="mt-4 text-sm text-primary hover:text-primary/80 transition-colors"
        >
          Отправить ещё
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <label htmlFor="support-subject" className="block text-sm font-medium text-foreground mb-1.5">
          Тема
        </label>
        <input
          id="support-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          placeholder="Опишите кратко суть обращения"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
        />
      </div>

      <div>
        <label htmlFor="support-message" className="block text-sm font-medium text-foreground mb-1.5">
          Сообщение
        </label>
        <textarea
          id="support-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={5000}
          rows={4}
          placeholder="Подробно опишите ваш вопрос или проблему"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !subject.trim() || !message.trim()}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {isSubmitting ? 'Отправка...' : 'Отправить'}
      </button>
    </form>
  )
}
