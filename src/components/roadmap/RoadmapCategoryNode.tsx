import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { RoadmapNodeData } from './types'
import { getIconComponent } from './icon-map'
import { getNodeClasses } from './stage-colors'
import { cn } from '@/lib/utils'

/**
 * Узел-категория (заголовок стадии). На Miro-доске соответствует розовым
 * плашкам «Начало», «Стажёр», «Junior», «Middle», «Senior» и их пояснениям.
 * Рисуется шире и заметнее, чем topic-узлы.
 */
export function RoadmapCategoryNode({ data }: NodeProps) {
  const nodeData = data as RoadmapNodeData
  const Icon = getIconComponent(nodeData.icon)
  const classes = getNodeClasses(nodeData.color, nodeData.stage, nodeData.status)

  return (
    <div
      title={nodeData.description ?? undefined}
      className={cn(
        'min-w-[280px] rounded-xl border-2 px-5 py-3 shadow-lg',
        classes.bg,
        classes.border,
        classes.text,
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

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-border !border-0" />
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-border !border-0" />
    </div>
  )
}
