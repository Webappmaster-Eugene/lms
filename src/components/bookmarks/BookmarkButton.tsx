'use client'

import { useState } from 'react'
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react'

import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'

type Props = {
  /** Числовой id: Payload отвергает строковые id в relationship-полях. */
  target: { lesson: number } | { task: number }
  /** id закладки, если урок или задача уже сохранены. */
  initialId: number | string | null
  className?: string
}

/** «Сохранить на потом» — урок или задача попадают в «Сохранённое». */
export function BookmarkButton({ target, initialId, className }: Props) {
  const [id, setId] = useState(initialId)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()
  const saved = id !== null

  async function toggle() {
    setBusy(true)
    try {
      if (saved) {
        const res = await fetch(`/api/bookmarks/${id}`, { method: 'DELETE', credentials: 'include' })
        if (!res.ok) throw new Error(`DELETE /api/bookmarks → ${res.status}`)
        setId(null)
        toast('Убрано из сохранённого', 'info')
      } else {
        const res = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(target),
        })
        if (!res.ok) throw new Error(`POST /api/bookmarks → ${res.status}`)
        const data = (await res.json()) as { doc?: { id: number } }
        setId(data.doc?.id ?? null)
        toast('Сохранено — ищите в «Сохранённом»', 'success')
      }
    } catch (error) {
      console.error('Не удалось изменить закладку', error)
      toast('Не удалось сохранить — попробуйте ещё раз', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      className={cn(
        'inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors disabled:opacity-50',
        saved
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : saved ? (
        <BookmarkCheck className="h-4 w-4 text-primary" aria-hidden="true" />
      ) : (
        <Bookmark className="h-4 w-4" aria-hidden="true" />
      )}
      {/* Не «Сохранить»: на уроке рядом кнопка сохранения заметки. */}
      {saved ? 'В сохранённом' : 'В сохранённое'}
    </button>
  )
}
