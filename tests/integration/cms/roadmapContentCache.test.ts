import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { getRoadmapContent } from '@/server/learning-catalog'
import { getTestPayload, uid } from '../helpers/payload'

let payload: Payload
beforeAll(async () => { payload = await getTestPayload() })
afterEach(() => { vi.restoreAllMocks() })

describe('кеш карты роадмапа', () => {
  it('повторное чтение неизменённой карты берётся из кеша целиком: курсы, темы со всеми полями и связи', async () => {
    const roadmap = await payload.create({ collection: 'roadmaps', data: { title: uid('map'), slug: uid('map'), isPublished: true } })
    const course = await payload.create({ collection: 'courses', data: { title: uid('course'), slug: uid('course'), roadmap: roadmap.id, isPublished: true, estimatedHours: 12, order: 2 } })
    const node = (nodeId: string, extra: Record<string, unknown>) => payload.create({ collection: 'roadmap-nodes', data: { nodeId, label: nodeId, nodeType: 'topic', positionX: 10, positionY: 20, roadmap: roadmap.id, ...extra } as never })
    const source = await node(uid('html'), { course: course.id, stage: 'base', color: 'lime', icon: 'code', description: 'Разметка', bullets: [{ text: 'Теги' }], order: 1 })
    const target = await node(uid('css'), { nodeType: 'subtopic', stage: 'growth', color: 'blue' })
    const edge = await payload.create({ collection: 'roadmap-edges', data: { edgeId: uid('edge'), roadmap: roadmap.id, source: source.id, target: target.id, edgeType: 'smoothstep', animated: true } })

    const first = await getRoadmapContent(payload, roadmap.id)
    const find = vi.spyOn(payload, 'find')
    const cached = await getRoadmapContent(payload, roadmap.id)
    const reads = find.mock.calls.map(([args]) => args.collection)
    expect(reads).not.toContain('courses')
    expect(reads).not.toContain('roadmap-nodes')
    expect(reads).not.toContain('roadmap-edges')
    expect(cached).toEqual(first)
    expect(cached.courses).toEqual([expect.objectContaining({ id: course.id, estimatedHours: 12, order: 2 })])
    expect(cached.nodes.find((item) => item.id === source.id)).toMatchObject({ stage: 'base', color: 'lime', icon: 'code', bullets: [expect.objectContaining({ text: 'Теги' })] })
    expect(cached.edges).toEqual([expect.objectContaining({ id: edge.id, edgeType: 'smoothstep', animated: true })])
  })

  it('номер роадмапа не положительное целое — 400 до чтения базы', async () => {
    const find = vi.spyOn(payload, 'find')
    for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await expect(getRoadmapContent(payload, id)).rejects.toMatchObject({ status: 400 })
    expect(find).not.toHaveBeenCalled()
  })
})
