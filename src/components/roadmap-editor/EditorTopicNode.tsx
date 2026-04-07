'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { EditorNodeData } from './types'
import { getIconComponent } from '@/components/roadmap/icon-map'
import { getNodeClasses } from '@/components/roadmap/stage-colors'
import { cn } from '@/lib/utils'

export function EditorTopicNode({ data, selected }: NodeProps) {
  const nodeData = data as EditorNodeData
  const Icon = getIconComponent(nodeData.icon)
  const classes = getNodeClasses(nodeData.color, nodeData.stage, 'available')

  return (
    <div
      className={cn(
        'w-[240px] rounded-lg border-2 shadow-md transition-all',
        classes.bg,
        classes.border,
        classes.text,
        selected && 'editor-node--selected',
      )}
    >
      {/* Header */}
      <div className={cn('flex items-center gap-2 border-b px-3 py-2', classes.border)}>
        <div className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded', classes.accent)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs font-bold uppercase tracking-wide leading-tight line-clamp-2">
          {nodeData.label}
        </span>
      </div>

      {/* Bullet list */}
      {nodeData.bullets.length > 0 && (
        <ul className="space-y-0.5 px-3 py-2 text-[10px] leading-snug">
          {nodeData.bullets.slice(0, 14).map((bullet, i) => (
            <li key={i} className="flex gap-1.5">
              <span className={cn('flex-shrink-0', classes.accent)}>•</span>
              <span className="line-clamp-2">{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Course link indicator */}
      {nodeData.courseName && (
        <div className={cn('border-t px-3 py-1.5 text-[10px]', classes.border, classes.accent)}>
          📚 {nodeData.courseName}
        </div>
      )}

      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
    </div>
  )
}
