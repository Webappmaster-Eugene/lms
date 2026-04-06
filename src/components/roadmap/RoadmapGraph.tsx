'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './roadmap-graph.css'

import type { RoadmapGraphProps, AnyRoadmapNode, NodeStatus } from './types'
import { RoadmapCategoryNode } from './RoadmapCategoryNode'
import { RoadmapTopicNode } from './RoadmapTopicNode'
import { RoadmapSubtopicNode } from './RoadmapSubtopicNode'
import { RoadmapAnnotationNode } from './RoadmapAnnotationNode'

// Должно быть определено вне компонента — иначе ReactFlow перерендерится на каждом тике.
const nodeTypes = {
  category: RoadmapCategoryNode,
  topic: RoadmapTopicNode,
  subtopic: RoadmapSubtopicNode,
  annotation: RoadmapAnnotationNode,
} as const

const MINIMAP_NODE_COLORS: Record<NodeStatus, string> = {
  locked: 'hsl(var(--muted))',
  available: 'hsl(var(--border))',
  'in-progress': 'hsl(var(--info))',
  completed: 'hsl(var(--success))',
}

function getMinimapNodeColor(node: AnyRoadmapNode): string {
  if (node.type === 'annotation') return 'transparent'
  const data = node.data as { status?: NodeStatus } | undefined
  const status = data?.status
  return status
    ? MINIMAP_NODE_COLORS[status] ?? MINIMAP_NODE_COLORS.available
    : MINIMAP_NODE_COLORS.available
}

export function RoadmapGraph({ nodes, edges }: RoadmapGraphProps) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()

  const onNodeClick: NodeMouseHandler<AnyRoadmapNode> = useCallback(
    (_event, node) => {
      if (node.type === 'annotation') return
      const data = node.data as { courseSlug?: string | null; status?: string }
      if (data.courseSlug && data.status !== 'locked') {
        router.push(`/courses/${data.courseSlug}`)
      }
    },
    [router],
  )

  const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light'

  return (
    <div className="relative h-[650px] w-full overflow-hidden rounded-xl border border-border bg-background sm:h-[800px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        colorMode={colorMode}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.15}
        maxZoom={1.5}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { strokeWidth: 2.5 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap pannable zoomable nodeColor={getMinimapNodeColor} position="bottom-left" />
      </ReactFlow>

    </div>
  )
}
