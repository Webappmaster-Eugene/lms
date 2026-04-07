'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, Trash2, Plus, GripVertical } from 'lucide-react'
import type { EditorNode, EditorNodeData } from './types'
import type { NodeColor, NodeStage } from '@/components/roadmap/stage-colors'
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

const inputStyle: React.CSSProperties = {
  width: '100%', borderRadius: 6, border: '1px solid #3a3a5c', background: '#1a1a2e',
  padding: '6px 12px', fontSize: 13, color: '#e0e0e0', outline: 'none',
}
const selectStyle: React.CSSProperties = { ...inputStyle, appearance: 'auto' as React.CSSProperties['appearance'] }
const readonlyStyle: React.CSSProperties = { ...inputStyle, background: '#151528', color: '#666', fontFamily: 'monospace' }
const icoSm: React.CSSProperties = { width: 12, height: 12, flexShrink: 0 }

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
    (partial: Partial<EditorNodeData>) => { onUpdate(node.id, partial) },
    [onUpdate, node.id],
  )

  const addBullet = useCallback(() => {
    update({ bullets: [...data.bullets, ''] })
  }, [update, data.bullets])

  const removeBullet = useCallback(
    (index: number) => { update({ bullets: data.bullets.filter((_, i) => i !== index) }) },
    [update, data.bullets],
  )

  const updateBullet = useCallback(
    (index: number, text: string) => {
      const b = [...data.bullets]
      b[index] = text
      update({ bullets: b })
    },
    [update, data.bullets],
  )

  const pc = getEditorColors(data.color, data.stage)

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', width: 360, flexShrink: 0, height: '100%',
        borderLeft: '1px solid #3a3a5c', background: '#1e1e38', overflow: 'hidden',
        animation: 'slideInRight 0.2s ease-out',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #3a3a5c', padding: '12px 16px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0', margin: 0 }}>Свойства узла</h2>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 4, borderRadius: 4 }}>
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Scrollable fields */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Preview */}
        <div style={{ borderRadius: 8, border: `2px solid ${pc.border}`, background: pc.bg, color: pc.text, padding: '8px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {data.label || 'Preview'}
        </div>

        <Field label="Название">
          <input type="text" value={data.label} onChange={(e) => update({ label: e.target.value })} style={inputStyle} placeholder="Название узла" />
        </Field>

        <Field label="Node ID">
          <input
            type="text"
            value={data.nodeId}
            readOnly={data.payloadId != null}
            onChange={(e) => data.payloadId == null && update({ nodeId: e.target.value })}
            style={data.payloadId != null ? readonlyStyle : { ...inputStyle, fontFamily: 'monospace' }}
          />
        </Field>

        <Field label="Тип узла">
          <select value={data.nodeType} onChange={(e) => update({ nodeType: e.target.value as EditorNodeData['nodeType'] })} style={selectStyle}>
            {NODE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        <Field label="Стадия">
          <select value={data.stage ?? ''} onChange={(e) => update({ stage: (e.target.value || null) as NodeStage | null })} style={selectStyle}>
            {STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        <Field label="Цвет">
          <select value={data.color ?? ''} onChange={(e) => update({ color: (e.target.value || null) as NodeColor | null })} style={selectStyle}>
            {COLOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        <Field label="Иконка">
          <select value={data.icon ?? ''} onChange={(e) => update({ icon: e.target.value || null })} style={selectStyle}>
            {ICON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        <Field label="Описание (tooltip)">
          <textarea
            value={data.description ?? ''}
            onChange={(e) => update({ description: e.target.value || null })}
            maxLength={300}
            rows={2}
            style={{ ...inputStyle, resize: 'none' }}
            placeholder="Краткое описание (max 300)"
          />
          <span style={{ fontSize: 10, color: '#666' }}>{(data.description ?? '').length}/300</span>
        </Field>

        <Field label="Порядок">
          <input type="number" value={data.order} onChange={(e) => update({ order: Number(e.target.value) || 0 })} style={inputStyle} />
        </Field>

        <Field label="Привязанный курс">
          <select
            value={data.courseId ?? ''}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null
              const course = courses.find((c) => c.id === id)
              update({ courseId: id, courseName: course?.title ?? null })
            }}
            disabled={coursesLoading}
            style={selectStyle}
          >
            <option value="">Не привязан</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>

        <Field label="Позиция">
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 10, color: '#666' }}>X</span>
              <input type="text" value={Math.round(node.position.x)} readOnly style={readonlyStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 10, color: '#666' }}>Y</span>
              <input type="text" value={Math.round(node.position.y)} readOnly style={readonlyStyle} />
            </div>
          </div>
        </Field>

        <Field label={`Под-темы (${data.bullets.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.bullets.map((bullet, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <GripVertical style={{ ...icoSm, color: '#555' }} />
                <input
                  type="text"
                  value={bullet}
                  onChange={(e) => updateBullet(i, e.target.value)}
                  style={{ ...inputStyle, flex: 1, padding: '4px 8px', fontSize: 12 }}
                  placeholder={`Под-тема ${i + 1}`}
                />
                <button type="button" onClick={() => removeBullet(i)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: 2 }}>
                  <X style={icoSm} />
                </button>
              </div>
            ))}
            {data.bullets.length < 20 && (
              <button
                type="button"
                onClick={addBullet}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#818cf8', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
              >
                <Plus style={icoSm} />
                Добавить под-тему
              </button>
            )}
          </div>
        </Field>
      </div>

      {/* Delete */}
      <div style={{ borderTop: '1px solid #3a3a5c', padding: 16 }}>
        <button
          type="button"
          onClick={onDelete}
          style={{
            display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderRadius: 6, border: '1px solid #7f1d1d', background: '#1c0a0a', padding: '8px 12px',
            fontSize: 13, fontWeight: 500, color: '#fca5a5', cursor: 'pointer',
          }}
        >
          <Trash2 style={{ width: 16, height: 16 }} />
          Удалить узел
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, fontWeight: 500, color: '#888' }}>{label}</label>
      {children}
    </div>
  )
}
