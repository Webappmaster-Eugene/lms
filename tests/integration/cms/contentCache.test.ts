import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { getLearningCatalog, getRoadmapContent } from '@/server/learning-catalog'
import { getLearningAccess } from '@/server/learning-access'
import { createAdmin, createCourseTree, createStudent, getTestPayload, uid } from '../helpers/payload'

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

  it('видит правку состава темы в roadmap_nodes_rels и снятие гайда с публикации', async () => {
    const roadmap = await payload.create({ collection: 'roadmaps', data: { title: uid('cache-extras'), slug: uid('cache-extras'), isPublished: true } })
    const guide = (title: string) => payload.create({ collection: 'guides', data: { title: uid(title), slug: uid('cache-guide'), summary: 'Кратко', markdown: 'Текст', isPublished: true }, context: { skipHooks: true } })
    const [first, second] = [await guide('first'), await guide('second')]
    const node = await payload.create({ collection: 'roadmap-nodes', data: { nodeId: uid('cache-extras-node'), label: 'Карьера', nodeType: 'topic', positionX: 0, positionY: 0, roadmap: roadmap.id, guides: [first.id] } })
    const catalogNode = async () => (await getLearningCatalog(payload)).nodes.find((row) => row.id === node.id)
    expect((await getRoadmapContent(payload, roadmap.id)).nodes[0]?.guides).toEqual([first.id])
    expect(await catalogNode()).toMatchObject({ guides: [first.id] })

    // Связь правится в дочерней таблице: строка самой темы и её xmin не меняются.
    const adapter = payload.db as unknown as { drizzle: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } }
    await adapter.drizzle.execute(sql`update roadmap_nodes_rels set guides_id = ${second.id} where parent_id = ${node.id} and path = 'guides'`)
    expect((await getRoadmapContent(payload, roadmap.id)).nodes[0]?.guides).toEqual([second.id])
    expect(await catalogNode()).toMatchObject({ guides: [second.id] })

    await payload.update({ collection: 'guides', id: second.id, data: { isPublished: false }, context: { skipHooks: true } })
    expect(await catalogNode()).toMatchObject({ guides: [] })
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

  it('видит изменение prerequisite без изменения родительского курса и удаление связи карты', async () => {
    const tree = await createCourseTree(payload, { lessons: 1 })
    const prerequisite = await payload.create({ collection: 'courses', data: {
      title: uid('prerequisite'), slug: uid('prerequisite'), roadmap: tree.roadmap.id, isPublished: true,
    } })
    await payload.update({ collection: 'courses', id: tree.course.id, data: { prerequisites: [prerequisite.id] } })
    const nodes = await Promise.all([tree.course, prerequisite].map(course => payload.create({
      collection: 'roadmap-nodes', data: {
        nodeId: uid('relation-node'), label: course.title, nodeType: 'topic',
        roadmap: tree.roadmap.id, course: course.id, positionX: 0, positionY: 0,
      },
    })))
    const edge = await payload.create({ collection: 'roadmap-edges', data: {
      edgeId: uid('relation-edge'), roadmap: tree.roadmap.id, source: nodes[0].id, target: nodes[1].id,
    } })
    const first = await getRoadmapContent(payload, tree.roadmap.id)
    expect(first.courses.find(course => course.id === tree.course.id)?.prerequisites).toEqual([prerequisite.id])
    expect(first.edges.map(item => item.id)).toContain(edge.id)
    const before = await payload.findByID({ collection: 'courses', id: tree.course.id })

    const adapter = payload.db as unknown as { drizzle: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } }
    await adapter.drizzle.execute(sql`delete from courses_rels where parent_id = ${tree.course.id} and path = 'prerequisites'`)
    expect((await payload.findByID({ collection: 'courses', id: tree.course.id })).updatedAt).toBe(before.updatedAt)
    const changed = await getRoadmapContent(payload, tree.roadmap.id)
    expect(changed.courses.find(course => course.id === tree.course.id)?.prerequisites ?? []).toEqual([])
    await payload.delete({ collection: 'roadmap-edges', id: edge.id })
    expect((await getRoadmapContent(payload, tree.roadmap.id)).edges.map(item => item.id)).not.toContain(edge.id)
  })

  it('тёплый каталог не сохраняет старый режим из DTO ученика или удалённое назначение', async () => {
    const tree = await createCourseTree(payload, { lessons: 1 })
    const admin = await createAdmin(payload)
    const user = await createStudent(payload)
    const access = () => getLearningAccess(payload, user)
    expect((await access()).canAccessCourse(tree.course.id)).toBe(true)
    const warm = await getLearningCatalog(payload)

    await payload.update({ collection: 'users', id: user.id, data: { learningAccessMode: 'assigned' }, user: admin, overrideAccess: false })
    expect(user.learningAccessMode).toBe('all')
    expect(await getLearningCatalog(payload)).toEqual(warm)
    expect((await access()).canAccessCourse(tree.course.id)).toBe(false)
    const grant = await payload.create({ collection: 'learning-access-grants', user: admin, overrideAccess: false, data: {
      ruleKey: uid('cache-revocation'), user: user.id, target: { relationTo: 'courses', value: tree.course.id }, effect: 'allow',
    } })
    expect((await access()).canAccessCourse(tree.course.id)).toBe(true)
    await payload.delete({ collection: 'learning-access-grants', id: grant.id, user: admin, overrideAccess: false })
    expect(await getLearningCatalog(payload)).toEqual(warm)
    expect((await access()).canAccessCourse(tree.course.id)).toBe(false)
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
