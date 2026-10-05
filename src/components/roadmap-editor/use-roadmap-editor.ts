'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useNodesState,
  useEdgesState,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeChange,
  type EdgeChange,
  addEdge,
} from '@xyflow/react'
import type {
  EditorNode,
  EditorEdge,
  EditorNodeData,
  EditorEdgeData,
  PendingChanges,
  RoadmapInfo,
} from './types'
import { createEmptyPendingChanges } from './types'
import { useEditorSave } from './use-editor-save'
import { layoutRoadmap, type RoadmapPoint } from '@/lib/roadmap-layout'
import type { RoadmapNode as PayloadRoadmapNode, RoadmapEdge as PayloadRoadmapEdge } from '@/payload-types'

type EditorState = {
  isLoading: boolean
  error: string | null
  roadmapInfo: RoadmapInfo | null
  nodes: EditorNode[]
  edges: EditorEdge[]
  selectedNodeId: string | null
  isDirty: boolean
  isSaving: boolean
  layoutReady: boolean
  layoutRevision: number
  layoutRoutes: Record<string, RoadmapPoint[]>
  canAlign: boolean
  canUndoAlignment: boolean
  alignNodes: () => void
  undoAlignment: () => void

  onNodesChange: OnNodesChange<EditorNode>
  onEdgesChange: OnEdgesChange<EditorEdge>
  onConnect: OnConnect
  selectNode: (nodeId: string) => void
  deselectNode: () => void
  addNode: (nodeType: 'category' | 'topic' | 'subtopic', position: { x: number; y: number }) => void
  updateNodeData: (nodeId: string, data: Partial<EditorNodeData>) => void
  deleteSelected: () => void
  saveAll: () => Promise<void>
  setNodes: React.Dispatch<React.SetStateAction<EditorNode[]>>
  setEdges: React.Dispatch<React.SetStateAction<EditorEdge[]>>
}

type AlignmentSnapshot = {
  positions: Map<string, RoadmapPoint>
  pending: PendingChanges
  positionChanges: Set<string>
  routes: Record<string, RoadmapPoint[]>
  dimensions: string
  isDirty: boolean
}

function clonePending(pending: PendingChanges): PendingChanges {
  return {
    createdNodeIds: new Set(pending.createdNodeIds),
    updatedNodeIds: new Set(pending.updatedNodeIds),
    deletedNodes: new Map(pending.deletedNodes),
    createdEdgeIds: new Set(pending.createdEdgeIds),
    deletedEdges: new Map(pending.deletedEdges),
  }
}

function hasMeasurements(nodes: EditorNode[]) {
  return nodes.every((node) => Number.isFinite(node.measured?.width) && Number.isFinite(node.measured?.height)
    && (node.measured?.width ?? 0) > 0 && (node.measured?.height ?? 0) > 0)
}

function editorLayout(nodes: EditorNode[], edges: EditorEdge[]) {
  const result = layoutRoadmap(nodes.map((node) => ({
    ...node,
    type: node.type ?? node.data.nodeType,
    width: node.measured?.width ?? 240,
    height: node.measured?.height ?? 120,
    stage: node.data.stage,
  })), edges)
  const positions = new Map(result.nodes.map((node) => [node.id, node.position]))
  return {
    // Browser measurements stay on measured; fixing wrapper dimensions breaks resizing.
    nodes: nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })),
    routes: result.routes,
  }
}

function resolveRelationId(ref: unknown): number | null {
  if (ref && typeof ref === 'object' && 'id' in ref) return (ref as { id: number }).id
  if (typeof ref === 'number') return ref
  return null
}

function transformNodes(raw: PayloadRoadmapNode[]): {
  nodes: EditorNode[]
  nodeIdToPayloadId: Map<string, number>
} {
  const nodeIdToPayloadId = new Map<string, number>()
  const nodes: EditorNode[] = raw.map((n) => {
    nodeIdToPayloadId.set(n.nodeId, n.id)

    const courseRef = n.course
    const courseId = resolveRelationId(courseRef)
    const courseName =
      courseRef && typeof courseRef === 'object' && 'title' in courseRef
        ? (courseRef as { title: string }).title
        : null

    const bullets = Array.isArray(n.bullets)
      ? n.bullets.map((b) => b.text).filter((t): t is string => typeof t === 'string' && t.length > 0)
      : []

    return {
      id: n.nodeId,
      type: n.nodeType,
      position: { x: n.positionX, y: n.positionY },
      data: {
        label: n.label,
        nodeType: n.nodeType,
        icon: n.icon ?? null,
        description: n.description ?? null,
        stage: n.stage ?? null,
        color: n.color ?? null,
        bullets,
        courseId,
        courseName,
        order: n.order ?? 0,
        payloadId: n.id,
        nodeId: n.nodeId,
      },
    }
  })

  return { nodes, nodeIdToPayloadId }
}

function transformEdges(raw: PayloadRoadmapEdge[]): EditorEdge[] {
  const result: EditorEdge[] = []

  for (const e of raw) {
    const sourceNode = e.source
    const targetNode = e.target
    const sourceNodeId =
      sourceNode && typeof sourceNode === 'object' && 'nodeId' in sourceNode
        ? sourceNode.nodeId
        : null
    const targetNodeId =
      targetNode && typeof targetNode === 'object' && 'nodeId' in targetNode
        ? targetNode.nodeId
        : null

    if (!sourceNodeId || !targetNodeId) continue

    result.push({
      id: e.edgeId,
      source: sourceNodeId,
      target: targetNodeId,
      type: (e.edgeType ?? 'smoothstep') as string,
      animated: e.animated === true,
      data: {
        payloadId: e.id,
        edgeType: e.edgeType ?? 'smoothstep',
        animated: e.animated === true,
      },
    })
  }

  return result
}

export function useRoadmapEditor(roadmapId: number): EditorState {
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<EditorNode>([])
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<EditorEdge>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roadmapInfo, setRoadmapInfo] = useState<RoadmapInfo | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [layoutReady, setLayoutReady] = useState(false)
  const [layoutRevision, setLayoutRevision] = useState(0)
  const [layoutRoutes, setLayoutRoutes] = useState<Record<string, RoadmapPoint[]>>({})
  const [canUndoAlignment, setCanUndoAlignment] = useState(false)

  const pendingRef = useRef<PendingChanges>(createEmptyPendingChanges())
  const nodeIdMapRef = useRef<Map<string, number>>(new Map())
  const initialLayoutPendingRef = useRef(false)
  const storedPositionsRef = useRef(new Map<string, RoadmapPoint>())
  const positionChangesRef = useRef(new Set<string>())
  const alignmentSnapshotRef = useRef<AlignmentSnapshot | null>(null)
  const dimensions = JSON.stringify(nodes.map((node) => [node.id, node.measured?.width, node.measured?.height]))
  const routedDimensionsRef = useRef('')

  const { isSaving, saveAll: saveBatch } = useEditorSave(roadmapId)

  // ── Load data ──
  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      setLayoutReady(false)
      initialLayoutPendingRef.current = false
      setNodes([])
      setEdges([])
      setRoadmapInfo(null)
      setSelectedNodeId(null)
      setIsDirty(false)
      setCanUndoAlignment(false)
      setLayoutRoutes({})
      pendingRef.current = createEmptyPendingChanges()
      nodeIdMapRef.current = new Map()
      storedPositionsRef.current = new Map()
      positionChangesRef.current = new Set()
      alignmentSnapshotRef.current = null
      routedDimensionsRef.current = ''

      try {
        const [roadmapRes, nodesRes, edgesRes] = await Promise.all([
          fetch(`/api/roadmaps/${roadmapId}?depth=0`, { credentials: 'include' }),
          fetch(
            `/api/roadmap-nodes?where[roadmap][equals]=${roadmapId}&limit=500&depth=1&sort=order`,
            { credentials: 'include' },
          ),
          fetch(
            `/api/roadmap-edges?where[roadmap][equals]=${roadmapId}&limit=500&depth=1`,
            { credentials: 'include' },
          ),
        ])

        if (cancelled) return

        if (!roadmapRes.ok) throw new Error('Роадмап не найден')
        if (!nodesRes.ok) throw new Error('Ошибка загрузки узлов')
        if (!edgesRes.ok) throw new Error('Ошибка загрузки рёбер')

        const roadmapData = (await roadmapRes.json()) as { id: number; title: string; slug: string }
        const nodesData = (await nodesRes.json()) as { docs: PayloadRoadmapNode[] }
        const edgesData = (await edgesRes.json()) as { docs: PayloadRoadmapEdge[] }

        if (cancelled) return

        setRoadmapInfo({ id: roadmapData.id, title: roadmapData.title, slug: roadmapData.slug })

        const { nodes: transformedNodes, nodeIdToPayloadId } = transformNodes(nodesData.docs)
        const transformedEdges = transformEdges(edgesData.docs)

        nodeIdMapRef.current = nodeIdToPayloadId
        storedPositionsRef.current = new Map(transformedNodes.map((node) => [node.id, node.position]))
        positionChangesRef.current = new Set()
        initialLayoutPendingRef.current = true
        alignmentSnapshotRef.current = null
        routedDimensionsRef.current = ''
        setCanUndoAlignment(false)
        setLayoutRoutes({})
        setNodes(transformedNodes)
        setEdges(transformedEdges)
        pendingRef.current = createEmptyPendingChanges()
        setIsDirty(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLayoutReady(true)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [roadmapId, setNodes, setEdges])

  useEffect(() => {
    if (isLoading) return
    if (initialLayoutPendingRef.current && hasMeasurements(nodes)) {
      initialLayoutPendingRef.current = false
      const layout = editorLayout(nodes, edges)
      routedDimensionsRef.current = dimensions
      setNodes(layout.nodes)
      setLayoutRoutes(layout.routes)
      setLayoutReady(true)
      setLayoutRevision((revision) => revision + 1)
    } else if (!initialLayoutPendingRef.current && routedDimensionsRef.current !== dimensions) {
      // A resized card invalidates routes, but must never reset a manual position.
      routedDimensionsRef.current = dimensions
      setLayoutRoutes({})
    }
  }, [isLoading, nodes, edges, dimensions, setNodes])

  const invalidateAlignment = useCallback(() => {
    initialLayoutPendingRef.current = false
    alignmentSnapshotRef.current = null
    setCanUndoAlignment(false)
    setLayoutRoutes({})
    setLayoutReady(true)
  }, [])

  const alignNodes = useCallback(() => {
    if (isSaving || !nodes.length || !hasMeasurements(nodes)) return
    const layout = editorLayout(nodes, edges)
    alignmentSnapshotRef.current = {
      positions: new Map(nodes.map((node) => [node.id, node.position])),
      pending: clonePending(pendingRef.current),
      positionChanges: new Set(positionChangesRef.current),
      routes: layoutRoutes,
      dimensions,
      isDirty,
    }
    let changed = false
    for (const node of layout.nodes) {
      const stored = storedPositionsRef.current.get(node.id)
      if (!stored || Math.round(stored.x) !== Math.round(node.position.x) || Math.round(stored.y) !== Math.round(node.position.y)) {
        positionChangesRef.current.add(node.id)
        if (!pendingRef.current.createdNodeIds.has(node.id)) pendingRef.current.updatedNodeIds.add(node.id)
        changed = true
      }
    }
    initialLayoutPendingRef.current = false
    routedDimensionsRef.current = dimensions
    setNodes(layout.nodes)
    setLayoutRoutes(layout.routes)
    setCanUndoAlignment(true)
    setLayoutReady(true)
    setLayoutRevision((revision) => revision + 1)
    if (changed) setIsDirty(true)
  }, [nodes, edges, isSaving, isDirty, layoutRoutes, dimensions, setNodes])

  const undoAlignment = useCallback(() => {
    const snapshot = alignmentSnapshotRef.current
    if (!snapshot || isSaving) return
    setNodes((current) => current.map((node) => ({ ...node, position: snapshot.positions.get(node.id) ?? node.position })))
    pendingRef.current = clonePending(snapshot.pending)
    positionChangesRef.current = new Set(snapshot.positionChanges)
    setLayoutRoutes(snapshot.dimensions === dimensions ? snapshot.routes : {})
    setIsDirty(snapshot.isDirty)
    setCanUndoAlignment(false)
    alignmentSnapshotRef.current = null
  }, [isSaving, setNodes, dimensions])

  // ── Node changes (position drag, remove) ──
  const onNodesChange: OnNodesChange<EditorNode> = useCallback(
    (changes: NodeChange<EditorNode>[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          invalidateAlignment()
          const nodeId = change.id
          positionChangesRef.current.add(nodeId)
          if (!pendingRef.current.createdNodeIds.has(nodeId)) {
            pendingRef.current.updatedNodeIds.add(nodeId)
          }
          setIsDirty(true)
        }

        if (change.type === 'remove') {
          invalidateAlignment()
          const nodeId = change.id
          const payloadId = nodeIdMapRef.current.get(nodeId)

          if (pendingRef.current.createdNodeIds.has(nodeId)) {
            pendingRef.current.createdNodeIds.delete(nodeId)
          } else if (payloadId != null) {
            pendingRef.current.deletedNodes.set(nodeId, payloadId)
            pendingRef.current.updatedNodeIds.delete(nodeId)
          }

          // Cascade: mark edges connected to this node for deletion
          setEdges((currentEdges) => {
            const toRemove = currentEdges.filter(
              (e) => e.source === nodeId || e.target === nodeId,
            )
            for (const edge of toRemove) {
              const edgePayloadId = (edge.data as EditorEdgeData | undefined)?.payloadId
              if (pendingRef.current.createdEdgeIds.has(edge.id)) {
                pendingRef.current.createdEdgeIds.delete(edge.id)
              } else if (edgePayloadId != null) {
                pendingRef.current.deletedEdges.set(edge.id, edgePayloadId)
              }
            }
            return currentEdges.filter(
              (e) => e.source !== nodeId && e.target !== nodeId,
            )
          })

          if (selectedNodeId === nodeId) setSelectedNodeId(null)
          setIsDirty(true)
        }
      }

      onNodesChangeBase(changes)
    },
    [onNodesChangeBase, selectedNodeId, setEdges, invalidateAlignment],
  )

  // ── Edge changes (remove) ──
  const onEdgesChange: OnEdgesChange<EditorEdge> = useCallback(
    (changes: EdgeChange<EditorEdge>[]) => {
      for (const change of changes) {
        if (change.type === 'remove') {
          invalidateAlignment()
          const edgeId = change.id

          if (pendingRef.current.createdEdgeIds.has(edgeId)) {
            pendingRef.current.createdEdgeIds.delete(edgeId)
          } else {
            // Find the edge to get its payloadId before it's removed
            setEdges((currentEdges) => {
              const edge = currentEdges.find((e) => e.id === edgeId)
              const payloadId = (edge?.data as EditorEdgeData | undefined)?.payloadId
              if (payloadId != null) {
                pendingRef.current.deletedEdges.set(edgeId, payloadId)
              }
              return currentEdges
            })
          }
          setIsDirty(true)
        }
      }

      onEdgesChangeBase(changes)
    },
    [onEdgesChangeBase, setEdges, invalidateAlignment],
  )

  // ── Connect (new edge) ──
  const onConnect: OnConnect = useCallback(
    (connection) => {
      const edgeId = `edge-${connection.source}-${connection.target}`

      // Check for duplicate
      setEdges((currentEdges) => {
        const exists = currentEdges.some(
          (e) => e.source === connection.source && e.target === connection.target,
        )
        if (exists) return currentEdges

        invalidateAlignment()

        const newEdge: EditorEdge = {
          id: edgeId,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
          type: 'smoothstep',
          animated: false,
          data: {
            payloadId: null,
            edgeType: 'smoothstep',
            animated: false,
          } satisfies EditorEdgeData,
        }

        pendingRef.current.createdEdgeIds.add(edgeId)
        setIsDirty(true)
        return addEdge(newEdge, currentEdges)
      })
    },
    [setEdges, invalidateAlignment],
  )

  // ── Add node ──
  const addNode = useCallback(
    (nodeType: 'category' | 'topic' | 'subtopic', position: { x: number; y: number }) => {
      invalidateAlignment()
      const id = `${nodeType}-${crypto.randomUUID().slice(0, 8)}`

      const newNode: EditorNode = {
        id,
        type: nodeType,
        position,
        data: {
          label: nodeType === 'category' ? 'Новая категория' : nodeType === 'topic' ? 'Новая тема' : 'Новая подтема',
          nodeType,
          icon: null,
          description: null,
          stage: null,
          color: null,
          bullets: [],
          courseId: null,
          courseName: null,
          order: 0,
          payloadId: null,
          nodeId: id,
        },
      }

      setNodes((prev) => [...prev, newNode])
      pendingRef.current.createdNodeIds.add(id)
      setIsDirty(true)
      setSelectedNodeId(id)
    },
    [setNodes, invalidateAlignment],
  )

  // ── Update node data (from side panel) ──
  const updateNodeData = useCallback(
    (nodeId: string, partial: Partial<EditorNodeData>) => {
      invalidateAlignment()
      setNodes((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node

          const updatedData = { ...node.data, ...partial }

          // If nodeType changed, also update the React Flow `type`
          const type = partial.nodeType ?? node.type

          return { ...node, type, data: updatedData as EditorNodeData }
        }),
      )

      if (!pendingRef.current.createdNodeIds.has(nodeId)) {
        pendingRef.current.updatedNodeIds.add(nodeId)
      }
      setIsDirty(true)
    },
    [setNodes, invalidateAlignment],
  )

  // ── Delete selected ──
  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return
    invalidateAlignment()

    const payloadId = nodeIdMapRef.current.get(selectedNodeId)

    if (pendingRef.current.createdNodeIds.has(selectedNodeId)) {
      pendingRef.current.createdNodeIds.delete(selectedNodeId)
    } else if (payloadId != null) {
      pendingRef.current.deletedNodes.set(selectedNodeId, payloadId)
      pendingRef.current.updatedNodeIds.delete(selectedNodeId)
    }

    // Remove connected edges
    setEdges((currentEdges) => {
      const toRemove = currentEdges.filter(
        (e) => e.source === selectedNodeId || e.target === selectedNodeId,
      )
      for (const edge of toRemove) {
        const edgePayloadId = (edge.data as EditorEdgeData | undefined)?.payloadId
        if (pendingRef.current.createdEdgeIds.has(edge.id)) {
          pendingRef.current.createdEdgeIds.delete(edge.id)
        } else if (edgePayloadId != null) {
          pendingRef.current.deletedEdges.set(edge.id, edgePayloadId)
        }
      }
      return currentEdges.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      )
    })

    setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId))
    setSelectedNodeId(null)
    setIsDirty(true)
  }, [selectedNodeId, setNodes, setEdges, invalidateAlignment])

  // ── Select / deselect ──
  const selectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
  }, [])

  const deselectNode = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  // ── Save ──
  const saveAll = useCallback(async () => {
    // Editing text must not implicitly publish the display-only initial layout.
    const saveNodes = nodes.map((node) => ({ ...node,
      position: positionChangesRef.current.has(node.id)
        ? node.position : storedPositionsRef.current.get(node.id) ?? node.position,
    }))
    const result = await saveBatch(saveNodes, edges, pendingRef.current, nodeIdMapRef.current)

    if (result.ok) {
      // Clear pending after successful save
      pendingRef.current = createEmptyPendingChanges()
      storedPositionsRef.current = new Map(saveNodes.map((node) => [node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) }]))
      positionChangesRef.current = new Set()
      alignmentSnapshotRef.current = null
      setCanUndoAlignment(false)
      setIsDirty(false)

      // Update payloadIds for newly created nodes
      setNodes((prev) =>
        prev.map((node) => {
          const payloadId = nodeIdMapRef.current.get(node.id)
          if (payloadId != null && node.data.payloadId == null) {
            return { ...node, data: { ...node.data, payloadId } }
          }
          return node
        }),
      )
    } else {
      setError(result.error)
      // Clear error after 5 seconds
      setTimeout(() => setError(null), 5000)
    }
  }, [nodes, edges, saveBatch, setNodes])

  return {
    isLoading,
    error,
    roadmapInfo,
    nodes,
    edges,
    selectedNodeId,
    isDirty,
    isSaving,
    layoutReady,
    layoutRevision,
    layoutRoutes,
    canAlign: !isLoading && !isSaving && nodes.length > 0 && hasMeasurements(nodes),
    canUndoAlignment,
    alignNodes,
    undoAlignment,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectNode,
    deselectNode,
    addNode,
    updateNodeData,
    deleteSelected,
    saveAll,
    setNodes,
    setEdges,
  }
}
