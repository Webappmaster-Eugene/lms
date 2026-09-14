import type { Node, Edge, BuiltInNode } from '@xyflow/react'
import type { NodeColor, NodeStage } from './stage-colors'

export type NodeStatus = 'locked' | 'available' | 'in-progress' | 'completed'

/** Курс, отнесённый к теме карты. */
export type NodeCourse = {
  slug: string
  title: string
  totalLessons: number
  completedLessons: number
}

export type RoadmapNodeData = {
  label: string
  nodeType: 'category' | 'topic' | 'subtopic'
  /** Курс, который открывается по клику по узлу. */
  courseSlug: string | null
  /** Все курсы темы — по одной теме их может быть несколько. */
  courses: NodeCourse[]
  icon: string | null
  description: string | null
  status: NodeStatus
  /** Тема есть на карте, но материалов по ней пока нет. */
  comingSoon: boolean
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
