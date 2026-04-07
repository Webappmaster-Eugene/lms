'use client'

import { useCallback, useRef, useState } from 'react'
import type { EditorNode, EditorEdge, PendingChanges, EditorNodeData, EditorEdgeData } from './types'

type SaveResult = { ok: true } | { ok: false; error: string }

/**
 * Хук batch-сохранения изменений редактора через Payload REST API.
 *
 * Порядок: создание узлов → обновление узлов → удаление узлов → создание рёбер → удаление рёбер.
 * Новые узлы сначала создаются, чтобы получить payloadId для рёбер.
 */
export function useEditorSave(roadmapId: number) {
  const [isSaving, setIsSaving] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const saveAll = useCallback(
    async (
      nodes: EditorNode[],
      edges: EditorEdge[],
      pending: PendingChanges,
      nodeIdToPayloadId: Map<string, number>,
    ): Promise<SaveResult> => {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsSaving(true)
      try {
        // 1. Create new nodes
        for (const nodeId of pending.createdNodeIds) {
          const node = nodes.find((n) => n.id === nodeId)
          if (!node) continue
          const data = node.data as EditorNodeData

          const body = {
            nodeId: data.nodeId,
            label: data.label,
            nodeType: data.nodeType,
            roadmap: roadmapId,
            course: data.courseId ?? undefined,
            positionX: Math.round(node.position.x),
            positionY: Math.round(node.position.y),
            description: data.description ?? undefined,
            icon: data.icon ?? undefined,
            stage: data.stage ?? undefined,
            color: data.color ?? undefined,
            bullets: data.bullets.map((text) => ({ text })),
            order: data.order,
          }

          const res = await fetch('/api/roadmap-nodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
            signal: controller.signal,
          })

          if (!res.ok) {
            const err = await res.text()
            return { ok: false, error: `Ошибка создания узла "${data.label}": ${err}` }
          }

          const created = (await res.json()) as { doc: { id: number } }
          nodeIdToPayloadId.set(nodeId, created.doc.id)
        }

        // 2. Update modified nodes
        for (const nodeId of pending.updatedNodeIds) {
          const payloadId = nodeIdToPayloadId.get(nodeId)
          if (payloadId == null) continue

          const node = nodes.find((n) => n.id === nodeId)
          if (!node) continue
          const data = node.data as EditorNodeData

          const body = {
            label: data.label,
            nodeType: data.nodeType,
            course: data.courseId ?? null,
            positionX: Math.round(node.position.x),
            positionY: Math.round(node.position.y),
            description: data.description ?? null,
            icon: data.icon ?? null,
            stage: data.stage ?? null,
            color: data.color ?? null,
            bullets: data.bullets.map((text) => ({ text })),
            order: data.order,
          }

          const res = await fetch(`/api/roadmap-nodes/${payloadId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
            signal: controller.signal,
          })

          if (!res.ok) {
            const err = await res.text()
            return { ok: false, error: `Ошибка обновления узла "${data.label}": ${err}` }
          }
        }

        // 3. Delete removed nodes
        for (const [, payloadId] of pending.deletedNodes) {
          const res = await fetch(`/api/roadmap-nodes/${payloadId}`, {
            method: 'DELETE',
            credentials: 'include',
            signal: controller.signal,
          })

          if (!res.ok) {
            const err = await res.text()
            return { ok: false, error: `Ошибка удаления узла: ${err}` }
          }
        }

        // 4. Create new edges
        for (const edgeId of pending.createdEdgeIds) {
          const edge = edges.find((e) => e.id === edgeId)
          if (!edge) continue

          const sourcePayloadId = nodeIdToPayloadId.get(edge.source)
          const targetPayloadId = nodeIdToPayloadId.get(edge.target)
          if (sourcePayloadId == null || targetPayloadId == null) continue

          const edgeData = edge.data as EditorEdgeData | undefined

          const body = {
            edgeId: edge.id,
            roadmap: roadmapId,
            source: sourcePayloadId,
            target: targetPayloadId,
            edgeType: edgeData?.edgeType ?? 'smoothstep',
            animated: edgeData?.animated ?? false,
          }

          const res = await fetch('/api/roadmap-edges', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
            signal: controller.signal,
          })

          if (!res.ok) {
            const err = await res.text()
            return { ok: false, error: `Ошибка создания ребра: ${err}` }
          }

          const created = (await res.json()) as { doc: { id: number } }
          // Store edge payloadId in the edge data for future reference
          if (edge.data) {
            ;(edge.data as EditorEdgeData).payloadId = created.doc.id
          }
        }

        // 5. Delete removed edges
        for (const [, payloadId] of pending.deletedEdges) {
          const res = await fetch(`/api/roadmap-edges/${payloadId}`, {
            method: 'DELETE',
            credentials: 'include',
            signal: controller.signal,
          })

          if (!res.ok) {
            const err = await res.text()
            return { ok: false, error: `Ошибка удаления ребра: ${err}` }
          }
        }

        return { ok: true }
      } catch (err) {
        if (controller.signal.aborted) {
          return { ok: false, error: 'Сохранение отменено' }
        }
        return { ok: false, error: String(err) }
      } finally {
        setIsSaving(false)
        abortRef.current = null
      }
    },
    [roadmapId],
  )

  return { isSaving, saveAll }
}
