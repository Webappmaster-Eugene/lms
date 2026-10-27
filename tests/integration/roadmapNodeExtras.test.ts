import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import type { LearningTargetCollection } from '@/lib/learning-access'
import { getLearningAccess } from '@/server/learning-access'
import { getLearningCatalog, getRoadmapContent } from '@/server/learning-catalog'
import { getRoadmapNodeExtras } from '@/server/roadmap-node-extras'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, uid, type CourseTree, type TestUser } from './helpers/payload'

/**
 * Гайды и буткемпы в теме карты на настоящей БД: тема из одних гайдов видна ученику, если её
 * карта уже открыта; закрытый курс темы при этом не открывается и описание темы не раскрывается.
 */
let payload: Payload
let admin: TestUser
let tree: CourseTree

const node = (roadmap: number, data: Record<string, unknown> = {}) =>
  payload.create({ collection: 'roadmap-nodes', data: { nodeId: uid('extras-node'), label: uid('Тема'), nodeType: 'topic', roadmap, positionX: 0, positionY: 0, ...data } as never })
const guide = (data: Record<string, unknown> = {}) =>
  payload.create({ collection: 'guides', data: { title: uid('Гайд'), summary: 'Кратко', markdown: 'Текст гайда', isPublished: true, ...data } as never, context: { skipHooks: true } })
const bootcamp = (roadmap: number, data: Record<string, unknown> = {}) =>
  payload.create({ collection: 'courses', data: { title: uid('Буткемп'), roadmap, isPublished: true, isBootcamp: true, ...data } as never })
async function grant(user: TestUser, collection: LearningTargetCollection, id: number) {
  return payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: user.id, target: { relationTo: collection, value: id }, effect: 'allow', ruleKey: 'server-generated' } })
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  tree = await createCourseTree(payload, { lessons: 1 })
})

describe('тема из гайдов и буткемпов на настоящей БД', () => {
  it('скрытый каталог: тема из одних гайдов видна с рёбрами, когда карта открыта назначенным курсом', async () => {
    const courseNode = await node(tree.roadmap.id, { course: tree.course.id })
    const guideNode = await node(tree.roadmap.id, { guides: [(await guide()).id], description: 'Секрет темы' })
    const emptyNode = await node(tree.roadmap.id, { description: 'Пустая тема' })
    const edge = await payload.create({ collection: 'roadmap-edges', data: { edgeId: uid('extras-edge'), roadmap: tree.roadmap.id, source: courseNode.id, target: guideNode.id } })
    const learner = await createStudent(payload, { learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned' })
    const token = await login(payload, learner)

    expect((await rest('GET', `/roadmap-nodes/${guideNode.id}`, { token })).status).toBe(404)
    await grant(learner, 'courses', tree.course.id)
    const visible = await rest('GET', `/roadmap-nodes/${guideNode.id}?depth=2`, { token })
    expect(visible.status).toBe(200)
    expect(visible.json).toMatchObject({ id: guideNode.id, description: null })
    expect(visible.json).not.toHaveProperty('guides')
    expect((await rest('GET', `/roadmap-edges/${edge.id}`, { token })).status).toBe(200)
    // Тема без курса и без гайдов по-прежнему не видна: карта открыта не целиком.
    expect((await rest('GET', `/roadmap-nodes/${emptyNode.id}`, { token })).status).toBe(404)
    expect((await rest('GET', `/roadmaps/${tree.roadmap.id}`, { token })).status).toBe(200)
  })

  it('тема с гайдом в чужой карте отвечает 404', async () => {
    const other = await createCourseTree(payload, { lessons: 1 })
    const foreign = await node(other.roadmap.id, { guides: [(await guide()).id] })
    const learner = await createStudent(payload, { learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned' })
    await grant(learner, 'courses', tree.course.id)
    const token = await login(payload, learner)

    expect((await rest('GET', `/roadmap-nodes/${foreign.id}`, { token })).status).toBe(404)
    expect((await rest('GET', `/roadmaps/${other.roadmap.id}`, { token })).status).toBe(404)
  })

  it('каталог: тема с закрытым курсом и буткемпом видна без описания, закрытый курс остаётся закрытым', async () => {
    const closed = await payload.create({ collection: 'courses', data: { title: uid('Закрытый курс'), slug: uid('closed-course'), roadmap: tree.roadmap.id, isPublished: true, assignedOnly: true } })
    const camp = await bootcamp(tree.roadmap.id)
    const withCamp = await node(tree.roadmap.id, { course: closed.id, bootcamps: [camp.id], description: 'Программа закрытого курса' })
    const withoutCamp = await node(tree.roadmap.id, { course: closed.id, description: 'Программа закрытого курса' })
    const learner = await createStudent(payload, { learningAccessMode: 'assigned' })
    const token = await login(payload, learner)

    const visible = await rest('GET', `/roadmap-nodes/${withCamp.id}`, { token })
    expect(visible.status).toBe(200)
    expect(visible.json.description).toBeNull()
    expect((await rest('GET', `/roadmap-nodes/${withoutCamp.id}`, { token })).status).toBe(404)
    expect((await rest('GET', `/courses/${closed.id}`, { token })).status).toBe(404)
    expect((await rest('GET', `/courses/${camp.id}`, { token })).status).toBe(404)
    // Назначение темы не открывает её буткемп.
    await grant(learner, 'roadmap-nodes', withCamp.id)
    expect((await getLearningAccess(payload, learner, await createLocalReq({ user: learner }, payload))).canBrowseCourse(camp.id)).toBe(false)
  })

  it('сборка для страницы: закрытые с замком и без адреса буткемпа, прочитанный гайд, черновики отброшены', async () => {
    const open = await guide()
    const closed = await guide()
    const draft = await guide({ isPublished: false })
    const camp = await bootcamp(tree.roadmap.id)
    const draftCamp = await bootcamp(tree.roadmap.id, { isPublished: false })
    const topic = await node(tree.roadmap.id, { guides: [draft.id, closed.id, open.id], bootcamps: [draftCamp.id, camp.id] })
    const category = await node(tree.roadmap.id, { nodeType: 'category', guides: [open.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'assigned' })
    await grant(learner, 'guides', open.id)
    await payload.create({ collection: 'guide-reads', data: { user: learner.id, guide: open.id } })
    const req = await createLocalReq({ user: learner }, payload)
    const access = await getLearningAccess(payload, learner, req)
    const content = await getRoadmapContent(payload, tree.roadmap.id)

    const extras = await getRoadmapNodeExtras(payload, learner, access, content.nodes, req)
    expect(extras.get(topic.id)).toEqual([
      { key: `bootcamp-${camp.id}`, kind: 'bootcamp', title: camp.title, href: '/bootcamp?locked=1', accessAllowed: false, read: false },
      { key: `guide-${closed.id}`, kind: 'guide', title: closed.title, href: `/guides/${closed.slug}`, accessAllowed: false, read: false },
      { key: `guide-${open.id}`, kind: 'guide', title: open.title, href: `/guides/${open.slug}`, accessAllowed: true, read: true },
    ])
    expect(extras.has(category.id)).toBe(false)

    await grant(learner, 'courses', camp.id)
    const assigned = await createLocalReq({ user: learner }, payload)
    const reopened = await getRoadmapNodeExtras(payload, learner, await getLearningAccess(payload, learner, assigned), content.nodes, assigned)
    expect(reopened.get(topic.id)?.[0]).toMatchObject({ href: `/bootcamp/${camp.slug}`, accessAllowed: true })
  })

  it('PATCH без состава темы его сохраняет, удаление гайда каскадом снимает привязку', async () => {
    const first = await guide()
    const second = await guide()
    const camp = await bootcamp(tree.roadmap.id)
    const topic = await node(tree.roadmap.id, { guides: [first.id, second.id], bootcamps: [camp.id] })
    const token = await login(payload, admin)

    expect((await rest('PATCH', `/roadmap-nodes/${topic.id}`, { token, body: { positionX: 120, label: 'Переименована' } })).status).toBe(200)
    expect((await rest('GET', `/roadmap-nodes/${topic.id}?depth=0`, { token })).json).toMatchObject({ positionX: 120, guides: [first.id, second.id], bootcamps: [camp.id] })

    await payload.delete({ collection: 'guides', id: first.id })
    expect((await payload.findByID({ collection: 'roadmap-nodes', id: topic.id, depth: 0 })).guides).toEqual([second.id])
    const adapter = payload.db as unknown as { drizzle: { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }> } }
    expect((await adapter.drizzle.execute(sql`select id from roadmap_nodes_rels where guides_id = ${first.id}`)).rows).toEqual([])
    expect((await getLearningCatalog(payload)).nodes.find((item) => item.id === topic.id)).toMatchObject({ guides: [second.id], bootcamps: [camp.id] })

    expect((await rest('PATCH', `/roadmap-nodes/${topic.id}`, { token, body: { guides: [], bootcamps: [] } })).status).toBe(200)
    expect((await payload.findByID({ collection: 'roadmap-nodes', id: topic.id, depth: 0 })).guides).toEqual([])
  })
})
