'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { EditorNodeData } from './types'
import { getEditorColors, getSelectionOutline } from './editor-colors'

export function EditorSubtopicNode({ data, selected }: NodeProps) {
  const d = data as EditorNodeData
  const c = getEditorColors(d.color, d.stage)

  return (
    <div
      style={{
        minWidth: 140,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: 6,
        border: `2px solid ${c.border}`,
        backgroundColor: c.bg,
        color: c.text,
        padding: '6px 12px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        ...getSelectionOutline(selected ?? false),
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2 }}>{d.label}</span>

      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  )
}
