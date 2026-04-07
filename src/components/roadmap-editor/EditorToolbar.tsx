'use client'

import { useState, useCallback } from 'react'
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  ExternalLink,
  Loader2,
  ChevronDown,
  LayoutGrid,
  BookOpen,
  Tag,
} from 'lucide-react'
import type { RoadmapInfo } from './types'
import { cn } from '@/lib/utils'

type Props = {
  roadmapInfo: RoadmapInfo | null
  isDirty: boolean
  isSaving: boolean
  hasSelection: boolean
  onAddNode: (type: 'category' | 'topic' | 'subtopic') => void
  onDeleteSelected: () => void
  onSave: () => void
}

export function EditorToolbar({
  roadmapInfo,
  isDirty,
  isSaving,
  hasSelection,
  onAddNode,
  onDeleteSelected,
  onSave,
}: Props) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  const handleAdd = useCallback(
    (type: 'category' | 'topic' | 'subtopic') => {
      onAddNode(type)
      setAddMenuOpen(false)
    },
    [onAddNode],
  )

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
      {/* Back */}
      <a
        href="/admin/collections/roadmaps"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Назад</span>
      </a>

      {/* Separator */}
      <div className="h-5 w-px bg-border" />

      {/* Title */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <h1 className="text-sm font-semibold text-foreground truncate">
          {roadmapInfo?.title ?? 'Загрузка...'}
        </h1>
        {isDirty && (
          <span className="flex-shrink-0 inline-block h-2 w-2 rounded-full bg-amber-500" title="Есть несохранённые изменения" />
        )}
      </div>

      {/* Add node dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setAddMenuOpen(!addMenuOpen)}
          className={cn(
            'flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors',
            'bg-background hover:bg-accent text-foreground',
          )}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Добавить</span>
          <ChevronDown className="h-3 w-3" />
        </button>

        {addMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAddMenuOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-border bg-card py-1 shadow-lg">
              <button
                type="button"
                onClick={() => handleAdd('category')}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                Категория
              </button>
              <button
                type="button"
                onClick={() => handleAdd('topic')}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                Тема
              </button>
              <button
                type="button"
                onClick={() => handleAdd('subtopic')}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <Tag className="h-4 w-4 text-muted-foreground" />
                Подтема
              </button>
            </div>
          </>
        )}
      </div>

      {/* Delete selected */}
      <button
        type="button"
        disabled={!hasSelection}
        onClick={onDeleteSelected}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
          hasSelection
            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900'
            : 'border-border bg-background text-muted-foreground cursor-not-allowed opacity-50',
        )}
      >
        <Trash2 className="h-4 w-4" />
        <span className="hidden sm:inline">Удалить</span>
      </button>

      {/* Save */}
      <button
        type="button"
        disabled={!isDirty || isSaving}
        onClick={onSave}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
          isDirty && !isSaving
            ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
            : 'border-border bg-background text-muted-foreground cursor-not-allowed opacity-50',
        )}
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        <span className="hidden sm:inline">{isSaving ? 'Сохранение...' : 'Сохранить'}</span>
      </button>

      {/* Preview */}
      {roadmapInfo?.slug && (
        <a
          href={`/roadmaps/${roadmapInfo.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">Preview</span>
        </a>
      )}
    </div>
  )
}
