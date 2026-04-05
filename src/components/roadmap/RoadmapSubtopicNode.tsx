import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CheckCircle2, Lock } from 'lucide-react'
import type { RoadmapNodeData } from './types'
import { getNodeClasses } from './stage-colors'
import { cn } from '@/lib/utils'

/**
 * Мини-узел для дополнительных блоков «роста» (нагрузочное тестирование,
 * мониторинг, стратегия проектов). На Miro-доске — это небольшие плашки
 * серого цвета, без внутренних списков.
 */
export function RoadmapSubtopicNode({ data }: NodeProps) {
  const nodeData = data as RoadmapNodeData
  const isLocked = nodeData.status === 'locked'
  const isCompleted = nodeData.status === 'completed'
  const isClickable = nodeData.courseSlug !== null && !isLocked
  const classes = getNodeClasses(nodeData.color, nodeData.stage, nodeData.status)

  return (
    <div
      title={nodeData.description ?? undefined}
      className={cn(
        'flex min-w-[140px] items-center gap-2 rounded-md border-2 px-3 py-2 shadow-sm transition-all',
        classes.bg,
        classes.border,
        classes.text,
        classes.ring,
        isClickable && 'cursor-pointer hover:scale-[1.03] hover:shadow-md',
      )}
    >
      {isLocked && <Lock className={cn('h-3 w-3 flex-shrink-0', classes.accent)} />}
      {isCompleted && <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-success" />}
      <span className="text-[11px] font-semibold leading-tight">{nodeData.label}</span>

      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !bg-border !border-0" />
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !bg-border !border-0" />
    </div>
  )
}
