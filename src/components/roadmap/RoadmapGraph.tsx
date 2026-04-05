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

import type { RoadmapGraphProps, GraphNode, NodeStatus } from './types'
import { RoadmapCategoryNode } from './RoadmapCategoryNode'
import { RoadmapTopicNode } from './RoadmapTopicNode'
import { RoadmapSubtopicNode } from './RoadmapSubtopicNode'
import { STAGE_ANNOTATIONS, STAGE_LEVELS } from './stage-colors'

// Должно быть определено вне компонента — иначе ReactFlow перерендерится на каждом тике.
const nodeTypes = {
  category: RoadmapCategoryNode,
  topic: RoadmapTopicNode,
  subtopic: RoadmapSubtopicNode,
} as const

const MINIMAP_NODE_COLORS: Record<NodeStatus, string> = {
  locked: 'hsl(var(--muted))',
  available: 'hsl(var(--border))',
  'in-progress': 'hsl(var(--info))',
  completed: 'hsl(var(--success))',
}

function getMinimapNodeColor(node: GraphNode): string {
  const status = node.data?.status
  return status
    ? MINIMAP_NODE_COLORS[status] ?? MINIMAP_NODE_COLORS.available
    : MINIMAP_NODE_COLORS.available
}

export function RoadmapGraph({ nodes, edges }: RoadmapGraphProps) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()

  const onNodeClick: NodeMouseHandler<GraphNode> = useCallback(
    (_event, node) => {
      const { courseSlug, status } = node.data
      if (courseSlug && status !== 'locked') {
        router.push(`/courses/${courseSlug}`)
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

      {/* Боковые аннотации стадий — статический overlay поверх графа.
          Не часть ReactFlow, поэтому не зумится/панится вместе с графом —
          это именно «подписи к полотну», как на Miro-доске. */}
      <div className="pointer-events-none absolute inset-0 hidden sm:block">
        {STAGE_ANNOTATIONS.map((ann) => {
          const level = STAGE_LEVELS[ann.stage]
          return (
            <div key={ann.stage} className="contents">
              {ann.leftLabel && (
                <div
                  className="absolute left-4 max-w-[140px] whitespace-pre-line text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70"
                  style={{
                    top:
                      ann.stage === 'base'
                        ? '10%'
                        : ann.stage === 'stage1'
                          ? '30%'
                          : ann.stage === 'stage2'
                            ? '50%'
                            : ann.stage === 'practice'
                              ? '70%'
                              : ann.stage === 'growth'
                                ? '88%'
                                : '50%',
                  }}
                >
                  {ann.leftLabel}
                </div>
              )}
              {ann.rightLabel && (
                <div
                  className="absolute right-4 max-w-[140px] whitespace-pre-line text-left text-[11px] font-semibold leading-tight text-amber-500/80"
                  style={{
                    top:
                      ann.stage === 'stage1' ? '32%' : ann.stage === 'growth' ? '82%' : '50%',
                  }}
                >
                  {ann.rightLabel}
                </div>
              )}
              {level && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 rounded-full border border-pink-500/60 bg-pink-500/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-pink-600 dark:text-pink-300"
                  style={{
                    top:
                      ann.stage === 'stage1'
                        ? '23%'
                        : ann.stage === 'stage2'
                          ? '45%'
                          : ann.stage === 'practice'
                            ? '65%'
                            : ann.stage === 'advanced'
                              ? '82%'
                              : '50%',
                  }}
                >
                  {level}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
