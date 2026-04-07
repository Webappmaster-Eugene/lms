'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { EditorNodeData } from './types'
import { getNodeClasses } from '@/components/roadmap/stage-colors'
import { cn } from '@/lib/utils'

export function EditorSubtopicNode({ data, selected }: NodeProps) {
  const nodeData = data as EditorNodeData
  const classes = getNodeClasses(nodeData.color, nodeData.stage, 'available')

  return (
    <div
      className={cn(
        'flex min-w-[140px] items-center gap-2 rounded-md border-2 px-3 py-2 shadow-sm transition-all',
        classes.bg,
        classes.border,
        classes.text,
        selected && 'editor-node--selected',
      )}
    >
      <span className="text-[11px] font-semibold leading-tight">{nodeData.label}</span>

      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  )
}
