import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import { normalizeRoadmapSequences } from '@/lib/normalize-roadmap-sequences'
import { createAdmin, createStudent, getTestPayload, uid } from '../helpers/payload'

let payload: Payload
let admin: User

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
})

describe('нормализация последовательности через Payload', () => {
  it('preview не записывает данные, apply сохраняет темы/курсы и становится идемпотентным', async () => {
    const slug = uid('sequential-react')
    const roadmap = await payload.create({ collection: 'roadmaps', data: { title: 'Последовательная карта', slug } })
    const nodes = []
    for (const [index, label] of ['HTML', 'CSS', 'JS'].entries()) {
      nodes.push(await payload.create({ collection: 'roadmap-nodes', data: {
        roadmap: roadmap.id, nodeId: `${slug}-${index}`, label, nodeType: 'topic',
        order: index + 1, positionX: index * 170, positionY: 100, stage: 'base',
        bullets: [{ text: `Содержание ${label}` }],
      } }))
    }
    const firstEdge = await payload.create({ collection: 'roadmap-edges', data: { roadmap: roadmap.id, edgeId: `${slug}-first`, source: nodes[0].id, target: nodes[1].id } })
    const secondEdge = await payload.create({ collection: 'roadmap-edges', data: { roadmap: roadmap.id, edgeId: `${slug}-second`, source: nodes[0].id, target: nodes[2].id } })
    const course = await payload.create({ collection: 'courses', data: { title: 'Существующий курс', slug: `${slug}-course`, roadmap: roadmap.id, roadmapNode: nodes[2].id } })
    await payload.update({ collection: 'roadmap-nodes', id: nodes[2].id, data: { course: course.id } })

    const before = await payload.find({ collection: 'roadmap-nodes', where: { roadmap: { equals: roadmap.id } }, depth: 0, sort: 'id' })
    const preview = await normalizeRoadmapSequences(payload, admin, { slug })
    expect(preview[0]).toMatchObject({ applied: false, plan: { changed: true, edgeUpdates: [{ id: secondEdge.id, source: nodes[1].id, target: nodes[2].id }] } })
    const unchanged = await payload.find({ collection: 'roadmap-nodes', where: { roadmap: { equals: roadmap.id } }, depth: 0, sort: 'id' })
    expect(unchanged.docs).toEqual(before.docs)

    const applied = await normalizeRoadmapSequences(payload, admin, { slug, apply: true })
    expect(applied[0].applied).toBe(true)
    const after = await payload.find({ collection: 'roadmap-nodes', where: { roadmap: { equals: roadmap.id } }, depth: 0, sort: 'id' })
    expect(after.docs.map((node) => node.id)).toEqual(nodes.map((node) => node.id))
    expect(after.docs.map((node) => node.nodeId)).toEqual(nodes.map((node) => node.nodeId))
    expect(after.docs[2]).toMatchObject({ course: course.id, bullets: [expect.objectContaining({ text: 'Содержание JS' })] })
    expect(await payload.findByID({ collection: 'roadmap-edges', id: firstEdge.id, depth: 0 })).toMatchObject({ source: nodes[0].id, target: nodes[1].id })
    expect(await payload.findByID({ collection: 'roadmap-edges', id: secondEdge.id, depth: 0 })).toMatchObject({ source: nodes[1].id, target: nodes[2].id })
    expect(await payload.findByID({ collection: 'courses', id: course.id, depth: 0 })).toMatchObject({ slug: course.slug, roadmap: roadmap.id, roadmapNode: nodes[2].id })
    const repeated = await normalizeRoadmapSequences(payload, admin, { slug, apply: true })
    expect(repeated[0]).toMatchObject({ applied: false, plan: { changed: false } })
  })

  it('отказывает ученику до чтения и изменения карты', async () => {
    const student = await createStudent(payload)
    await expect(normalizeRoadmapSequences(payload, student, { apply: true })).rejects.toThrow('только администратору')
  })
})
