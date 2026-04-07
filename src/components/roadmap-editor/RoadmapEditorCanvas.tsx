'use client'

import { useCallback } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  ConnectionLineType,
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
}

export function RoadmapEditorCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onPaneClick,
}: Props) {
  const handleNodeClick: NodeMouseHandler<EditorNode> = useCallback(
    (_event, node) => {
      onNodeClick(node.id)
    },
    [onNodeClick],
  )

  return (
    <div className="roadmap-editor" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: '12px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={editorNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={onPaneClick}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        deleteKeyCode={['Backspace', 'Delete']}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
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
    </div>
  )
}
