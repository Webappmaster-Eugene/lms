'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, Trash2, Plus, GripVertical } from 'lucide-react'
import type { EditorNode, EditorNodeData } from './types'
import type { NodeColor, NodeStage } from '@/components/roadmap/stage-colors'
import { STAGE_DEFAULT_COLOR } from '@/components/roadmap/stage-colors'
import { getEditorColors } from './editor-colors'

const ICON_OPTIONS = [
  { value: '', label: 'Без иконки' },
  { value: 'book-open', label: 'BookOpen' },
  { value: 'box', label: 'Box' },
  { value: 'circle-dot', label: 'CircleDot' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'code2', label: 'Code2' },
  { value: 'cpu', label: 'Cpu' },
  { value: 'database', label: 'Database' },
  { value: 'file-code', label: 'FileCode' },
  { value: 'folder-tree', label: 'FolderTree' },
  { value: 'git-branch', label: 'GitBranch' },
  { value: 'globe', label: 'Globe' },
  { value: 'key-round', label: 'KeyRound' },
  { value: 'layers', label: 'Layers' },
  { value: 'layout', label: 'Layout' },
  { value: 'lock', label: 'Lock' },
  { value: 'monitor', label: 'Monitor' },
  { value: 'network', label: 'Network' },
  { value: 'palette', label: 'Palette' },
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'server', label: 'Server' },
  { value: 'settings', label: 'Settings' },
  { value: 'shield', label: 'Shield' },
  { value: 'smartphone', label: 'Smartphone' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'test-tube', label: 'TestTube' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'zap', label: 'Zap' },
] as const

const NODE_TYPE_OPTIONS: { value: EditorNodeData['nodeType']; label: string }[] = [
  { value: 'category', label: 'Категория' },
  { value: 'topic', label: 'Тема' },
  { value: 'subtopic', label: 'Подтема' },
]

const STAGE_OPTIONS: { value: NodeStage | ''; label: string }[] = [
  { value: '', label: 'Не указана' },
  { value: 'start', label: 'Start' },
  { value: 'base', label: 'Base (1 неделя)' },
  { value: 'stage1', label: 'Trainee (2-4 недели)' },
  { value: 'stage2', label: 'Junior (1 неделя)' },
  { value: 'practice', label: 'Middle (1-2 месяца)' },
  { value: 'advanced', label: 'Senior' },
  { value: 'growth', label: 'Growth' },
]

const COLOR_OPTIONS: { value: NodeColor | ''; label: string }[] = [
  { value: '', label: 'По стадии' },
  { value: 'yellow', label: 'Yellow (Base)' },
  { value: 'lime', label: 'Lime (Key)' },
  { value: 'white', label: 'White (Neutral)' },
  { value: 'gray', label: 'Gray (Additional)' },
  { value: 'pink', label: 'Pink (Start/End)' },
  { value: 'blue', label: 'Blue (Info)' },
  { value: 'red', label: 'Red (Critical)' },
]

type Props = {
  node: EditorNode
  roadmapId: number
  onUpdate: (nodeId: string, data: Partial<EditorNodeData>) => void
  onDelete: () => void
  onClose: () => void
}

type CourseOption = { id: number; title: string; slug: string }

export function NodeSidePanel({ node, roadmapId, onUpdate, onDelete, onClose }: Props) {
  const data = node.data as EditorNodeData
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [coursesLoading, setCoursesLoading] = useState(false)

  // Load courses for this roadmap
  useEffect(() => {
    let cancelled = false
    setCoursesLoading(true)

    fetch(`/api/courses?where[roadmap][equals]=${roadmapId}&limit=200&sort=order&depth=0`, {
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((json: { docs: CourseOption[] }) => {
        if (!cancelled) setCourses(json.docs)
      })
      .catch(() => {
        if (!cancelled) setCourses([])
      })
      .finally(() => {
        if (!cancelled) setCoursesLoading(false)
      })

    return () => { cancelled = true }
  }, [roadmapId])

  const update = useCallback(
    (partial: Partial<EditorNodeData>) => {
      onUpdate(node.id, partial)
    },
    [onUpdate, node.id],
  )

  const addBullet = useCallback(() => {
    update({ bullets: [...data.bullets, ''] })
  }, [update, data.bullets])

  const removeBullet = useCallback(
    (index: number) => {
      update({ bullets: data.bullets.filter((_, i) => i !== index) })
    },
    [update, data.bullets],
  )

  const updateBullet = useCallback(
    (index: number, text: string) => {
      const newBullets = [...data.bullets]
      newBullets[index] = text
      update({ bullets: newBullets })
    },
    [update, data.bullets],
  )

  const previewColors = getEditorColors(data.color, data.stage)

  return (
    <div className="editor-side-panel flex h-full w-[360px] flex-shrink-0 flex-col border-l border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Свойства узла</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Color preview */}
        <div style={{ borderRadius: 8, border: `2px solid ${previewColors.border}`, backgroundColor: previewColors.bg, color: previewColors.text, padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {data.label || 'Preview'}
        </div>

        {/* Label */}
        <FieldGroup label="Название">
          <input
            type="text"
            value={data.label}
            onChange={(e) => update({ label: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Название узла"
          />
        </FieldGroup>

        {/* Node ID (readonly for existing) */}
        <FieldGroup label="Node ID">
          <input
            type="text"
            value={data.nodeId}
            readOnly={data.payloadId != null}
            onChange={(e) => data.payloadId == null && update({ nodeId: e.target.value })}
            style={{
              width: '100%',
              borderRadius: 6,
              border: '1px solid #555',
              padding: '6px 12px',
              fontSize: 14,
              fontFamily: 'monospace',
              backgroundColor: data.payloadId != null ? '#333' : '#1a1a1a',
              color: data.payloadId != null ? '#999' : '#eee',
            }}
          />
        </FieldGroup>

        {/* Node type */}
        <FieldGroup label="Тип узла">
          <select
            value={data.nodeType}
            onChange={(e) => update({ nodeType: e.target.value as EditorNodeData['nodeType'] })}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {NODE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldGroup>

        {/* Stage */}
        <FieldGroup label="Стадия">
          <select
            value={data.stage ?? ''}
            onChange={(e) => update({ stage: (e.target.value || null) as NodeStage | null })}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldGroup>

        {/* Color */}
        <FieldGroup label="Цвет">
          <select
            value={data.color ?? ''}
            onChange={(e) => update({ color: (e.target.value || null) as NodeColor | null })}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {COLOR_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldGroup>

        {/* Icon */}
        <FieldGroup label="Иконка">
          <select
            value={data.icon ?? ''}
            onChange={(e) => update({ icon: e.target.value || null })}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {ICON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FieldGroup>

        {/* Description */}
        <FieldGroup label="Описание (tooltip)">
          <textarea
            value={data.description ?? ''}
            onChange={(e) => update({ description: e.target.value || null })}
            maxLength={300}
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Краткое описание (max 300)"
          />
          <span className="text-[10px] text-muted-foreground">
            {(data.description ?? '').length}/300
          </span>
        </FieldGroup>

        {/* Order */}
        <FieldGroup label="Порядок">
          <input
            type="number"
            value={data.order}
            onChange={(e) => update({ order: Number(e.target.value) || 0 })}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </FieldGroup>

        {/* Course */}
        <FieldGroup label="Привязанный курс">
          <select
            value={data.courseId ?? ''}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null
              const course = courses.find((c) => c.id === id)
              update({ courseId: id, courseName: course?.title ?? null })
            }}
            disabled={coursesLoading}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Не привязан</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </FieldGroup>

        {/* Position (readonly) */}
        <FieldGroup label="Позиция">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">X</label>
              <input
                type="text"
                value={Math.round(node.position.x)}
                readOnly
                className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-mono text-muted-foreground"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">Y</label>
              <input
                type="text"
                value={Math.round(node.position.y)}
                readOnly
                className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-mono text-muted-foreground"
              />
            </div>
          </div>
        </FieldGroup>

        {/* Bullets */}
        <FieldGroup label={`Под-темы (${data.bullets.length})`}>
          <div className="space-y-1.5">
            {data.bullets.map((bullet, i) => (
              <div key={i} className="flex items-center gap-1">
                <GripVertical className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  value={bullet}
                  onChange={(e) => updateBullet(i, e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={`Под-тема ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeBullet(i)}
                  className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {data.bullets.length < 20 && (
              <button
                type="button"
                onClick={addBullet}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Добавить под-тему
              </button>
            )}
          </div>
        </FieldGroup>
      </div>

      {/* Delete button */}
      <div className="border-t border-border p-4">
        <button
          type="button"
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Удалить узел
        </button>
      </div>
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
