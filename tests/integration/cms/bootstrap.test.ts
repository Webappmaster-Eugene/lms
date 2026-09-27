import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { seedRoadmapNodes } from '@/lib/seed-roadmap-runner'
import { collectAllPages } from '@/lib/paginate'
import { relationId } from '@/lib/relation-id'
import { BOOTSTRAP_ADMIN } from '../setup/constants'
import { getTestPayload } from '../helpers/payload'

/**
 * onInit на пустой базе: первый админ из ADMIN_EMAIL/ADMIN_PASSWORD и автосид
 * роадмапов. Это ровно то, что происходит при первом выкате прода.
 */
let payload: Payload

beforeAll(async () => {
  payload = await getTestPayload()
})

describe('первый запуск (onInit)', () => {
  it('создаёт админа из переменных окружения, и под ним можно войти', async () => {
    const found = await payload.find({ collection: 'users', where: { email: { equals: BOOTSTRAP_ADMIN.email } } })
    expect(found.totalDocs).toBe(1)
    expect(found.docs[0].role).toBe('admin')
    expect(found.docs[0].isActive).toBe(true)

    const { user, token } = await payload.login({ collection: 'users', data: BOOTSTRAP_ADMIN })
    expect(token).toBeTruthy()
    expect(user?.email).toBe(BOOTSTRAP_ADMIN.email)
  })

  it('не создаёт второго админа при повторной инициализации', async () => {
    await payload.config.onInit?.(payload)
    const admins = await payload.count({ collection: 'users', where: { email: { equals: BOOTSTRAP_ADMIN.email } } })
    expect(admins.totalDocs).toBe(1)
  })
})

describe('автосид роадмапов', () => {
  async function snapshot() {
    const nodes = await collectAllPages(
      ({ page, limit }) => payload.find({ collection: 'roadmap-nodes', depth: 0, sort: 'id', page, limit }),
      { label: 'узлы' },
    )
    const edges = await collectAllPages(
      ({ page, limit }) => payload.find({ collection: 'roadmap-edges', depth: 0, sort: 'id', page, limit }),
      { label: 'рёбра' },
    )
    return { nodes, edges }
  }

  it('засевает оба роадмапа, узлы уникальны, рёбра не висят в воздухе', async () => {
    const { nodes, edges } = await snapshot()
    const roadmaps = await payload.find({ collection: 'roadmaps', where: { slug: { in: ['frontend-react', 'backend-nodejs'] } } })
    expect(roadmaps.totalDocs).toBe(2)
    expect(nodes.length).toBeGreaterThan(20)
    expect(edges.length).toBeGreaterThan(20)

    const nodeIds = nodes.map((n) => n.nodeId)
    expect(new Set(nodeIds).size).toBe(nodeIds.length)

    const byId = new Map(nodes.map((n) => [n.id, n]))
    for (const edge of edges) {
      const source = byId.get(relationId(edge.source))
      const target = byId.get(relationId(edge.target))
      expect(source, `ребро ${edge.edgeId}: нет исходного узла`).toBeDefined()
      expect(target, `ребро ${edge.edgeId}: нет целевого узла`).toBeDefined()
      // Ребро не может связывать узлы разных роадмапов — граф развалится.
      expect(relationId(source!.roadmap)).toBe(relationId(edge.roadmap))
      expect(relationId(target!.roadmap)).toBe(relationId(edge.roadmap))
    }
  })

  it('каждый курс, на который ссылается узел, существует и принадлежит тому же роадмапу', async () => {
    const { nodes } = await snapshot()
    const withCourse = nodes.filter((n) => n.course != null)
    expect(withCourse.length).toBeGreaterThan(0)
    for (const node of withCourse) {
      const course = await payload.findByID({ collection: 'courses', id: relationId(node.course), depth: 0 })
      expect(relationId(course.roadmap), `узел ${node.nodeId}`).toBe(relationId(node.roadmap))
    }
  })

  it('повторный запуск идемпотентен: число узлов, рёбер и курсов не растёт', async () => {
    const before = await snapshot()
    const coursesBefore = await payload.count({ collection: 'courses' })
    await seedRoadmapNodes(payload)
    const after = await snapshot()
    const coursesAfter = await payload.count({ collection: 'courses' })
    expect(after.nodes.length).toBe(before.nodes.length)
    expect(after.edges.length).toBe(before.edges.length)
    expect(coursesAfter.totalDocs).toBe(coursesBefore.totalDocs)
  })
})
