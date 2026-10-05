'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  SmoothStepEdge,
  useReactFlow,
  type EdgeProps,
  type NodeMouseHandler,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './roadmap-editor.css'

import type { EditorNode, EditorEdge } from './types'
import { EditorCategoryNode } from './EditorCategoryNode'
import { EditorTopicNode } from './EditorTopicNode'
import { EditorSubtopicNode } from './EditorSubtopicNode'
import { RoadmapRouteEdge } from '@/components/roadmap/RoadmapRouteEdge'
import type { RoadmapPoint } from '@/lib/roadmap-layout'

/** ReactFlow handles still control endpoints after a manual edit or resize. */
function EditorRouteEdge(props: EdgeProps) {
  const points = props.data?.points as RoadmapPoint[] | undefined
  const start = points?.[0]
  const end = points?.at(-1)
  if (!start || !end || Math.abs(start.x - props.sourceX) > 2 || Math.abs(start.y - props.sourceY) > 2
    || Math.abs(end.x - props.targetX) > 2 || Math.abs(end.y - props.targetY) > 2) {
    return <SmoothStepEdge {...props} />
  }
  return <RoadmapRouteEdge {...props} data={{ ...props.data, active: props.selected }} />
}

const editorEdgeTypes = { 'editor-route': EditorRouteEdge }

const editorNodeTypes = {
  category: EditorCategoryNode,
  topic: EditorTopicNode,
  subtopic: EditorSubtopicNode,
} as const

type Props = {
  nodes: EditorNode[]
  edges: EditorEdge[]
  onNodesChange: OnNodesChange<EditorNode>
  onEdgesChange: OnEdgesChange<EditorEdge>
  onConnect: OnConnect
  onNodeClick: (nodeId: string) => void
  onPaneClick: () => void
  layoutReady?: boolean
  layoutRevision?: number
  layoutRoutes?: Record<string, RoadmapPoint[]>
}

export function RoadmapEditorCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onPaneClick,
  layoutReady = true,
  layoutRevision = 0,
  layoutRoutes,
}: Props) {
  const flow = useReactFlow()
  const fittedRevision = useRef(-1)
  const displayedEdges = useMemo(() => edges.map((edge) => layoutRoutes?.[edge.id]
    ? { ...edge, type: 'editor-route', data: {
      payloadId: edge.data?.payloadId ?? null,
      edgeType: edge.data?.edgeType ?? 'smoothstep',
      animated: edge.data?.animated ?? false,
      ...edge.data, points: layoutRoutes[edge.id],
    } }
    : edge), [edges, layoutRoutes])
  useEffect(() => {
    if (!layoutReady || !nodes.length || fittedRevision.current === layoutRevision) return
    const frame = requestAnimationFrame(() => {
      fittedRevision.current = layoutRevision
      const topics = nodes.filter((node) => node.type !== 'category')
      const firstRow = topics.length ? Math.min(...topics.map((node) => node.position.y)) : Infinity
      void flow.fitView({ nodes: nodes.filter((node) => node.position.y <= firstRow), padding: 0.18, minZoom: 0.65, maxZoom: 0.9, duration: 0 })
    })
    return () => cancelAnimationFrame(frame)
  }, [flow, nodes, layoutReady, layoutRevision])
  const handleNodeClick: NodeMouseHandler<EditorNode> = useCallback(
    (_event, node) => {
      onNodeClick(node.id)
    },
    [onNodeClick],
  )

  return (
    <div className="roadmap-editor" data-layout-ready={layoutReady} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: '12px' }}>
      <ReactFlow
        nodes={nodes}
        edges={displayedEdges}
        edgeTypes={editorEdgeTypes}
        ariaLabelConfig={{
          'controls.zoomIn.ariaLabel': 'Приблизить карту',
          'controls.zoomOut.ariaLabel': 'Отдалить карту',
          'controls.fitView.ariaLabel': 'Показать всю карту',
          'minimap.ariaLabel': 'Мини-карта роадмапа',
        }}
        nodeTypes={editorNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={onPaneClick}
        nodesDraggable={layoutReady}
        nodesConnectable
        elementsSelectable
        deleteKeyCode={['Backspace', 'Delete']}
        connectionLineType={ConnectionLineType.SmoothStep}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { strokeWidth: 2.5 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap pannable zoomable position="bottom-left" />
      </ReactFlow>
      {!layoutReady && <p role="status" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: '#e0e0e0' }}>Выравниваем карту…</p>}
    </div>
  )
}
