import type { Node, Edge, BuiltInNode } from '@xyflow/react'
import type { NodeColor, NodeStage } from './stage-colors'

export type NodeStatus = 'locked' | 'available' | 'in-progress' | 'completed'

export type RoadmapNodeData = {
  label: string
  nodeType: 'category' | 'topic' | 'subtopic'
  courseSlug: string | null
  icon: string | null
  description: string | null
  status: NodeStatus
  progressPercent: number
  totalLessons: number
  completedLessons: number
  stage: NodeStage | null
  color: NodeColor | null
  bullets: string[]
}

export type AnnotationNodeData = {
  annotationType: 'leftLabel' | 'rightLabel' | 'levelBadge'
  text: string
}

export type GraphNode = Node<RoadmapNodeData, 'category' | 'topic' | 'subtopic'>
export type AnnotationGraphNode = Node<AnnotationNodeData, 'annotation'>

export type GraphEdge = Edge

/** Объединённый тип узлов для ReactFlow (roadmap + annotations). */
export type AnyRoadmapNode = GraphNode | AnnotationGraphNode | BuiltInNode

export type RoadmapGraphProps = {
  nodes: AnyRoadmapNode[]
  edges: GraphEdge[]
}
