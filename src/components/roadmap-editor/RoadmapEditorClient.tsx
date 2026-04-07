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
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Загрузка роадмапа...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden">
      {/* Error banner */}
      {editor.error && (
        <div className="flex-shrink-0 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {editor.error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex-shrink-0">
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
