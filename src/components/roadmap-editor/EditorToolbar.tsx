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

type Props = {
  roadmapInfo: RoadmapInfo | null
  isDirty: boolean
  isSaving: boolean
  hasSelection: boolean
  onAddNode: (type: 'category' | 'topic' | 'subtopic') => void
  onDeleteSelected: () => void
  onSave: () => void
}

const ico = { width: 16, height: 16 }
const icoSm = { width: 14, height: 14 }

const btn = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 6,
  border: '1px solid #3a3a5c',
  padding: '6px 12px',
  fontSize: 13,
  fontWeight: 500,
  cursor: active ? 'pointer' : 'not-allowed',
  opacity: active ? 1 : 0.45,
  background: active ? '#252540' : '#1a1a2e',
  color: active ? '#e0e0e0' : '#666',
  transition: 'background 0.15s',
})

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

  const saveActive = isDirty && !isSaving

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderRadius: 10,
        border: '1px solid #3a3a5c',
        background: '#252540',
        padding: '8px 16px',
        flexWrap: 'wrap',
      }}
    >
      {/* Back */}
      <a
        href="/admin/collections/roadmaps"
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#888', textDecoration: 'none' }}
      >
        <ArrowLeft style={ico} />
        Назад
      </a>

      {/* Separator */}
      <div style={{ width: 1, height: 20, background: '#3a3a5c' }} />

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 0%', minWidth: 0 }}>
        <h1 style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {roadmapInfo?.title ?? 'Загрузка...'}
        </h1>
        {isDirty && (
          <span
            title="Есть несохранённые изменения"
            style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }}
          />
        )}
      </div>

      {/* Add node dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setAddMenuOpen(!addMenuOpen)}
          style={{
            ...btn(true),
            background: '#2d2d50',
            border: '1px solid #4a4a7c',
          }}
        >
          <Plus style={ico} />
          Добавить
          <ChevronDown style={{ width: 12, height: 12 }} />
        </button>

        {addMenuOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setAddMenuOpen(false)} />
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                zIndex: 50,
                marginTop: 4,
                width: 180,
                borderRadius: 8,
                border: '1px solid #3a3a5c',
                background: '#252540',
                padding: '4px 0',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {([
                { type: 'category' as const, label: 'Категория', Icon: LayoutGrid },
                { type: 'topic' as const, label: 'Тема', Icon: BookOpen },
                { type: 'subtopic' as const, label: 'Подтема', Icon: Tag },
              ]).map(({ type, label, Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleAdd(type)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#e0e0e0',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Icon style={{ ...ico, color: '#888' }} />
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete selected */}
      <button
        type="button"
        disabled={!hasSelection}
        onClick={onDeleteSelected}
        style={{
          ...btn(hasSelection),
          ...(hasSelection ? { border: '1px solid #7f1d1d', background: '#1c0a0a', color: '#fca5a5' } : {}),
        }}
      >
        <Trash2 style={ico} />
        Удалить
      </button>

      {/* Save */}
      <button
        type="button"
        disabled={!saveActive}
        onClick={onSave}
        style={{
          ...btn(saveActive),
          ...(saveActive ? { border: '1px solid #6366f1', background: '#6366f1', color: '#fff' } : {}),
        }}
      >
        {isSaving ? <Loader2 style={{ ...ico, animation: 'spin 1s linear infinite' }} /> : <Save style={ico} />}
        {isSaving ? 'Сохранение...' : 'Сохранить'}
      </button>

      {/* Preview */}
      {roadmapInfo?.slug && (
        <a
          href={`/roadmaps/${roadmapInfo.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, ...btn(true), textDecoration: 'none' }}
        >
          <ExternalLink style={ico} />
          Preview
        </a>
      )}
    </div>
  )
}
