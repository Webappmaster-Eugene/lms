'use client'

import { useCallback, useMemo } from 'react'
import { useStore } from '@xyflow/react'
import { layoutRoadmap } from '@/lib/roadmap-layout'
import type { AnyRoadmapNode, GraphEdge, GraphNode } from '@/components/roadmap/types'

export function isContentNode(node: AnyRoadmapNode): node is GraphNode {
  return node.type === 'category' || node.type === 'topic' || node.type === 'subtopic'
}

/** Browser measurements account for wrapping, fonts and the number of courses. */
export function useRoadmapLayout(nodes: AnyRoadmapNode[], edges: GraphEdge[]) {
  const content = useMemo(() => nodes.filter(isContentNode), [nodes])
  const dimensions = useStore(useCallback((state) => JSON.stringify(content.map((node) => {
    const measured = state.nodeLookup.get(node.id)?.measured
    return [node.id, measured?.width ?? 0, measured?.height ?? 0]
  })), [content]))

  return useMemo(() => {
    const sizes = new Map<string, { width: number; height: number }>()
    const entries = JSON.parse(dimensions) as [string, number, number][]
    for (const [id, width, height] of entries) sizes.set(id, { width, height })
    const ready = content.every((node) => (sizes.get(node.id)?.width ?? 0) > 0 && (sizes.get(node.id)?.height ?? 0) > 0)
    const result = layoutRoadmap(content.map((node) => ({
      ...node,
      width: sizes.get(node.id)?.width || (node.type === 'category' ? 320 : 280),
      height: sizes.get(node.id)?.height || (node.type === 'category' ? 96 : 260),
      stage: node.data.stage,
    })), edges)
    const positions = new Map(result.nodes.map((node) => [node.id, node.position]))
    return {
      ready,
      content: result.nodes,
      // Measurements belong to layout math, not fixed DOM wrapper dimensions.
      nodes: [...content.map((node) => {
        const size = sizes.get(node.id)
        return { ...node, position: positions.get(node.id) ?? node.position,
          focusable: node.type !== 'category',
          ariaRole: node.type === 'category' ? 'group' as const : 'button' as const,
          ariaLabel: node.type === 'category' ? node.data.label : `Открыть тему «${node.data.label}»`,
          // Controlled ReactFlow nodes must retain measured, or adoption resets it.
          measured: size?.width && size.height ? size : node.measured,
        }
      })],
      edges: edges.filter((edge) => result.routes[edge.id]).map((edge) => ({ ...edge, type: 'roadmap-route', animated: false,
        ariaLabel: `Переход от «${content.find((node) => node.id === edge.source)?.data.label ?? edge.source}» к «${content.find((node) => node.id === edge.target)?.data.label ?? edge.target}»`,
        data: { ...edge.data, points: result.routes[edge.id] },
      })),
    }
  }, [content, dimensions, edges])
}
