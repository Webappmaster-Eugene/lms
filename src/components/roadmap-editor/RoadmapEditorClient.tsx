'use client'

import { useCallback, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { Loader2 } from 'lucide-react'

import { useRoadmapEditor } from './use-roadmap-editor'
import { RoadmapEditorCanvas } from './RoadmapEditorCanvas'
import { EditorToolbar } from './EditorToolbar'
import { NodeSidePanel } from './NodeSidePanel'
import { RoadmapSelector } from './RoadmapSelector'

type Props = {
  roadmapId: number | null
}

export function RoadmapEditorClient({ roadmapId }: Props) {
  if (roadmapId == null) {
    return <RoadmapSelector />
  }

  return (
    <ReactFlowProvider>
      <RoadmapEditorInner roadmapId={roadmapId} />
    </ReactFlowProvider>
  )
}

function RoadmapEditorInner({ roadmapId }: { roadmapId: number }) {
  const editor = useRoadmapEditor(roadmapId)

  // Prevent accidental navigation with unsaved changes
  useEffect(() => {
    if (!editor.isDirty) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [editor.isDirty])

  const { addNode } = editor

  const handleAddNode = useCallback(
    (type: 'category' | 'topic' | 'subtopic') => {
      const x = 400 + Math.random() * 200
      const y = 300 + Math.random() * 200
      addNode(type, { x, y })
    },
    [addNode],
  )

  const selectedNode = editor.selectedNodeId
    ? editor.nodes.find((n) => n.id === editor.selectedNodeId) ?? null
    : null

  if (editor.isLoading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#888' }}>
          <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Загрузка роадмапа...</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flex: '1 1 0%', minHeight: 0, flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
      {/* Error banner */}
      {editor.error && (
        <div style={{ flexShrink: 0, borderRadius: 8, border: '1px solid #7f1d1d', background: '#1c0a0a', padding: '10px 16px', fontSize: 13, color: '#fca5a5' }}>
          {editor.error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ flexShrink: 0 }}>
        <EditorToolbar
          roadmapInfo={editor.roadmapInfo}
          isDirty={editor.isDirty}
          isSaving={editor.isSaving}
          hasSelection={editor.selectedNodeId != null}
          onAddNode={handleAddNode}
          onDeleteSelected={editor.deleteSelected}
          onSave={editor.saveAll}
        />
      </div>

      {/* Canvas + Side Panel — inline styles because Tailwind classes don't apply in Payload admin context */}
      <div style={{ display: 'flex', height: 'calc(100vh - 160px)', overflow: 'hidden', borderRadius: '12px' }}>
        <div style={{ flex: '1 1 0%', minWidth: 0, height: '100%' }}>
          <RoadmapEditorCanvas
            nodes={editor.nodes}
            edges={editor.edges}
            onNodesChange={editor.onNodesChange}
            onEdgesChange={editor.onEdgesChange}
            onConnect={editor.onConnect}
            onNodeClick={editor.selectNode}
            onPaneClick={editor.deselectNode}
          />
        </div>

        {selectedNode && (
          <NodeSidePanel
            node={selectedNode}
            roadmapId={roadmapId}
            onUpdate={editor.updateNodeData}
            onDelete={editor.deleteSelected}
            onClose={editor.deselectNode}
          />
        )}
      </div>
    </div>
  )
}
