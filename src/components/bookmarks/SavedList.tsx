'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Bookmark, BookOpen, Code2, Loader2, X } from 'lucide-react'

import { useToast } from '@/components/ui/Toast'
import type { SavedItem } from '@/lib/bookmarks'
import { cn, formatDate, pluralize } from '@/lib/utils'

type Filter = 'all' | SavedItem['kind']
const FILTER_LABELS: Record<Filter, string> = { all: 'Всё', lesson: 'Уроки', task: 'Задачи' }

export function SavedList({ items: initial }: { items: SavedItem[] }) {
  const [items, setItems] = useState(initial)
  const [filter, setFilter] = useState<Filter>('all')
  const [removing, setRemoving] = useState<string | null>(null)
  const { toast } = useToast()

  async function remove(item: SavedItem) {
    setRemoving(item.id)
    try {
      const res = await fetch(`/api/bookmarks/${item.id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error(`DELETE /api/bookmarks → ${res.status}`)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      toast('Убрано из сохранённого', 'info')
    } catch (error) {
      console.error('Не удалось убрать закладку', error)
      toast('Не удалось убрать — попробуйте ещё раз', 'error')
    } finally {
      setRemoving(null)
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Bookmark className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="max-w-sm text-muted-foreground">
          Здесь пока пусто. Нажмите «Сохранить» на уроке или задаче тренажёра, чтобы вернуться к ним позже
        </p>
        <Link href="/courses" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          К курсам
        </Link>
      </div>
    )
  }

  const counts: Record<Filter, number> = {
    all: items.length,
    lesson: items.filter((i) => i.kind === 'lesson').length,
    task: items.filter((i) => i.kind === 'task').length,
  }
  const shown = items.filter((i) => filter === 'all' || i.kind === filter)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Что показать">
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              filter === f
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {FILTER_LABELS[f]} <span className="opacity-70">{counts[f]}</span>
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {pluralize(shown.length, 'запись', 'записи', 'записей')}
      </p>

      <ul className="space-y-2">
        {shown.map((item) => {
          const Icon = item.kind === 'lesson' ? BookOpen : Code2
          return (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <Link href={item.href} className="block truncate font-medium text-foreground hover:text-primary">
                  {item.title}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {item.kind === 'lesson' ? 'Урок' : 'Задача'}
                  {item.context && ` · ${item.context}`} · сохранено {formatDate(item.savedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(item)}
                disabled={removing === item.id}
                aria-label={`Убрать «${item.title}» из сохранённого`}
                className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {removing === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
