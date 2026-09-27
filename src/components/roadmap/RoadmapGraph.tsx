'use client'

import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { useTheme } from 'next-themes'
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Panel,
  useReactFlow,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './roadmap-graph.css'

import { Crosshair, Search } from 'lucide-react'
import type { RoadmapGraphProps, AnyRoadmapNode, GraphNode, NodeStatus } from './types'
import { RoadmapCategoryNode } from './RoadmapCategoryNode'
import { RoadmapTopicNode } from './RoadmapTopicNode'
import { RoadmapSubtopicNode } from './RoadmapSubtopicNode'
import { RoadmapAnnotationNode } from './RoadmapAnnotationNode'
import { RoadmapNodePanel } from './RoadmapNodePanel'

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

const LEGEND: { label: string; className: string }[] = [
  { label: 'Пройдена', className: 'bg-success' },
  { label: 'В процессе', className: 'bg-info' },
  { label: 'Доступна', className: 'border border-border bg-background' },
  { label: 'Закрыта', className: 'bg-muted' },
]

/** Масштаб, при котором текст карточки читается без лупы. */
const FOCUS_ZOOM = 1

function getMinimapNodeColor(node: AnyRoadmapNode): string {
  if (node.type === 'annotation') return 'transparent'
  const data = node.data as { status?: NodeStatus } | undefined
  const status = data?.status
  return status
    ? MINIMAP_NODE_COLORS[status] ?? MINIMAP_NODE_COLORS.available
    : MINIMAP_NODE_COLORS.available
}

/** Тема, у которой есть что показать в панели: категории — это заголовки этапов. */
export function isTopicNode(node: AnyRoadmapNode): node is GraphNode {
  return node.type === 'topic' || node.type === 'subtopic'
}

export function RoadmapGraph(props: RoadmapGraphProps) {
  return (
    <ReactFlowProvider>
      <RoadmapCanvas {...props} />
    </ReactFlowProvider>
  )
}

function RoadmapCanvas({ nodes, edges, nextStepNodeId = null }: RoadmapGraphProps) {
  const { resolvedTheme } = useTheme()
  const flow = useReactFlow()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [notFound, setNotFound] = useState(false)

  const topics = useMemo(() => nodes.filter(isTopicNode), [nodes])
  const selected = selectedId ? topics.find((n) => n.id === selectedId) ?? null : null

  const focusNode = useCallback(
    (id: string) => {
      const node = flow.getNode(id)
      if (!node) return
      const width = node.measured?.width ?? 240
      const height = node.measured?.height ?? 120
      void flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: FOCUS_ZOOM,
        duration: 500,
      })
      setSelectedId(id)
    },
    [flow],
  )

  const onNodeClick: NodeMouseHandler<AnyRoadmapNode> = useCallback((_event, node) => {
    if (isTopicNode(node)) setSelectedId(node.id)
  }, [])

  const onSearch = (event: FormEvent) => {
    event.preventDefault()
    const needle = query.trim().toLowerCase()
    if (!needle) return
    const match =
      topics.find((n) => n.data.label.toLowerCase() === needle) ??
      topics.find((n) => n.data.label.toLowerCase().includes(needle)) ??
      topics.find((n) => n.data.courses.some((c) => c.title.toLowerCase().includes(needle)))
    setNotFound(!match)
    if (match) focusNode(match.id)
  }

  const closePanel = useCallback(() => setSelectedId(null), [])
  const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light'

  return (
    <div className="relative h-[650px] w-full overflow-hidden rounded-xl border border-border bg-background sm:h-[800px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={closePanel}
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
        <MiniMap pannable zoomable nodeColor={getMinimapNodeColor} position="bottom-left" className="!hidden sm:!block" />

        <Panel position="top-left" className="!m-3 flex max-w-[calc(100%-1.5rem)] flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={onSearch} role="search" className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setNotFound(false)
                }}
                list="roadmap-topic-names"
                placeholder="Найти тему или курс"
                aria-label="Найти тему или курс на карте"
                aria-invalid={notFound}
                className="h-9 w-56 rounded-md border border-border bg-card pl-8 pr-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <datalist id="roadmap-topic-names">
                {topics.map((n) => (
                  <option key={n.id} value={n.data.label} />
                ))}
              </datalist>
            </form>
            {nextStepNodeId && (
              <button
                type="button"
                onClick={() => focusNode(nextStepNodeId)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                <Crosshair className="h-4 w-4" aria-hidden="true" />
                К моему шагу
              </button>
            )}
          </div>
          {notFound && (
            <p role="status" className="w-fit rounded-md bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm">
              Ничего не нашлось — попробуйте другое слово
            </p>
          )}
          <ul className="hidden w-fit flex-wrap gap-x-3 gap-y-1 rounded-md bg-card/90 px-2 py-1 text-xs text-muted-foreground shadow-sm sm:flex" aria-label="Обозначения">
            {LEGEND.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${item.className}`} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        </Panel>
      </ReactFlow>

      {selected && <RoadmapNodePanel data={selected.data} onClose={closePanel} />}
    </div>
  )
}
