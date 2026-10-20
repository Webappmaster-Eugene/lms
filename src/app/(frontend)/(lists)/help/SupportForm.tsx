'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, CheckCircle2 } from 'lucide-react'

export function SupportForm({ initialSubject = '', initialMessage = '' }: { initialSubject?: string; initialMessage?: string } = {}) {
  const [subject, setSubject] = useState(initialSubject)
  const [message, setMessage] = useState(initialMessage)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const successHeading = useRef<HTMLParagraphElement>(null)

  // Кнопка отправки исчезает вместе с формой: фокус переводим на подтверждение, иначе он падает на body.
  useEffect(() => {
    if (submitted) successHeading.current?.focus()
  }, [submitted])

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
        // Ответ прокси или упавшего сервера может прийти не JSON — показываем понятный текст, а не SyntaxError.
        const data: unknown = await res.json().catch(() => null)
        const serverMessage = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : null
        setError(serverMessage ?? (res.status >= 500 ? 'Сервер временно недоступен. Попробуйте через минуту.' : 'Не удалось отправить сообщение'))
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
      <div role="status" className="rounded-xl border border-success/30 bg-success/5 p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-3" aria-hidden="true" />
        <p ref={successHeading} tabIndex={-1} className="font-medium text-foreground outline-none">Сообщение отправлено</p>
        <p className="mt-1 text-sm text-muted-foreground">Мы рассмотрим ваше обращение как можно скорее.</p>
        <button
          onClick={() => setSubmitted(false)}
          className="mt-4 inline-flex min-h-11 items-center text-sm text-primary hover:text-primary/80 transition-colors"
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
        <p role="alert" className="text-sm text-destructive">{error}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !subject.trim() || !message.trim()}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        {isSubmitting ? 'Отправка…' : 'Отправить'}
      </button>
    </form>
  )
}
