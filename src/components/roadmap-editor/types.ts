import type { Node, Edge } from '@xyflow/react'
import type { NodeColor, NodeStage } from '@/components/roadmap/stage-colors'

/** Данные узла в редакторе роадмапа. */
export type EditorNodeData = {
  label: string
  nodeType: 'category' | 'topic' | 'subtopic'
  icon: string | null
  description: string | null
  stage: NodeStage | null
  color: NodeColor | null
  bullets: string[]
  courseId: number | null
  courseName: string | null
  order: number
  payloadId: number | null
  nodeId: string
}

export type EditorNode = Node<EditorNodeData, 'category' | 'topic' | 'subtopic'>
export type EditorEdge = Edge & { data?: EditorEdgeData }

export type EditorEdgeData = {
  payloadId: number | null
  edgeType: 'smoothstep' | 'default' | 'straight'
  animated: boolean
}

/** Tracking pending changes for batch save. */
export type PendingChanges = {
  createdNodeIds: Set<string>
  updatedNodeIds: Set<string>
  deletedNodes: Map<string, number>      // nodeId → payloadId
  createdEdgeIds: Set<string>
  deletedEdges: Map<string, number>      // edgeId → payloadId
}

export type RoadmapInfo = {
  id: number
  title: string
  slug: string
}

export function createEmptyPendingChanges(): PendingChanges {
  return {
    createdNodeIds: new Set(),
    updatedNodeIds: new Set(),
    deletedNodes: new Map(),
    createdEdgeIds: new Set(),
    deletedEdges: new Map(),
  }
}
