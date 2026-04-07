'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { EditorNodeData } from './types'
import { getIconComponent } from '@/components/roadmap/icon-map'
import { getEditorColors, getSelectionOutline } from './editor-colors'

export function EditorCategoryNode({ data, selected }: NodeProps) {
  const d = data as EditorNodeData
  const Icon = getIconComponent(d.icon)
  const c = getEditorColors(d.color, d.stage)

  return (
    <div
      style={{
        minWidth: 280,
        borderRadius: 12,
        border: `2px solid ${c.border}`,
        backgroundColor: c.bg,
        color: c.text,
        padding: '12px 20px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        ...getSelectionOutline(selected ?? false),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: c.accent,
            flexShrink: 0,
          }}
        >
          <Icon style={{ width: 20, height: 20 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.2 }}>
            {d.label}
          </span>
          {d.description && (
            <span style={{ marginTop: 2, fontSize: 11, lineHeight: 1.2, color: c.accent }}>
              {d.description}
            </span>
          )}
        </div>
      </div>

      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  )
}
