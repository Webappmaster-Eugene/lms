/** One curriculum order shared by the map, mobile list and next-step recommendation. */
export type RoadmapSequenceNode = {
  id?: string | number
  nodeId: string
  label: string
  nodeType: 'category' | 'topic' | 'subtopic'
  order?: number | null
  stage?: string | null
  positionX: number
  positionY: number
}

function finite(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** CMS order is authoritative; coordinates resolve older maps with empty order fields. */
export function orderRoadmapNodes<T extends RoadmapSequenceNode>(nodes: readonly T[], roadmapSlug = ''): T[] {
  const ordered = [...nodes].sort((a, b) => finite(a.order) - finite(b.order)
    || finite(a.positionY) - finite(b.positionY)
    || finite(a.positionX) - finite(b.positionX)
    || a.nodeId.localeCompare(b.nodeId))

  // Older DevOps maps link these final topics directly from the start node.
  if (/devops/i.test(roadmapSlug)) {
    const kubernetes = ordered.find((node) => /kubernetes|\bk8s\b/i.test(node.label))
    if (kubernetes) {
      const beforeKubernetes = ordered.slice(0, ordered.indexOf(kubernetes))
      const finalTopics = beforeKubernetes.filter((node) => node.nodeType !== 'category'
        && /observability|наблюдаемост|(?:deploy|деплой|разв[её]ртывание).*full[\s-]?stack|full[\s-]?stack.*(?:deploy|деплой|разв[её]ртывание)/i.test(node.label))
      if (finalTopics.length) {
        const moved = new Set(finalTopics)
        const remaining = ordered.filter((node) => !moved.has(node))
        remaining.splice(remaining.indexOf(kubernetes) + 1, 0, ...finalTopics)
        return remaining
      }
    }
  }
  return ordered
}

/** Four steps per row; every new row starts on the left, never as a parallel track. */
export function sequenceRoadmapNodes<T extends RoadmapSequenceNode>(nodes: readonly T[], roadmapSlug = ''): T[] {
  let row = -1
  let column = 0
  let previous: T | undefined
  return orderRoadmapNodes(nodes, roadmapSlug).map((node, order) => {
    if (!previous || node.nodeType === 'category' || previous.nodeType === 'category'
      || node.stage !== previous.stage || column === 4) {
      row += 1
      column = 0
    }
    const result = { ...node, order, positionX: column * 344, positionY: row * 400 }
    column += 1
    previous = node
    return result
  })
}

export function sequentialRoadmapEdges(nodes: readonly { nodeId: string }[]) {
  return nodes.slice(1).map((node, index) => ({
    edgeId: `sequence:${JSON.stringify([nodes[index].nodeId, node.nodeId])}`,
    source: nodes[index].nodeId,
    target: node.nodeId,
  }))
}
