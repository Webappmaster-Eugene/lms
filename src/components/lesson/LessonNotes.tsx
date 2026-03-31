'use client'

import { useState, useEffect } from 'react'
import { StickyNote, Save, Loader2, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

type Props = {
  lessonId: string
}

type NoteDoc = {
  id: string
  content: string
}

export function LessonNotes({ lessonId }: Props) {
  const [note, setNote] = useState('')
  const [noteId, setNoteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    async function loadNote() {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/notes?where[lesson][equals]=${lessonId}&limit=1`,
          { credentials: 'include' },
        )
        const data = await res.json()
        if (data.docs?.length > 0) {
          const n = data.docs[0] as NoteDoc
          setNote(n.content)
          setNoteId(n.id)
        }
      } catch {
        // No existing note
      } finally {
        setLoading(false)
      }
    }
    loadNote()
  }, [lessonId])

  async function handleSave() {
    setSaving(true)
    try {
      if (noteId) {
        await fetch(`/api/notes/${noteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content: note }),
        })
      } else {
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ lesson: lessonId, content: note }),
        })
        const data = await res.json()
        setNoteId(data.doc?.id)
      }
      toast('Заметка сохранена', 'success')
    } catch {
      toast('Не удалось сохранить заметку', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!noteId) return
    setSaving(true)
    try {
      await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      setNote('')
      setNoteId(null)
      toast('Заметка удалена', 'info')
    } catch {
      toast('Не удалось удалить заметку', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <StickyNote className="h-4 w-4" />
        Мои заметки
        {noteId && <span className="h-2 w-2 rounded-full bg-primary" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Запишите ключевые моменты урока..."
                maxLength={5000}
                rows={5}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{note.length}/5000</span>
                <div className="flex gap-2">
                  {noteId && (
                    <button
                      onClick={handleDelete}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Удалить
                    </button>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving || !note.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Сохранить
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
