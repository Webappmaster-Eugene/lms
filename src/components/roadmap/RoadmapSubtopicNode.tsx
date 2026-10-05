import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CheckCircle2, Lock, Play } from 'lucide-react'
import type { RoadmapNodeData } from './types'
import { getNodeClasses } from './stage-colors'
import { cn } from '@/lib/utils'

/** Дополнительная тема остаётся компактной, но выравнивается с основными карточками. */
export function RoadmapSubtopicNode({ data }: NodeProps) {
  const nodeData = data as RoadmapNodeData
  const isLocked = nodeData.status === 'locked'
  const isCompleted = nodeData.status === 'completed'
  const isClickable = !nodeData.comingSoon
  const classes = getNodeClasses(nodeData.color, nodeData.stage, nodeData.status)

  return (
    <div
      title={nodeData.description ?? undefined}
      className={cn(
        'relative flex min-h-[72px] w-[280px] items-center gap-2.5 rounded-xl border px-4 py-4 shadow-sm transition-shadow',
        classes.bg,
        classes.border,
        classes.text,
        classes.ring,
        isClickable && 'cursor-pointer hover:shadow-md',
        nodeData.isNextStep && 'ring-2 ring-primary ring-offset-4 ring-offset-background',
      )}
    >
      {nodeData.isNextStep && (
        <div className="absolute -top-3 right-3 flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-medium leading-none text-primary-foreground">
          <Play className="h-3 w-3" aria-hidden="true" />
          Ваш шаг
        </div>
      )}
      {isLocked && (
        <Lock
          className={cn('h-4 w-4 shrink-0', classes.accent)}
          aria-label={nodeData.comingSoon ? 'Материалы готовятся' : 'Пройдите предыдущие курсы'}
        />
      )}
      {isCompleted && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />}
      <span className="min-w-0 break-words text-[15px] font-semibold leading-5">{nodeData.label}</span>

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-border !border-0" />
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-border !border-0" />
    </div>
  )
}
