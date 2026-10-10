import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { getLearningCatalog, getRoadmapContent } from '@/server/learning-catalog'
import { getLearningAccess } from '@/server/learning-access'
import { createAdmin, createStudent, getTestPayload, uid } from '../helpers/payload'

let payload: Payload
beforeAll(async () => { payload = await getTestPayload() })
afterEach(() => { vi.restoreAllMocks() })

describe('кеш каталога с настоящим Payload/PostgreSQL', () => {
  it('пропускает повторные select каталога, но сразу видит update даже с прежним updatedAt', async () => {
    const roadmap = await payload.create({ collection: 'roadmaps', data: { title: uid('cache'), slug: uid('cache'), isPublished: true } })
    const first = await getLearningCatalog(payload)
    expect(first.roadmaps.find((row) => row.id === roadmap.id)?.isPublished).toBe(true)
    const find = vi.spyOn(payload, 'find')
    await getLearningCatalog(payload)
    expect(find).not.toHaveBeenCalled()

    const adapter = payload.db as unknown as { drizzle: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } }
    await adapter.drizzle.execute(sql`update roadmaps set is_published = false where id = ${roadmap.id}`)
    const changed = await getLearningCatalog(payload)
    expect(changed.roadmaps.find((row) => row.id === roadmap.id)?.isPublished).toBe(false)
    expect(find).toHaveBeenCalled()
  })

  it('возвращает allowlist и инвалидирует массив под-тем при изменении дочерних строк', async () => {
    const roadmap = await payload.create({ collection: 'roadmaps', data: { title: uid('cache-map'), slug: uid('cache-map'), isPublished: true } })
    const course = await payload.create({ collection: 'courses', data: { title: uid('cache-course'), slug: uid('cache-course'), roadmap: roadmap.id, isPublished: true } })
    const node = await payload.create({ collection: 'roadmap-nodes', data: { nodeId: uid('cache-node'), label: 'HTML', nodeType: 'topic', positionX: 0, positionY: 0, roadmap: roadmap.id, course: course.id, bullets: [{ text: 'До изменения' }] } })
    const first = await getRoadmapContent(payload, roadmap.id)
    expect(first.courses[0]).not.toHaveProperty('createdAt')
    expect(first.nodes[0]?.bullets?.[0]?.text).toBe('До изменения')
    const adapter = payload.db as unknown as { drizzle: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } }
    await adapter.drizzle.execute(sql`update roadmap_nodes_bullets set text = 'После изменения' where _parent_id = ${node.id}`)
    expect((await getRoadmapContent(payload, roadmap.id)).nodes[0]?.bullets?.[0]?.text).toBe('После изменения')
  })

  it('не публикует незакоммиченный снимок в общий кеш', async () => {
    const roadmap = await payload.create({ collection: 'roadmaps', data: { title: uid('cache-tx'), slug: uid('cache-tx'), isPublished: true } })
    await getLearningCatalog(payload)
    const transactionID = await payload.db.beginTransaction()
    if (transactionID === null) throw new Error('Тест требует транзакционный Postgres')
    const req = await createLocalReq({}, payload)
    req.transactionID = transactionID
    try {
      await payload.update({ collection: 'roadmaps', id: roadmap.id, data: { isPublished: false }, req })
      expect((await getLearningCatalog(payload, req)).roadmaps.find((row) => row.id === roadmap.id)?.isPublished).toBe(false)
      expect((await getLearningCatalog(payload)).roadmaps.find((row) => row.id === roadmap.id)?.isPublished).toBe(true)
    } finally {
      await payload.db.rollbackTransaction(transactionID)
    }
    expect((await getLearningCatalog(payload)).roadmaps.find((row) => row.id === roadmap.id)?.isPublished).toBe(true)
  })

  it('тёплый общий каталог не кеширует права разных учеников и сразу видит отзыв доступа', async () => {
    const roadmap = await payload.create({ collection: 'roadmaps', data: { title: uid('cache-access'), slug: uid('cache-access'), isPublished: true } })
    const course = await payload.create({ collection: 'courses', data: { title: uid('cache-access-course'), slug: uid('cache-access-course'), roadmap: roadmap.id, isPublished: true } })
    const admin = await createAdmin(payload)
    const alice = await createStudent(payload)
    const bob = await createStudent(payload, { learningAccessMode: 'assigned' })
    const aliceReq = await createLocalReq({ user: alice }, payload)
    expect((await getLearningAccess(payload, alice, aliceReq)).canAccessCourse(course.id)).toBe(true)
    expect((await getLearningAccess(payload, bob, await createLocalReq({ user: bob }, payload))).canAccessCourse(course.id)).toBe(false)
    await payload.create({ collection: 'learning-access-grants', user: admin, overrideAccess: false, data: { ruleKey: uid('cache-grant'), user: alice.id, target: { relationTo: 'courses', value: course.id }, effect: 'deny' } })
    expect((await getLearningAccess(payload, alice, await createLocalReq({ user: alice }, payload))).canAccessCourse(course.id)).toBe(false)
  })
})
