import { describe, expect, it } from 'vitest'
import { orderRoadmapNodes, sequenceRoadmapNodes, sequentialRoadmapEdges, type RoadmapSequenceNode } from '@/lib/roadmap-sequence'
import { planRoadmapSequence } from '@/lib/roadmap-sequence-plan'

function topic(id: number, label: string, order: number, stage = 'base') {
  return { id, nodeId: `node-${id}`, label, order, stage, nodeType: 'topic' as const, positionX: (id % 4) * 200, positionY: Math.floor(id / 4) * 200 }
}

describe('последовательный учебный маршрут', () => {
  it('React: HTML → CSS → JS → DOM, независимо от API и ошибочных вертикальных треков', () => {
    const nodes = [topic(1, 'HTML', 1), topic(2, 'CSS', 2), topic(3, 'JS', 3), topic(4, 'JS + DOM', 4), topic(5, 'React', 5, 'stage1')]
    const sequence = sequenceRoadmapNodes(nodes.slice().reverse(), 'frontend-react')
    expect(sequence.map((node) => node.label)).toEqual(['HTML', 'CSS', 'JS', 'JS + DOM', 'React'])
    expect(new Set(sequence.slice(0, 4).map((node) => node.positionY)).size).toBe(1)
    expect(sequence.slice(0, 4).map((node) => node.positionX)).toEqual([0, 344, 688, 1032])
    expect(sequence[4].positionX).toBe(0)
    expect(sequence[4].positionY).toBeGreaterThan(sequence[0].positionY)
    expect(sequentialRoadmapEdges(sequence).map((edge) => [edge.source, edge.target])).toEqual([
      ['node-1', 'node-2'], ['node-2', 'node-3'], ['node-3', 'node-4'], ['node-4', 'node-5'],
    ])
  })

  it('Backend: JS → TS и только затем Node.js, алгоритмы и NestJS', () => {
    const sequence = orderRoadmapNodes([topic(5, 'NestJS', 5), topic(4, 'Алгоритмы', 4), topic(3, 'Node.js', 3), topic(1, 'JS', 1), topic(2, 'TS', 2)], 'backend-nodejs')
    expect(sequence.map((node) => node.label)).toEqual(['JS', 'TS', 'Node.js', 'Алгоритмы', 'NestJS'])
  })

  it('переносит ранние observability и deploy fullstack после Kubernetes только в DevOps', () => {
    const nodes = [topic(1, 'Linux', 1), topic(2, 'Observability', 2), topic(3, 'Deploy Fullstack-приложений', 3), topic(4, 'Bash', 4), topic(5, 'Kubernetes', 5)]
    expect(orderRoadmapNodes(nodes, 'devops').map((node) => node.label)).toEqual(['Linux', 'Bash', 'Kubernetes', 'Observability', 'Deploy Fullstack-приложений'])
    expect(orderRoadmapNodes(nodes, 'backend-nodejs')).toEqual(nodes)
  })

  it('сохраняет линейный Go-маршрут и не меняет документы', () => {
    const nodes = [topic(1, 'Go', 1), topic(2, 'Типы', 2), topic(3, 'Конкурентность', 3), topic(4, 'HTTP', 4), topic(5, 'Практика', 5)]
    const original = structuredClone(nodes)
    expect(sequenceRoadmapNodes(nodes, 'backend-go').map((node) => node.id)).toEqual([1, 2, 3, 4, 5])
    expect(nodes).toEqual(original)
  })

  it('старые карты без order следуют геометрии слева направо и сверху вниз', () => {
    const nodes: RoadmapSequenceNode[] = [
      { ...topic(1, 'Первая', 0), positionX: 0, positionY: 0 },
      { ...topic(2, 'Вторая', 0), positionX: 300, positionY: 0 },
      { ...topic(3, 'Третья', 0), positionX: 0, positionY: 200 },
    ]
    expect(orderRoadmapNodes([...nodes].reverse()).map((node) => node.label)).toEqual(['Первая', 'Вторая', 'Третья'])
    expect(sequenceRoadmapNodes([])).toEqual([])
    expect(sequentialRoadmapEdges(nodes.slice(0, 1))).toEqual([])
  })

  it('связи остаются уникальными для произвольных CMS nodeId с разделителями', () => {
    const edges = sequentialRoadmapEdges([{ nodeId: 'a:b' }, { nodeId: 'c' }, { nodeId: 'a' }, { nodeId: 'b:c' }])
    expect(new Set(edges.map((edge) => edge.edgeId)).size).toBe(edges.length)
  })
})

describe('безопасный план нормализации данных', () => {
  it('сохраняет ID тем и подходящей связи, переиспользует старую связь и удаляет лишнюю', () => {
    const nodes = [topic(1, 'HTML', 1), topic(2, 'CSS', 2), topic(3, 'JS', 3)]
    const edges = [
      { id: 10, edgeId: 'keep', source: 1, target: 2 },
      { id: 11, edgeId: 'repurpose', source: 1, target: 3 },
      { id: 12, edgeId: 'surplus', source: 1, target: 3 },
    ]
    const original = structuredClone({ nodes, edges })
    const plan = planRoadmapSequence(nodes, edges, 7)
    expect(plan.sequence.map((node) => node.id)).toEqual([1, 2, 3])
    expect(plan.edgeUpdates).toEqual([{ id: 11, source: 2, target: 3 }])
    expect(plan.edgeDeletes).toEqual([12])
    expect(plan.edgeCreates).toEqual([])
    expect({ nodes, edges }).toEqual(original)
    const updatedNodes = nodes.map((node) => ({ ...node, ...plan.nodeUpdates.find((update) => update.id === node.id) }))
    const updatedEdges = edges.filter((edge) => !plan.edgeDeletes.includes(edge.id)).map((edge) => ({ ...edge, ...plan.edgeUpdates.find((update) => update.id === edge.id) }))
    expect(planRoadmapSequence(updatedNodes, updatedEdges, 7).changed).toBe(false)
  })

  it('создаёт только недостающие связи с уникальным roadmap-prefixed ID', () => {
    const plan = planRoadmapSequence([topic(1, 'JS', 1), topic(2, 'TS', 2)], [], 42)
    expect(plan.edgeCreates).toEqual([{ edgeId: 'sequence-rm-42-1-2', roadmap: 42, source: 1, target: 2 }])
  })
})
