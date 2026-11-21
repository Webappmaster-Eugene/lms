'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { PPTX_MIME, TUTORING_FILE_LIMIT } from '@/lib/tutoring-file-types'

export function ReplacePresentation({ id, updatedAt, manual }: { id: number; updatedAt: string; manual: boolean }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const element = event.currentTarget
    const body = new FormData(element)
    if (['pdf', 'pptx'].some(key => {
      const file = body.get(key)
      return !(file instanceof File) || !file.size || file.size > TUTORING_FILE_LIMIT
    })) {
      setMessage({ error: true, text: 'Приложите оба файла. Размер каждого до 10 МБ.' })
      return
    }
    body.set('id', String(id))
    body.set('updatedAt', updatedAt)
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch('/api/manage/tutoring/presentation', { method: 'POST', body })
      const result = await response.json() as { error?: string }
      if (!response.ok) {
        setMessage({ error: true, text: result.error ?? 'Не удалось сохранить презентацию.' })
        return
      }
      element.reset()
      setMessage({ error: false, text: 'Новая версия презентации сохранена.' })
      router.refresh()
    } catch {
      setMessage({ error: true, text: 'Не удалось проверить сохранение. Обновите страницу.' })
    } finally {
      setPending(false)
    }
  }

  return <details className="rounded-xl border border-border bg-card p-4">
    <summary className="cursor-pointer font-semibold">Заменить презентацию{manual && ' · своя версия'}</summary>
    <form onSubmit={save} className="mt-4 space-y-3" aria-busy={pending}>
      <p className="text-sm text-muted-foreground">Отредактируйте PPTX и экспортируйте его в PDF. Загрузите оба файла одной версии, до 10 МБ каждый.</p>
      <fieldset disabled={pending} className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-sm">Презентация для учеников (PDF)
          <input name="pdf" type="file" accept=".pdf,application/pdf" required className="max-w-full text-sm" />
        </label>
        <label className="grid gap-1 text-sm">Исходник для редактора (PPTX)
          <input name="pptx" type="file" accept={`.pptx,${PPTX_MIME}`} required className="max-w-full text-sm" />
        </label>
        <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {pending ? 'Сохраняем…' : 'Сохранить версию'}
        </button>
      </fieldset>
      {message && <p role={message.error ? 'alert' : 'status'} className={message.error ? 'text-sm text-destructive' : 'text-sm'}>{message.text}</p>}
    </form>
  </details>
}
