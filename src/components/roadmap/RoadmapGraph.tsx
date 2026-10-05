'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTheme } from 'next-themes'
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  MarkerType,
  useReactFlow,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './roadmap-graph.css'

import { Crosshair, Search, Scan, Maximize, Minimize } from 'lucide-react'
import type { RoadmapGraphProps, AnyRoadmapNode, GraphNode, NodeStatus } from './types'
import { RoadmapCategoryNode } from './RoadmapCategoryNode'
import { RoadmapTopicNode } from './RoadmapTopicNode'
import { RoadmapSubtopicNode } from './RoadmapSubtopicNode'
import { RoadmapAnnotationNode } from './RoadmapAnnotationNode'
import { RoadmapNodePanel } from './RoadmapNodePanel'
import { RoadmapRouteEdge } from './RoadmapRouteEdge'
import { useRoadmapLayout } from './use-roadmap-layout'
import { STAGE_ORDER, STAGE_TITLES } from './stage-colors'

const edgeTypes = { 'roadmap-route': RoadmapRouteEdge }

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

function viewportDuration() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300
}

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

function RoadmapCanvas({ nodes, edges, nextStepNodeId = null, managementRoadmapId }: RoadmapGraphProps) {
  const { resolvedTheme } = useTheme()
  const flow = useReactFlow()
  const model = useRoadmapLayout(nodes, edges)
  const initializedFor = useRef('')
  const canvasRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [viewportError, setViewportError] = useState('')
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === canvasRef.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  async function toggleFullscreen() {
    setViewportError('')
    const previousPane = canvasRef.current?.querySelector<HTMLElement>('.react-flow')
    const previousSize = previousPane ? { width: previousPane.clientWidth, height: previousPane.clientHeight } : null
    const previousViewport = flow.getViewport()
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await canvasRef.current?.requestFullscreen()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const pane = canvasRef.current?.querySelector<HTMLElement>('.react-flow')
      if (pane && previousSize?.width && previousSize.height) {
        const center = { x: (previousSize.width / 2 - previousViewport.x) / previousViewport.zoom, y: (previousSize.height / 2 - previousViewport.y) / previousViewport.zoom }
        const ratio = Math.min(pane.clientWidth / previousSize.width, pane.clientHeight / previousSize.height)
        const zoom = Math.min(1.5, Math.max(0.15, previousViewport.zoom * ratio))
        await flow.setViewport({ x: pane.clientWidth / 2 - center.x * zoom, y: pane.clientHeight / 2 - center.y * zoom, zoom }, { duration: 0 })
      }
    } catch { setViewportError('Браузер не разрешил полный экран. Используйте масштабирование карты.') }
  }
  const identity = model.content.map((node) => node.id).join('|')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!model.ready || initializedFor.current === identity || !model.content.length) return
    const frame = requestAnimationFrame(() => {
      initializedFor.current = identity
      const firstTopic = Math.min(...model.content.filter((node) => node.type !== 'category').map((node) => node.position.y))
      void flow.fitView({ nodes: model.content.filter((node) => node.position.y <= firstTopic), padding: 0.18, minZoom: 0.65, maxZoom: 1, duration: 0 })
    })
    return () => cancelAnimationFrame(frame)
  }, [model, identity, flow])

  const topics = useMemo(() => nodes.filter(isTopicNode), [nodes])
  const selected = selectedId ? topics.find((n) => n.id === selectedId) ?? null : null
  const routedEdges = useMemo(() => model.edges.map((edge) => ({ ...edge, data: { ...edge.data, active: edge.source === selectedId || edge.target === selectedId } })), [model.edges, selectedId])

  const focusNode = useCallback(
    (id: string) => {
      const node = flow.getNode(id)
      if (!node) return
      const width = node.measured?.width ?? 280
      const height = node.measured?.height ?? 120
      void flow.setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: FOCUS_ZOOM,
        duration: viewportDuration(),
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

  const closePanel = useCallback((restoreFocus = true) => {
    setSelectedId(null)
    if (restoreFocus && selectedId) requestAnimationFrame(() => {
      const nodes = canvasRef.current?.querySelectorAll<HTMLElement>('.react-flow__node')
      Array.from(nodes ?? []).find((node) => node.getAttribute('data-id') === selectedId)?.focus()
    })
  }, [selectedId])
  const colorMode = resolvedTheme === 'dark' ? 'dark' : 'light'

  return (
    <div ref={canvasRef} data-roadmap-canvas data-layout-ready={model.ready} onKeyDownCapture={(event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const element = event.target instanceof Element ? event.target.closest('.react-flow__node') : null
      const id = element?.getAttribute('data-id')
      if (id && topics.some((node) => node.id === id)) { event.preventDefault(); event.stopPropagation(); setSelectedId(id) }
    }} className="roadmap-canvas relative flex h-[650px] w-full flex-col overflow-hidden rounded-xl border border-border bg-background sm:h-[800px]">
      <div className="shrink-0 space-y-2 border-b border-border bg-card p-3">
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
              className="h-11 w-56 rounded-md border border-border bg-card pl-8 pr-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
              className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <Crosshair className="h-4 w-4" aria-hidden="true" />
              К моему шагу
            </button>
          )}
          <button type="button" onClick={() => { closePanel(false); void flow.fitView({ padding: 0.12, duration: viewportDuration() }) }} className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"><Scan className="h-4 w-4" aria-hidden="true" />Обзор карты</button>
          <label className="sr-only" htmlFor="roadmap-stage">Перейти к этапу</label>
          <select id="roadmap-stage" defaultValue="" onChange={(event) => { const stage = event.target.value; if (stage) { closePanel(false); void flow.fitView({ nodes: model.content.filter((node) => node.stage === stage), padding: 0.18, minZoom: 0.65, maxZoom: 1, duration: viewportDuration() }); event.currentTarget.value = '' } }} className="h-11 max-w-56 rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">
            <option value="">Перейти к этапу</option>
            {STAGE_ORDER.filter((stage) => model.content.some((node) => node.stage === stage)).map((stage) => <option key={stage} value={stage}>{STAGE_TITLES[stage]}</option>)}
          </select>
        <button type="button" onClick={() => void toggleFullscreen()} className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">{fullscreen ? <Minimize aria-hidden="true" className="h-4 w-4" /> : <Maximize aria-hidden="true" className="h-4 w-4" />}{fullscreen ? 'Выйти из полного экрана' : 'Во весь экран'}</button>
        </div>
        {viewportError && <p role="alert" className="text-sm text-destructive">{viewportError}</p>}
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
      </div>
      <div className="relative min-h-0 flex-1">
      <ReactFlow
        nodes={model.nodes}
        edges={routedEdges}
        edgeTypes={edgeTypes}
        ariaLabelConfig={{
          'controls.zoomIn.ariaLabel': 'Приблизить карту',
          'controls.zoomOut.ariaLabel': 'Отдалить карту',
          'controls.fitView.ariaLabel': 'Показать всю карту',
          'minimap.ariaLabel': 'Мини-карта роадмапа',
          'node.a11yDescription.default': 'Нажмите Enter или пробел, чтобы открыть тему.',
          'node.a11yDescription.keyboardDisabled': 'Нажмите Enter или пробел, чтобы открыть тему.',
        }}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => closePanel(false)}
        colorMode={colorMode}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        minZoom={0.15}
        maxZoom={1.5}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: colorMode === 'dark' ? '#a1a1aa' : '#71717a' },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap pannable zoomable nodeColor={getMinimapNodeColor} position="bottom-left" className="!hidden sm:!block" />
      </ReactFlow>
      {selected && <RoadmapNodePanel data={selected.data} onClose={() => closePanel()} managementRoadmapId={managementRoadmapId} nodeId={selected.data.managementNodeId} />}
      </div>
      {!model.ready && <p role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Готовим карту…</p>}

    </div>
  )
}
