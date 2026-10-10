import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CheckCircle2, Lock, Play } from 'lucide-react'
import type { RoadmapNodeData } from './types'
import { RoadmapIcon } from './RoadmapIcon'
import { getNodeClasses } from './stage-colors'
import { cn } from '@/lib/utils'

/** Краткое содержание темы; полная программа открывается в панели по клику. */
export function RoadmapTopicNode({ data }: NodeProps) {
  const nodeData = data as RoadmapNodeData
  const comingSoon = nodeData.comingSoon
  const isLocked = nodeData.status === 'locked'
  const isCompleted = nodeData.status === 'completed'
  const hasProgress = nodeData.totalLessons > 0
  const isClickable = !comingSoon
  const firstBlocker = nodeData.courses.find((course) => course.blockedBy.length > 0)?.blockedBy[0]
  const classes = getNodeClasses(nodeData.color, nodeData.stage, nodeData.status)
  const showCourses = nodeData.courses.length > 1
  const visibleCourses = nodeData.courses.slice(0, 3)
  const visibleBullets = nodeData.bullets.slice(0, 4)

  return (
    <div
      title={nodeData.description ?? undefined}
      className={cn(
        'relative flex min-h-[180px] w-[280px] flex-col rounded-xl border shadow-sm transition-shadow',
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
      <div className="flex items-start gap-2.5 px-4 pb-3 pt-4">
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', classes.accent)}>
          {isLocked ? (
            <Lock className="h-4 w-4" aria-hidden="true" />
          ) : isCompleted ? (
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
          ) : (
            <RoadmapIcon name={nodeData.icon} className="h-4 w-4" />
          )}
        </div>
        <span className="min-w-0 break-words pt-0.5 text-[15px] font-semibold leading-5">
          {nodeData.learningOrder !== undefined && <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-current/20 px-1 text-xs tabular-nums" aria-label={`Шаг ${nodeData.learningOrder}`}>{nodeData.learningOrder}</span>}
          {nodeData.label}
        </span>
      </div>

      {showCourses && (
        <ul className="space-y-2 px-4 pb-4 text-xs leading-[18px]">
          {visibleCourses.map((course) => (
            <li key={course.slug} className="flex items-start gap-2">
              <span className={cn('shrink-0', classes.accent)} aria-hidden="true">•</span>
              <span className="line-clamp-2 min-w-0 flex-1 break-words">{course.title}</span>
              <span className={cn('shrink-0 tabular-nums', classes.accent)} title="Количество уроков">
                {course.totalLessons}
              </span>
            </li>
          ))}
          {nodeData.courses.length > visibleCourses.length && (
            <li className={cn('pl-3.5', classes.accent)}>
              Ещё {nodeData.courses.length - visibleCourses.length} — в программе темы
            </li>
          )}
        </ul>
      )}

      {nodeData.bullets.length > 0 && !showCourses && (
        <ul className="space-y-1.5 px-4 pb-4 text-xs leading-[18px]">
          {visibleBullets.map((bullet, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className={cn('shrink-0', classes.accent)} aria-hidden="true">•</span>
              <span className="line-clamp-2 min-w-0 break-words">{bullet}</span>
            </li>
          ))}
          {nodeData.bullets.length > visibleBullets.length && (
            <li className={cn('pl-3.5', classes.accent)}>
              Ещё {nodeData.bullets.length - visibleBullets.length} — в описании темы
            </li>
          )}
        </ul>
      )}

      {hasProgress && !isLocked && (
        <div className={cn('mt-auto border-t px-4 py-3', classes.border)}>
          <div className="flex items-center justify-between gap-2 text-xs leading-4">
            <span className={classes.accent}>
              {nodeData.completedLessons}/{nodeData.totalLessons} уроков
            </span>
            <span className="font-medium tabular-nums">{nodeData.progressPercent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Прогресс темы «${nodeData.label}»`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={nodeData.progressPercent}
            className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10"
          >
            <div
              className={cn('h-full rounded-full', isCompleted ? 'bg-success' : 'bg-info')}
              style={{ width: `${nodeData.progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {isLocked && (
        <div className={cn('mt-auto border-t px-4 py-3 text-xs leading-[18px]', classes.border, classes.accent)}>
          {comingSoon
            ? 'Материалы готовятся'
            : firstBlocker
              ? `Сначала: ${firstBlocker}`
              : 'Пройдите предыдущие курсы'}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-border !border-0" />
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-border !border-0" />
    </div>
  )
}
