'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { EditorNodeData } from './types'
import { getIconComponent } from '@/components/roadmap/icon-map'
import { getEditorColors, getSelectionOutline } from './editor-colors'

export function EditorTopicNode({ data, selected }: NodeProps) {
  const d = data as EditorNodeData
  const Icon = getIconComponent(d.icon)
  const c = getEditorColors(d.color, d.stage)

  return (
    <div
      style={{
        width: 240,
        borderRadius: 8,
        border: `2px solid ${c.border}`,
        backgroundColor: c.bg,
        color: c.text,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        ...getSelectionOutline(selected ?? false),
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: `1px solid ${c.border}`,
          padding: '8px 12px',
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: c.accent,
            flexShrink: 0,
          }}
        >
          <Icon style={{ width: 14, height: 14 }} />
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            lineHeight: 1.2,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {d.label}
        </span>
      </div>

      {/* Bullet list */}
      {d.bullets.length > 0 && (
        <ul style={{ padding: '6px 12px', margin: 0, listStyle: 'none', fontSize: 10, lineHeight: 1.4 }}>
          {d.bullets.slice(0, 14).map((bullet, i) => (
            <li key={i} style={{ display: 'flex', gap: 4, marginBottom: 2 }}>
              <span style={{ color: c.accent, flexShrink: 0 }}>•</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Course link indicator */}
      {d.courseName && (
        <div
          style={{
            borderTop: `1px solid ${c.border}`,
            padding: '4px 12px',
            fontSize: 10,
            color: c.accent,
          }}
        >
          📚 {d.courseName}
        </div>
      )}

      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  )
}
