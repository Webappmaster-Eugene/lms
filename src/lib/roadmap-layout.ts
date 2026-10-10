export type RoadmapPoint = { x: number; y: number }

export type RoadmapLayoutNode = {
  id: string
  type: string
  position: RoadmapPoint
  width: number
  height: number
  stage?: string | null
}

export type RoadmapLayoutEdge = { id: string; source: string; target: string }

export const ROADMAP_COLUMN_GAP = 64
export const ROADMAP_ROW_GAP = 120

const ROW_TOLERANCE = 100
const CLEARANCE = 20
const LANE_GAP = 8

type Row<T> = { nodes: T[]; originalY: number; stage?: string | null; category: boolean }
type Rectangle = { left: number; right: number; top: number; bottom: number }
type Segment = { start: RoadmapPoint; end: RoadmapPoint; source: string; target: string }

function coordinate(value: number) {
  return Number.isFinite(value) ? value : 0
}

function dimension(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1
}

function compareNodes(a: RoadmapLayoutNode, b: RoadmapLayoutNode) {
  return coordinate(a.position.y) - coordinate(b.position.y)
    || coordinate(a.position.x) - coordinate(b.position.x)
    || a.id.localeCompare(b.id)
}

function bounds(node: RoadmapLayoutNode): Rectangle {
  return {
    left: node.position.x,
    right: node.position.x + node.width,
    top: node.position.y,
    bottom: node.position.y + node.height,
  }
}

function intersects(start: RoadmapPoint, end: RoadmapPoint, rectangle: Rectangle) {
  if (start.x === end.x) {
    return start.x > rectangle.left && start.x < rectangle.right
      && Math.max(start.y, end.y) > rectangle.top
      && Math.min(start.y, end.y) < rectangle.bottom
  }
  return start.y > rectangle.top && start.y < rectangle.bottom
    && Math.max(start.x, end.x) > rectangle.left
    && Math.min(start.x, end.x) < rectangle.right
}

function simplify(points: RoadmapPoint[]) {
  const result: RoadmapPoint[] = []
  for (const point of points) {
    const last = result.at(-1)
    if (last?.x === point.x && last.y === point.y) continue
    const before = result.at(-2)
    if (before && last && (
      (before.x === last.x && last.x === point.x)
      || (before.y === last.y && last.y === point.y)
    )) result.pop()
    result.push(point)
  }
  return result
}

function overlap(a: RoadmapPoint, b: RoadmapPoint, c: RoadmapPoint, d: RoadmapPoint) {
  if (a.x === b.x && c.x === d.x && a.x === c.x) {
    return Math.max(0, Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
      - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)))
  }
  if (a.y === b.y && c.y === d.y && a.y === c.y) {
    return Math.max(0, Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
      - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)))
  }
  return 0
}

function crosses(a: RoadmapPoint, b: RoadmapPoint, c: RoadmapPoint, d: RoadmapPoint) {
  if ((a.x === b.x) === (c.x === d.x)) return false
  const vertical = a.x === b.x ? [a, b] : [c, d]
  const horizontal = a.x === b.x ? [c, d] : [a, b]
  return vertical[0].x > Math.min(horizontal[0].x, horizontal[1].x)
    && vertical[0].x < Math.max(horizontal[0].x, horizontal[1].x)
    && horizontal[0].y > Math.min(vertical[0].y, vertical[1].y)
    && horizontal[0].y < Math.max(vertical[0].y, vertical[1].y)
}

function routeScore(points: RoadmapPoint[], previous: Segment[], edge: RoadmapLayoutEdge) {
  let score = (points.length - 2) * 24
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1]
    const end = points[index]
    score += Math.abs(start.x - end.x) + Math.abs(start.y - end.y)
    for (const segment of previous) {
      const related = edge.source === segment.source || edge.target === segment.target
      score += overlap(start, end, segment.start, segment.end) * (related ? 0.15 : 8)
      if (crosses(start, end, segment.start, segment.end)) score += related ? 10 : 180
    }
  }
  return score
}

/** Measured display geometry; horizontalSteps gives adjacent curriculum steps side ports. */
export function layoutRoadmap<T extends RoadmapLayoutNode>(input: readonly T[], edges: readonly RoadmapLayoutEdge[], options: { horizontalSteps?: boolean } = {}) {
  if (!input.length) return { nodes: [] as T[], routes: {} as Record<string, RoadmapPoint[]> }

  const sorted = input.map((node) => ({
    ...node,
    width: dimension(node.width),
    height: dimension(node.height),
  })).sort(compareNodes)
  const rows: Row<T>[] = []
  for (const node of sorted) {
    const category = node.type === 'category'
    const row = rows.at(-1)
    if (row && !category && !row.category && row.stage === node.stage
      && coordinate(node.position.y) - row.originalY < ROW_TOLERANCE) {
      row.nodes.push(node)
    } else {
      rows.push({ nodes: [node], originalY: coordinate(node.position.y), stage: node.stage, category })
    }
  }
  rows.forEach((row) => row.nodes.sort((a, b) => coordinate(a.position.x) - coordinate(b.position.x) || a.id.localeCompare(b.id)))

  const rowByNode = new Map<string, number>()
  rows.forEach((row, index) => row.nodes.forEach((node) => rowByNode.set(node.id, index)))
  const validEdges = edges.filter((edge) => rowByNode.has(edge.source) && rowByNode.has(edge.target))
    .slice().sort((a, b) => a.id.localeCompare(b.id))
  const outgoing = rows.map(() => [] as RoadmapLayoutEdge[])
  const incoming = rows.map(() => [] as RoadmapLayoutEdge[])
  for (const edge of validEdges) {
    const sourceRow = rowByNode.get(edge.source)
    const targetRow = rowByNode.get(edge.target)
    if (sourceRow === undefined || targetRow === undefined) continue
    outgoing[sourceRow].push(edge)
    incoming[targetRow].push(edge)
  }

  const rowWidths = rows.map((row) => row.nodes.reduce((sum, node) => sum + node.width, 0)
    + Math.max(0, row.nodes.length - 1) * ROADMAP_COLUMN_GAP)
  const widest = Math.max(...rowWidths)
  const placed = new Map<string, T>()
  const rowTops: number[] = []
  const rowBottoms: number[] = []
  let y = 0
  rows.forEach((row, index) => {
    let x = options.horizontalSteps && !row.category ? 0 : (widest - rowWidths[index]) / 2
    rowTops.push(y)
    const height = Math.max(...row.nodes.map((node) => node.height))
    rowBottoms.push(y + height)
    row.nodes.forEach((node) => {
      placed.set(node.id, { ...node, position: { x, y } })
      x += node.width + ROADMAP_COLUMN_GAP
    })
    // Both adjacent rows reserve their own channels, including backward edges.
    const channelCount = outgoing[index].length + (incoming[index + 1]?.length ?? 0)
    y += height + Math.max(ROADMAP_ROW_GAP, 2 * CLEARANCE + (channelCount + 1) * LANE_GAP)
  })

  const nodes = input.map((node) => placed.get(node.id) ?? node)
  const rectangles = nodes.map(bounds)
  const obstacles = rectangles.map((rectangle) => ({
    left: rectangle.left - CLEARANCE / 2,
    right: rectangle.right + CLEARANCE / 2,
    top: rectangle.top - CLEARANCE / 2,
    bottom: rectangle.bottom + CLEARANCE / 2,
  }))
  const gutters = [...new Set(rectangles.flatMap((rectangle) => [
    rectangle.left - CLEARANCE,
    rectangle.left - CLEARANCE - LANE_GAP,
    rectangle.right + CLEARANCE,
    rectangle.right + CLEARANCE + LANE_GAP,
  ]))].sort((a, b) => a - b)
  const previous: Segment[] = []
  const routes = new Map<string, RoadmapPoint[]>()

  for (const edge of validEdges) {
    const source = placed.get(edge.source)
    const target = placed.get(edge.target)
    const sourceRow = rowByNode.get(edge.source)
    const targetRow = rowByNode.get(edge.target)
    if (!source || !target || sourceRow === undefined || targetRow === undefined) continue
    if (options.horizontalSteps && sourceRow === targetRow && source.position.x + source.width < target.position.x) {
      const start = { x: source.position.x + source.width, y: source.position.y + source.height / 2 }
      const end = { x: target.position.x, y: target.position.y + target.height / 2 }
      const middle = (start.x + end.x) / 2
      const points = simplify([start, { x: middle, y: start.y }, { x: middle, y: end.y }, end])
      const clear = points.slice(1).every((point, index) => nodes.every((node) =>
        node.id === source.id || node.id === target.id || !intersects(points[index], point, bounds(node))))
      if (clear) {
        routes.set(edge.id, points)
        points.slice(1).forEach((point, index) => previous.push({ start: points[index], end: point, source: edge.source, target: edge.target }))
        continue
      }
    }
    const start = { x: source.position.x + source.width / 2, y: source.position.y + source.height }
    const end = { x: target.position.x + target.width / 2, y: target.position.y }
    const exit = { x: start.x, y: rowBottoms[sourceRow] + CLEARANCE + outgoing[sourceRow].indexOf(edge) * LANE_GAP }
    const entry = { x: end.x, y: rowTops[targetRow] - CLEARANCE - incoming[targetRow].indexOf(edge) * LANE_GAP }
    const candidates = [...new Set([start.x, end.x, (start.x + end.x) / 2, ...gutters])]
    let best: RoadmapPoint[] | null = null
    let bestScore = Infinity
    for (const x of candidates) {
      const middle = simplify([exit, { x, y: exit.y }, { x, y: entry.y }, entry])
      const clear = middle.slice(1).every((point, index) =>
        obstacles.every((obstacle) => !intersects(middle[index], point, obstacle)))
      if (!clear) continue
      const points = simplify([start, ...middle, end])
      const score = routeScore(points, previous, edge)
      if (score < bestScore) {
        best = points
        bestScore = score
      }
    }
    // The outer gutters are outside every card, so a route always exists.
    if (!best) throw new Error(`Не удалось проложить связь ${edge.id}`)
    routes.set(edge.id, best)
    best.slice(1).forEach((point, index) => previous.push({ start: best[index], end: point, source: edge.source, target: edge.target }))
  }
  return { nodes, routes: Object.fromEntries(routes) }
}
