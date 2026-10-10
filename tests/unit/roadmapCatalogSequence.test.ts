import { describe, expect, it } from 'vitest'
import catalog from '../fixtures/roadmap-sequences.json'
import { layoutRoadmap } from '@/lib/roadmap-layout'
import { sequenceRoadmapNodes, sequentialRoadmapEdges } from '@/lib/roadmap-sequence'

/** Read-only catalogue snapshot of 2026-10-10: no user data, course content or credentials. */
describe('последовательность фактического каталога: 9 карт и 86 тем', () => {
  for (const roadmap of catalog) {
    it(`${roadmap.slug}: одна цепь, читабельные ряды и ни одной коллизии`, () => {
      const source = roadmap.nodes.map((node) => ({ ...node,
        nodeType: node.nodeType === 'category' ? 'category' as const
          : node.nodeType === 'subtopic' ? 'subtopic' as const : 'topic' as const,
      }))
      const sequence = sequenceRoadmapNodes([...source].reverse(), roadmap.slug)
      expect(sequence.map((node) => node.id)).toEqual(source.map((node) => node.id))
      const chain = sequentialRoadmapEdges(sequence)
      expect(chain).toHaveLength(Math.max(0, source.length - 1))
      const geometry = layoutRoadmap(sequence.map((node, index) => ({
        id: node.nodeId, type: node.nodeType, position: { x: node.positionX, y: node.positionY },
        width: node.nodeType === 'category' ? 320 : 280,
        height: node.nodeType === 'category' ? 96 : 160 + (index % 5) * 45,
        stage: node.stage,
      })), chain.map((edge) => ({ ...edge, id: edge.edgeId })), { horizontalSteps: true })
      expect(Object.keys(geometry.routes)).toHaveLength(chain.length)
      for (let index = 0; index < geometry.nodes.length; index++) {
        const node = geometry.nodes[index]
        const previous = geometry.nodes[index - 1]
        if (previous) {
          expect(node.position.y > previous.position.y || node.position.x > previous.position.x).toBe(true)
          if (node.type !== 'category' && node.position.y > previous.position.y) expect(node.position.x).toBe(0)
        }
        for (const other of geometry.nodes.slice(index + 1)) {
          const overlap = node.position.x < other.position.x + other.width
            && node.position.x + node.width > other.position.x
            && node.position.y < other.position.y + other.height
            && node.position.y + node.height > other.position.y
          expect(overlap, `${node.id} / ${other.id}`).toBe(false)
        }
      }
      for (const points of Object.values(geometry.routes)) {
        for (let index = 1; index < points.length; index++) {
          const start = points[index - 1], end = points[index]
          for (const node of geometry.nodes) {
            const hits = start.x === end.x
              ? start.x > node.position.x && start.x < node.position.x + node.width
                && Math.max(start.y, end.y) > node.position.y && Math.min(start.y, end.y) < node.position.y + node.height
              : start.y > node.position.y && start.y < node.position.y + node.height
                && Math.max(start.x, end.x) > node.position.x && Math.min(start.x, end.x) < node.position.x + node.width
            expect(hits, `Связь пересекает ${node.id}`).toBe(false)
          }
        }
      }
      const labels = sequence.filter((node) => node.nodeType !== 'category').map((node) => node.label)
      if (roadmap.slug === 'frontend-react') expect(labels.slice(0, 4)).toEqual(['HTML', 'CSS', 'JS', 'JS + DOM'])
      if (roadmap.slug === 'backend-nodejs') expect(labels.slice(0, 2)).toEqual(['JS', 'TS'])
      if (roadmap.slug === 'devops-infra') {
        expect(labels.indexOf('Kubernetes и Helm')).toBeLessThan(labels.indexOf('Деплой fullstack-приложения'))
        expect(labels.indexOf('Kubernetes и Helm')).toBeLessThan(labels.indexOf('Observability'))
      }
    })
  }
})
