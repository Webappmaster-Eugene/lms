'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { StickyNote, Save, Loader2, Trash2, Clock, Play } from 'lucide-react'

import { formatTime, uniqueTimestamps, VIDEO_SEEK_EVENT } from '@/lib/video-memory'
import { useToast } from '@/components/ui/Toast'

type Props = {
  /** Числовой id — Payload отвергает строковые id в relationship-полях. */
  lessonId: number
}

type NoteDoc = {
  id: string
  content: string
}

export function LessonNotes({ lessonId }: Props) {
  const [note, setNote] = useState('')
  // Текст, который лежит на сервере: по нему видно, есть ли несохранённая правка.
  const [saved, setSaved] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [noteId, setNoteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [hasVideo, setHasVideo] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)


  /** Текущее время видео в заметку — туда, где стоит курсор. */
  function insertTime() {
    const video = document.querySelector('video')
    const area = areaRef.current
    if (!video || !area) return
    const stamp = `[${formatTime(video.currentTime)}] `
    const start = area.selectionStart ?? note.length
    const end = area.selectionEnd ?? note.length
    const next = `${note.slice(0, start)}${stamp}${note.slice(end)}`.slice(0, 5000)
    setNote(next)
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(start + stamp.length, start + stamp.length)
    })
  }

  const stamps = hasVideo ? uniqueTimestamps(note) : []
  const { toast } = useToast()

  useEffect(() => {
    async function loadNote() {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/notes?where[lesson][equals]=${lessonId}&limit=1`,
          { credentials: 'include' },
        )
        if (!res.ok) throw new Error(`GET /api/notes → ${res.status}`)
        const data = (await res.json()) as { docs?: NoteDoc[] }
        const n = data.docs?.[0]
        if (n) {
          setNote(n.content)
          setSaved(n.content)
          setNoteId(n.id)
        }
      } catch (error) {
        console.error('Не удалось загрузить заметку к уроку', error)
        setLoadFailed(true)
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
        const res = await fetch(`/api/notes/${noteId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content: note }),
        })
        if (!res.ok) throw new Error(`PATCH /api/notes → ${res.status}`)
      } else {
        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ lesson: lessonId, content: note }),
        })
        if (!res.ok) throw new Error(`POST /api/notes → ${res.status}`)
        const data = await res.json()
        setNoteId(data.doc?.id)
      }
      setSaved(note)
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
      const res = await fetch(`/api/notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`DELETE /api/notes → ${res.status}`)
      setNote('')
      setSaved('')
      setNoteId(null)
      toast('Заметка удалена', 'info')
    } catch {
      toast('Не удалось удалить заметку', 'error')
    } finally {
      setSaving(false)
    }
  }

  const dirty = note !== saved
  const canSave = !saving && note.trim() !== '' && dirty

  // Ушедшая вкладка забирает с собой несохранённый текст — браузер спросит перед закрытием.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          // Видео рендерит плеер урока рядом, а не заметки — ищем его на странице.
          setHasVideo(document.querySelector('video') !== null)
          setExpanded(!expanded)
        }}
        className="flex w-full items-center gap-3 px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <StickyNote className="h-4 w-4" />
        Мои заметки
        {noteId && <span className="h-2 w-2 rounded-full bg-primary" />}
        {dirty && <span className="ml-auto text-xs font-normal text-warning">Не сохранено</span>}
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {loadFailed && (
                <p role="alert" className="text-sm text-destructive">
                  Не удалось загрузить сохранённую заметку — обновите страницу, прежде чем писать новую
                </p>
              )}
              <textarea
                ref={areaRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSave) {
                    e.preventDefault()
                    void handleSave()
                  }
                }}
                aria-label="Заметка к уроку"
                aria-describedby="lesson-note-hint"
                placeholder="Запишите ключевые моменты урока..."
                maxLength={5000}
                rows={5}
                className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
              />
              {hasVideo && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={insertTime}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    Вставить время видео
                  </button>
                  {stamps.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Перейти к моменту видео">
                      {stamps.map((t) => (
                        <button
                          key={t.seconds}
                          type="button"
                          onClick={() => window.dispatchEvent(new CustomEvent(VIDEO_SEEK_EVENT, { detail: { seconds: t.seconds } }))}
                          className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs tabular-nums text-foreground transition-colors hover:bg-primary/20"
                        >
                          <Play className="h-3 w-3" aria-hidden="true" />
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span id="lesson-note-hint" className="text-xs text-muted-foreground">
                  <span>{note.length}/5000</span> · Ctrl/⌘+Enter — сохранить ·{' '}
                  <Link href="/notes" className="underline-offset-2 hover:text-foreground hover:underline">
                    все заметки
                  </Link>
                </span>
                <div className="flex gap-2">
                  {noteId && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Удалить
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!canSave}
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
