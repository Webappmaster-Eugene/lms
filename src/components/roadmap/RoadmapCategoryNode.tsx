import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { RoadmapNodeData } from './types'
import { RoadmapIcon } from './RoadmapIcon'
import { getNodeClasses } from './stage-colors'
import { cn } from '@/lib/utils'

/** Заголовок этапа: заметнее темы, с ограниченной шириной и свободным переносом текста. */
export function RoadmapCategoryNode({ data }: NodeProps) {
  const nodeData = data as RoadmapNodeData
  const classes = getNodeClasses(nodeData.color, nodeData.stage, nodeData.status)

  return (
    <div
      title={nodeData.description ?? undefined}
      className={cn(
        'w-[320px] rounded-xl border px-5 py-4 shadow-sm',
        classes.bg,
        classes.border,
        classes.text,
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', classes.accent)}>
          <RoadmapIcon name={nodeData.icon} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block break-words pt-1 text-[15px] font-semibold leading-5">
            {nodeData.label}
          </span>
          {nodeData.description && (
            <span className={cn('mt-2 block break-words text-xs leading-[18px]', classes.accent)}>
              {nodeData.description}
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-border !border-0" />
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-border !border-0" />
    </div>
  )
}
