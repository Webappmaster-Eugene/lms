import { sequenceRoadmapNodes, sequentialRoadmapEdges, type RoadmapSequenceNode } from '@/lib/roadmap-sequence'

type StoredNode = RoadmapSequenceNode & { id: number }
type StoredEdge = { id: number; edgeId: string; source: number | { id: number }; target: number | { id: number } }

function id(ref: number | { id: number }) { return typeof ref === 'number' ? ref : ref.id }

/** Retain matching edges first, reuse obsolete IDs, delete only surplus links. */
export function planRoadmapSequence(nodes: readonly StoredNode[], edges: readonly StoredEdge[], roadmapId: number, slug = '') {
  const sequence = sequenceRoadmapNodes(nodes, slug)
  const ids = new Map(sequence.map((node) => [node.nodeId, node.id]))
  const desired = sequentialRoadmapEdges(sequence).map((edge) => ({
    source: ids.get(edge.source), target: ids.get(edge.target),
  })).map((edge) => {
    if (edge.source === undefined || edge.target === undefined) throw new Error('Связь ссылается на отсутствующую тему')
    return { source: edge.source, target: edge.target }
  })
  const available = [...edges].sort((a, b) => a.id - b.id)
  const exact = desired.map((edge) => {
    const index = available.findIndex((candidate) => id(candidate.source) === edge.source && id(candidate.target) === edge.target)
    return index < 0 ? undefined : available.splice(index, 1)[0]
  })
  const edgeUpdates: { id: number; source: number; target: number }[] = []
  const edgeCreates: { edgeId: string; roadmap: number; source: number; target: number }[] = []
  desired.forEach((edge, index) => {
    if (exact[index]) return
    const reusable = available.shift()
    if (reusable) edgeUpdates.push({ id: reusable.id, ...edge })
    else edgeCreates.push({ edgeId: `sequence-rm-${roadmapId}-${edge.source}-${edge.target}`, roadmap: roadmapId, ...edge })
  })
  const originals = new Map(nodes.map((node) => [node.id, node]))
  const nodeUpdates = sequence.filter((node) => {
    const old = originals.get(node.id)
    return old?.order !== node.order || old?.positionX !== node.positionX || old?.positionY !== node.positionY
  }).map((node) => ({ id: node.id, order: node.order, positionX: node.positionX, positionY: node.positionY }))
  const edgeDeletes = available.map((edge) => edge.id)
  return {
    sequence: sequence.map((node) => ({ id: node.id, nodeId: node.nodeId, label: node.label })),
    nodeUpdates, edgeUpdates, edgeCreates, edgeDeletes,
    changed: nodeUpdates.length > 0 || edgeUpdates.length > 0 || edgeCreates.length > 0 || edgeDeletes.length > 0,
  }
}
