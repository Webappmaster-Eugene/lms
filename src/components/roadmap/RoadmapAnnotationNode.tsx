import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { AnnotationGraphNode } from './types'

function AnnotationNodeInner({ data }: NodeProps<AnnotationGraphNode>) {
  const { annotationType, text } = data

  if (annotationType === 'levelBadge') {
    return (
      <div className="rounded-full border border-pink-500/60 bg-pink-500/10 px-3 py-0.5 text-center text-[11px] font-bold uppercase tracking-wider text-pink-600 dark:text-pink-300">
        {text}
      </div>
    )
  }

  if (annotationType === 'rightLabel') {
    return (
      <div className="max-w-[140px] whitespace-pre-line text-left text-[11px] font-semibold leading-tight text-amber-500/80">
        {text}
      </div>
    )
  }

  // leftLabel
  return (
    <div className="max-w-[140px] whitespace-pre-line text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
      {text}
    </div>
  )
}

export const RoadmapAnnotationNode = memo(AnnotationNodeInner)
