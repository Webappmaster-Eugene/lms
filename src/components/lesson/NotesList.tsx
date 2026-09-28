'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, Search, StickyNote } from 'lucide-react'

import { filterNotes, groupNotesByCourse, notesToMarkdown, OTHER_GROUP_TITLE, type NoteEntry } from '@/lib/notes'
import { formatDate, pluralize } from '@/lib/utils'
import { parseTimestamps } from '@/lib/video-memory'

function download(markdown: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'mentorcareer-notes.md'
  link.click()
  // Сразу отозванная ссылка в части браузеров обрывает скачивание.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function NotesList({ notes }: { notes: NoteEntry[] }) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => groupNotesByCourse(filterNotes(notes, query)), [notes, query])
  const shown = groups.reduce((sum, g) => sum + g.notes.length, 0)

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <StickyNote className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="max-w-sm text-muted-foreground">
          Заметок пока нет. Откройте урок и запишите главное в блоке «Мои заметки» под материалом
        </p>
        <Link href="/courses" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          К курсам
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти в заметках"
            aria-label="Найти в заметках"
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => download(notesToMarkdown(groupNotesByCourse(notes)))}
          className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Скачать все (.md)
        </button>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {pluralize(shown, 'заметка', 'заметки', 'заметок')}
      </p>

      {shown === 0 ? (
        <p className="py-12 text-center text-muted-foreground">В заметках такого нет — попробуйте другое слово</p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              {group.course ? (
                <Link href={`/courses/${group.course.slug}`} className="hover:text-primary">
                  {group.course.title}
                </Link>
              ) : (
                OTHER_GROUP_TITLE
              )}
            </h2>
            <ul className="space-y-3">
              {group.notes.map((note) => (
                <li key={note.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    {note.lesson ? (
                      <Link
                        href={`/lessons/${note.lesson.slug}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {note.lesson.title}
                      </Link>
                    ) : (
                      <span className="font-medium text-muted-foreground">Урок сейчас недоступен</span>
                    )}
                    <span className="text-xs text-muted-foreground">{formatDate(note.updatedAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground">
                    <NoteText content={note.content} lessonSlug={note.lesson?.slug ?? null} />
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

/** Метки времени видео в заметке — ссылки в урок сразу на этот момент. */
function NoteText({ content, lessonSlug }: { content: string; lessonSlug: string | null }) {
  const stamps = lessonSlug ? parseTimestamps(content) : []
  if (stamps.length === 0) return <>{content}</>
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const t of stamps) {
    parts.push(content.slice(cursor, t.index))
    parts.push(
      <Link
        key={t.index}
        href={`/lessons/${lessonSlug}?t=${t.seconds}`}
        title={`Открыть видео урока на ${t.label}`}
        className="rounded bg-primary/10 px-1 tabular-nums text-foreground underline-offset-2 hover:underline"
      >
        {t.label}
      </Link>,
    )
    cursor = t.index + t.length
  }
  parts.push(content.slice(cursor))
  return <>{parts}</>
}
