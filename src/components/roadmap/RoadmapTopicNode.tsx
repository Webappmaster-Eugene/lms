import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CheckCircle2, Lock } from 'lucide-react'
import type { RoadmapNodeData } from './types'
import { getIconComponent } from './icon-map'
import { getNodeClasses } from './stage-colors'
import { cn } from '@/lib/utils'

/**
 * Карточка темы в стиле Miro-доски: заголовок с иконкой + маркированный
 * список под-тем + футер с прогрессом (если узел связан с курсом).
 *
 * Цвет карточки определяется связкой `data.color` → `data.stage` → default.
 * Статус (locked/in-progress/completed) накладывается поверх через ring.
 */
export function RoadmapTopicNode({ data }: NodeProps) {
  const nodeData = data as RoadmapNodeData
  const Icon = getIconComponent(nodeData.icon)
  const isLocked = nodeData.status === 'locked'
  const isCompleted = nodeData.status === 'completed'
  const hasProgress = nodeData.totalLessons > 0
  const isClickable = nodeData.courseSlug !== null && !isLocked

  const classes = getNodeClasses(nodeData.color, nodeData.stage, nodeData.status)

  return (
    <div
      title={nodeData.description ?? undefined}
      className={cn(
        'w-[240px] rounded-lg border-2 shadow-md transition-all',
        classes.bg,
        classes.border,
        classes.text,
        classes.ring,
        isClickable && 'cursor-pointer hover:scale-[1.02] hover:shadow-lg',
      )}
    >
      {/* Header */}
      <div className={cn('flex items-center gap-2 border-b px-3 py-2', classes.border)}>
        <div className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded', classes.accent)}>
          {isLocked ? (
            <Lock className="h-3.5 w-3.5" />
          ) : isCompleted ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}
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

      {/* Progress footer */}
      {hasProgress && !isLocked && (
        <div className={cn('border-t px-3 py-1.5', classes.border)}>
          <div className="flex items-center justify-between text-[10px]">
            <span className={classes.accent}>
              {nodeData.completedLessons}/{nodeData.totalLessons} уроков
            </span>
            <span className="font-semibold">{nodeData.progressPercent}%</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                isCompleted ? 'bg-success' : 'bg-info',
              )}
              style={{ width: `${nodeData.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {isLocked && (
        <div className={cn('border-t px-3 py-1.5 text-[10px]', classes.border, classes.accent)}>
          Пройдите предыдущие курсы
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-border !border-0" />
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-border !border-0" />
    </div>
  )
}
