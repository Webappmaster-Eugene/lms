import type { Node, Edge } from '@xyflow/react'
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

export type GraphNode = Node<RoadmapNodeData, 'category' | 'topic' | 'subtopic'>

export type GraphEdge = Edge

export type RoadmapGraphProps = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
