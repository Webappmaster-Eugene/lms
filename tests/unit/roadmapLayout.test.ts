import { describe, expect, it } from 'vitest'
import { layoutRoadmap, ROADMAP_COLUMN_GAP, ROADMAP_ROW_GAP, type RoadmapLayoutNode, type RoadmapLayoutEdge, type RoadmapPoint } from '@/lib/roadmap-layout'

function node(id: string, x: number, y: number, width = 240, height = 180, stage: string | null = null): RoadmapLayoutNode {
  return { id, type: 'topic', position: { x, y }, width, height, stage }
}

function assertGeometry(nodes: RoadmapLayoutNode[], edges: RoadmapLayoutEdge[], routes: Record<string, RoadmapPoint[]>) {
  for (let index = 0; index < nodes.length; index++) {
    const a = nodes[index]
    for (const b of nodes.slice(index + 1)) {
      const separate = a.position.x + a.width <= b.position.x
        || b.position.x + b.width <= a.position.x
        || a.position.y + a.height <= b.position.y
        || b.position.y + b.height <= a.position.y
      expect(separate, `${a.id} overlaps ${b.id}`).toBe(true)
    }
  }
  for (const edge of edges) {
    const source = nodes.find((item) => item.id === edge.source)
    const target = nodes.find((item) => item.id === edge.target)
    if (!source || !target) {
      expect(routes[edge.id]).toBeUndefined()
      continue
    }
    const path = routes[edge.id]
    expect(path, edge.id).toBeDefined()
    expect(path[0]).toEqual({ x: source.position.x + source.width / 2, y: source.position.y + source.height })
    expect(path.at(-1)).toEqual({ x: target.position.x + target.width / 2, y: target.position.y })
    for (let index = 1; index < path.length; index++) {
      const start = path[index - 1]
      const end = path[index]
      expect(start.x === end.x || start.y === end.y, `${edge.id}: diagonal segment`).toBe(true)
      for (const card of nodes) {
        const left = card.position.x
        const right = left + card.width
        const top = card.position.y
        const bottom = top + card.height
        const crosses = start.x === end.x
          ? start.x > left && start.x < right && Math.max(start.y, end.y) > top && Math.min(start.y, end.y) < bottom
          : start.y > top && start.y < bottom && Math.max(start.x, end.x) > left && Math.min(start.x, end.x) < right
        expect(crosses, `${edge.id} passes through ${card.id}`).toBe(false)
      }
    }
  }
}

describe('roadmap display layout', () => {
  it('draws sequential siblings from right to left edges and starts the next row on the left', () => {
    const input = [node('a', 0, 0, 280, 180), node('b', 344, 0, 280, 280), node('c', 0, 400, 280, 150)]
    const edges = [{ id: 'ab', source: 'a', target: 'b' }, { id: 'bc', source: 'b', target: 'c' }]
    const result = layoutRoadmap(input, edges, { horizontalSteps: true })
    const [a, b, c] = result.nodes
    expect(a.position.x).toBe(0)
    expect(c.position.x).toBe(0)
    expect(result.routes.ab[0]).toEqual({ x: a.position.x + a.width, y: a.position.y + a.height / 2 })
    expect(result.routes.ab.at(-1)).toEqual({ x: b.position.x, y: b.position.y + b.height / 2 })
    expect(result.routes.bc.at(-1)).toEqual({ x: c.position.x + c.width / 2, y: c.position.y })
  })
  it('unpacks overlapping Backend cards using measured dimensions and keeps the curriculum rows', () => {
    const nodes = [
      { ...node('start', 640, 0, 300, 90, 'start'), type: 'category' },
      node('js', 440, 180, 288, 260, 'base'),
      node('ts', 640, 180, 288, 200, 'base'),
      node('git', 840, 180, 288, 320, 'base'),
      node('node', 1040, 180, 288, 280, 'base'),
      node('linux', 1240, 180, 288, 210, 'base'),
      node('algorithms', 120, 460, 288, 240, 'stage1'),
      node('nest', 640, 460, 288, 340, 'stage1'),
      node('architecture', 840, 467, 288, 310, 'stage1'),
      node('sql', 1040, 460, 288, 260, 'stage1'),
      node('nosql', 1480, 460, 288, 200, 'stage1'),
      node('docker', 440, 760, 288, 220, 'stage2'),
    ]
    const edges = nodes.slice(1).map((item) => ({ id: `start-${item.id}`, source: 'start', target: item.id }))
    edges.push({ id: 'node-nest', source: 'node', target: 'nest' }, { id: 'js-docker', source: 'js', target: 'docker' })
    const result = layoutRoadmap(nodes, edges)
    assertGeometry(result.nodes, edges, result.routes)
    const base = result.nodes.filter((item) => item.stage === 'base')
    expect(new Set(base.map((item) => item.position.y)).size).toBe(1)
    expect(base.map((item) => item.id)).toEqual(['js', 'ts', 'git', 'node', 'linux'])
    for (let index = 1; index < base.length; index++) {
      expect(base[index].position.x - base[index - 1].position.x - base[index - 1].width).toBe(ROADMAP_COLUMN_GAP)
    }
    const nextRow = result.nodes.filter((item) => item.stage === 'stage1')
    expect(new Set(nextRow.map((item) => item.position.y)).size).toBe(1)
    expect(nextRow[0].position.y - Math.max(...base.map((item) => item.position.y + item.height))).toBeGreaterThanOrEqual(ROADMAP_ROW_GAP)
    const heading = result.nodes[0]
    const left = Math.min(...base.map((item) => item.position.x))
    const right = Math.max(...base.map((item) => item.position.x + item.width))
    expect(heading.position.x + heading.width / 2).toBe((left + right) / 2)
  })

  it('routes long edges, backward dependencies, siblings, self loops and cycles outside all cards', () => {
    const nodes = [node('a', 0, 0, 300, 180), node('b', 250, 0, 120, 340),
      node('c', 0, 240, 380, 230), node('d', 290, 240, 230, 190), node('e', 0, 500, 260, 310)]
    const pairs = [['a', 'e'], ['e', 'a'], ['a', 'b'], ['d', 'c'], ['c', 'c'], ['a', 'c'], ['c', 'e'], ['e', 'b']]
    const edges = pairs.map(([source, target], index) => ({ id: `edge-${index}`, source, target }))
    const result = layoutRoadmap(nodes, edges)
    assertGeometry(result.nodes, edges, result.routes)
    expect(result.routes['edge-0'].length).toBeGreaterThanOrEqual(4)
  })

  it('allocates enough routing space for dense fans without letting their lanes hit another row', () => {
    const nodes = [node('top', 0, 0, 240, 100), ...Array.from({ length: 16 }, (_, index) =>
      node(`middle-${index}`, index * 150, 180, 160 + index * 5, 120 + index * 8)), node('bottom', 0, 360)]
    const edges = nodes.slice(1, -1).flatMap((item) => [
      { id: `in-${item.id}`, source: 'top', target: item.id },
      { id: `out-${item.id}`, source: item.id, target: 'bottom' },
    ])
    const result = layoutRoadmap(nodes, edges)
    assertGeometry(result.nodes, edges, result.routes)
    expect(new Set(edges.map((edge) => JSON.stringify(result.routes[edge.id]))).size).toBe(edges.length)
  })

  it('is deterministic regardless of API document order and does not mutate metadata or source coordinates', () => {
    const nodes = [node('b', 160, 180), node('a', 0, 180), node('c', 0, 380)].map((item) => ({ ...item, label: item.id }))
    const edges = [{ id: 'bc', source: 'b', target: 'c' }, { id: 'ac', source: 'a', target: 'c' }]
    const before = structuredClone({ nodes, edges })
    const first = layoutRoadmap(nodes, edges)
    const second = layoutRoadmap(nodes.slice().reverse(), edges.slice().reverse())
    expect(first.nodes.slice().sort((a, b) => a.id.localeCompare(b.id))).toEqual(second.nodes.slice().sort((a, b) => a.id.localeCompare(b.id)))
    expect(first.routes).toEqual(second.routes)
    expect({ nodes, edges }).toEqual(before)
    expect(first.nodes.map((item) => item.label)).toEqual(nodes.map((item) => item.label))
  })

  it('keeps distinct stages and category headings separate even if their stored coordinates coincide', () => {
    const nodes = [node('base', 0, 0, 200, 100, 'base'), node('practice', 300, 0, 200, 100, 'practice'),
      { ...node('heading', 0, 0, 280, 70), type: 'category' }, node('topic', 100, 0)]
    const result = layoutRoadmap(nodes, [])
    assertGeometry(result.nodes, [], result.routes)
    expect(new Set(result.nodes.map((item) => item.position.y)).size).toBe(4)
  })

  it('handles an empty map, an isolated node and stale orphan links', () => {
    expect(layoutRoadmap([], [{ id: 'orphan', source: 'a', target: 'b' }])).toEqual({ nodes: [], routes: {} })
    const result = layoutRoadmap([node('only', 500, 800)], [{ id: 'orphan', source: 'only', target: 'missing' }])
    expect(result.nodes[0].position).toEqual({ x: 0, y: 0 })
    expect(result.routes).toEqual({})
  })

  it('retains arbitrary CMS edge identifiers as own enumerable routes', () => {
    const edges = [{ id: '__proto__', source: 'a', target: 'b' }, { id: 'constructor', source: 'a', target: 'b' }]
    const result = layoutRoadmap([node('a', 0, 0), node('b', 0, 300)], edges)
    expect(Object.keys(result.routes).sort()).toEqual(['__proto__', 'constructor'])
    assertGeometry(result.nodes, edges, result.routes)
  })

  it('normalizes non-finite measurements so an unmeasured node cannot poison the graph', () => {
    const result = layoutRoadmap([node('a', NaN, Infinity, 0, NaN), node('b', -Infinity, 200, Infinity, -4)],
      [{ id: 'ab', source: 'a', target: 'b' }])
    assertGeometry(result.nodes, [{ id: 'ab', source: 'a', target: 'b' }], result.routes)
    expect(result.nodes.every((item) => Number.isFinite(item.position.x) && Number.isFinite(item.position.y))).toBe(true)
  })

  it('avoids collisions over varied measured heights and branching row combinations', () => {
    for (let sample = 1; sample <= 12; sample++) {
      const nodes = Array.from({ length: 18 }, (_, index) =>
        node(`n${index}`, (index % 6) * 160, Math.floor(index / 6) * 220,
          180 + (index * sample * 17) % 140, 100 + (index * sample * 31) % 320))
      const edges = Array.from({ length: 24 }, (_, index) => ({
        id: `e${index}`, source: `n${(index * sample + 3) % 18}`, target: `n${(index * 7 + sample) % 18}`,
      }))
      const result = layoutRoadmap(nodes, edges)
      assertGeometry(result.nodes, edges, result.routes)
    }
  })
})
