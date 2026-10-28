'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, ThumbsDown, ThumbsUp } from 'lucide-react'

import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

export type GuideReadState = { id: number; helpful: 'yes' | 'no' | null; comment: string | null }

type Props = {
  guideId: number
  initial: GuideReadState | null
  /** Совпадает с GUIDE_FEEDBACK_MAX коллекции guide-reads. */
  maxComment: number
}

async function save(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<GuideReadState> {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`)
  const { doc } = (await res.json()) as { doc: { id: number; helpful?: 'yes' | 'no' | null; comment?: string | null } }
  return { id: doc.id, helpful: doc.helpful ?? null, comment: doc.comment ?? null }
}

/**
 * Низ гайда: отметка о прочтении (для «Новое» в списке и статистики в CMS) и вопрос «Гайд помог?».
 * Прочтение пишется один раз при первом открытии; отзыв можно изменить.
 */
export function GuideFeedback({ guideId, initial, maxComment }: Props) {
  const [record, setRecord] = useState(initial)
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(Boolean(initial?.comment))
  // Отзыв, отправленный раньше, чем записалось прочтение, ждёт эту запись, а не создаёт вторую.
  const pending = useRef<Promise<GuideReadState | null> | null>(initial ? Promise.resolve(initial) : null)
  const { toast } = useToast()

  useEffect(() => {
    if (pending.current) return
    pending.current = save('/api/guide-reads?depth=0', 'POST', { guide: guideId })
      .then((created) => { setRecord(created); return created })
      .catch((error) => { console.error('Не удалось отметить гайд прочитанным', error); return null })
  }, [guideId])

  async function write(data: { helpful?: 'yes' | 'no'; comment?: string }) {
    setBusy(true)
    try {
      const existing = record ?? (await pending.current)
      // depth=0: раскрытый гайд целиком в ответе не нужен.
      const next = existing ? await save(`/api/guide-reads/${existing.id}?depth=0`, 'PATCH', data) : await save('/api/guide-reads?depth=0', 'POST', { guide: guideId, ...data })
      setRecord(next)
      return true
    } catch (error) {
      console.error('Не удалось сохранить отзыв о гайде', error)
      toast('Не удалось сохранить отзыв - попробуйте ещё раз', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function vote(helpful: 'yes' | 'no') {
    if (await write({ helpful })) setSent(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (await write({ comment: comment.trim() })) {
      setSent(true)
      toast('Спасибо! Ментор прочитает отзыв', 'success')
    }
  }

  const helpful = record?.helpful ?? null
  const button = 'inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring'
  return (
    <section aria-labelledby="guide-feedback-title" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 id="guide-feedback-title" className="text-base font-semibold text-foreground">Гайд помог?</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} aria-pressed={helpful === 'yes'} onClick={() => vote('yes')} className={cn(button, helpful === 'yes' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-accent')}>
          <ThumbsUp className="h-4 w-4" aria-hidden="true" />
          Да
        </button>
        <button type="button" disabled={busy} aria-pressed={helpful === 'no'} onClick={() => vote('no')} className={cn(button, helpful === 'no' ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-accent')}>
          <ThumbsDown className="h-4 w-4" aria-hidden="true" />
          Нет
        </button>
        {busy && <Loader2 className="h-5 w-5 animate-spin self-center text-muted-foreground" aria-label="Сохраняем" />}
      </div>
      {helpful && (
        <form onSubmit={submit} className="mt-4 space-y-2">
          <label htmlFor="guide-feedback-comment" className="block text-sm text-muted-foreground">
            {helpful === 'yes' ? 'Спасибо! Чего не хватило бы, чтобы гайд стал ещё лучше?' : 'Что было непонятно или устарело? Ментор поправит гайд.'}
          </label>
          <textarea
            id="guide-feedback-comment"
            value={comment}
            maxLength={maxComment}
            rows={3}
            onChange={(event) => { setComment(event.target.value); setSent(false) }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
            placeholder="Необязательно"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy || !comment.trim() || sent} className={cn(button, 'border-border text-foreground hover:bg-accent')}>
              Отправить
            </button>
            {sent && <span role="status" className="text-sm text-muted-foreground">Отзыв отправлен</span>}
          </div>
        </form>
      )}
    </section>
  )
}
