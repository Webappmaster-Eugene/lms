import { BaseEdge, type EdgeProps } from '@xyflow/react'
import type { RoadmapPoint } from '@/lib/roadmap-layout'

function routePath(points: RoadmapPoint[]) {
  if (!points.length) return ''
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const beforeLength = Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y)
    const afterLength = Math.abs(next.x - current.x) + Math.abs(next.y - current.y)
    const radius = Math.min(8, beforeLength / 2, afterLength / 2)
    const before = { x: current.x - Math.sign(current.x - previous.x) * radius, y: current.y - Math.sign(current.y - previous.y) * radius }
    const after = { x: current.x + Math.sign(next.x - current.x) * radius, y: current.y + Math.sign(next.y - current.y) * radius }
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`
  }
  const last = points.at(-1)
  if (last) path += ` L ${last.x} ${last.y}`
  return path
}

export function RoadmapRouteEdge({ id, data, markerEnd }: EdgeProps) {
  const points = data?.points as RoadmapPoint[] | undefined
  if (!points?.length) return null
  const active = data?.active === true
  return <BaseEdge id={id} path={routePath(points)} markerEnd={markerEnd} style={{ stroke: active ? 'hsl(var(--info))' : 'hsl(var(--muted-foreground))', strokeWidth: active ? 2.2 : 1.6, opacity: active ? 1 : 0.85 }} />
}
