'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { EditorNodeData } from './types'
import { getIconComponent } from '@/components/roadmap/icon-map'
import { getNodeClasses } from '@/components/roadmap/stage-colors'
import { cn } from '@/lib/utils'

export function EditorCategoryNode({ data, selected }: NodeProps) {
  const nodeData = data as EditorNodeData
  const Icon = getIconComponent(nodeData.icon)
  const classes = getNodeClasses(nodeData.color, nodeData.stage, 'available')

  return (
    <div
      className={cn(
        'min-w-[280px] rounded-xl border-2 px-5 py-3 shadow-lg transition-all',
        classes.bg,
        classes.border,
        classes.text,
        selected && 'editor-node--selected',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border',
            classes.border,
            classes.accent,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold uppercase tracking-wide leading-tight">
            {nodeData.label}
          </span>
          {nodeData.description && (
            <span className={cn('mt-0.5 text-[11px] leading-tight', classes.accent)}>
              {nodeData.description}
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
