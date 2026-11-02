import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'

import type { LearningTargetCollection } from '@/lib/learning-access'
import { canAccessLesson, getLearningAccess } from '@/server/learning-access'
import { getLearningCatalog, getRoadmapContent, sharedRoadmapsByCourse } from '@/server/learning-catalog'
import { getRoadmapNodeExtras } from '@/server/roadmap-node-extras'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, uid, type TestUser } from './helpers/payload'

/**
 * Курс живёт в одном роадмапе, а темы других карт показывают его как свой. На настоящей БД
 * проверяются запросы, которых нет в чистой политике: темы по связи hasMany и родители урока.
 */
let payload: Payload
let admin: TestUser

const topic = (roadmap: number, data: Record<string, unknown> = {}) =>
  payload.create({ collection: 'roadmap-nodes', data: { nodeId: uid('shared-node'), label: uid('Тема'), nodeType: 'topic', roadmap, positionX: 0, positionY: 0, ...data } as never })
async function assign(user: TestUser, collection: LearningTargetCollection, id: number, effect: 'allow' | 'deny' = 'allow') {
  return payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: user.id, target: { relationTo: collection, value: id }, effect, ruleKey: 'server-generated' } })
}
const finish = (user: TestUser, lesson: number) =>
  payload.create({ collection: 'user-progress', data: { user: user.id, lesson, isCompleted: true }, user, overrideAccess: false })
const roadmapBonuses = async (user: TestUser) =>
  (await payload.find({ collection: 'points-transactions', where: { user: { equals: user.id }, reason: { equals: 'roadmap_completed' } }, limit: 10 })).docs.map((item) => item.relatedEntity).sort()
const roadmapCertificates = async (user: TestUser) =>
  (await payload.find({ collection: 'certificates', where: { user: { equals: user.id }, type: { equals: 'roadmap' } }, limit: 10 })).docs.map((item) => item.relatedEntity).sort()

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
})

describe('сборка карты с курсом другого роадмапа', () => {
  it('карта отдаёт чужой курс, а сам курс остаётся в своём роадмапе', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const map = await createCourseTree(payload, { lessons: 1 })
    const node = await topic(map.roadmap.id, { sharedCourses: [home.course.id] })

    const content = await getRoadmapContent(payload, map.roadmap.id)
    expect(content.courses.map((course) => course.id).sort((a, b) => a - b)).toEqual([home.course.id, map.course.id].sort((a, b) => a - b))
    expect(content.nodes.find((item) => item.id === node.id)?.sharedCourses).toEqual([home.course.id])
    expect((await getRoadmapContent(payload, home.roadmap.id)).courses.map((course) => course.id)).toEqual([home.course.id])
    expect((await payload.findByID({ collection: 'courses', id: home.course.id, depth: 0 })).roadmap).toBe(home.roadmap.id)
    expect(sharedRoadmapsByCourse(await getLearningCatalog(payload)).get(home.course.id)).toEqual([map.roadmap.id])
  })

  it('черновой курс и буткемп в карту не попадают, категория своих связей не держит', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const map = await createCourseTree(payload, { lessons: 1 })
    await payload.update({ collection: 'courses', id: home.course.id, data: { isPublished: false } })
    await topic(map.roadmap.id, { sharedCourses: [home.course.id] })
    const other = await createCourseTree(payload, { lessons: 1 })
    await topic(map.roadmap.id, { nodeType: 'category', sharedCourses: [other.course.id] })

    expect((await getRoadmapContent(payload, map.roadmap.id)).courses.map((course) => course.id)).toEqual([map.course.id])
    expect(sharedRoadmapsByCourse(await getLearningCatalog(payload)).has(other.course.id)).toBe(false)
  })

  it('удаление курса убирает его из тем других роадмапов', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const map = await createCourseTree(payload, { lessons: 1 })
    const node = await topic(map.roadmap.id, { sharedCourses: [home.course.id] })

    await payload.delete({ collection: 'lessons', id: home.lessons[0].id })
    await payload.delete({ collection: 'sections', id: home.section.id })
    await payload.delete({ collection: 'courses', id: home.course.id })

    expect((await payload.findByID({ collection: 'roadmap-nodes', id: node.id, depth: 0 })).sharedCourses).toEqual([])
  })
})

describe('доступ через тему другого роадмапа', () => {
  it('назначение на тему открывает урок и каталогом, и точечной проверкой', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const map = await createCourseTree(payload, { lessons: 1 })
    const node = await topic(map.roadmap.id, { sharedCourses: [home.course.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned' })
    const token = await login(payload, learner)

    expect((await rest('GET', `/lessons/${home.lessons[0].id}`, { token })).status).toBe(404)
    expect(await canAccessLesson(payload, learner, home.lessons[0].id)).toBe(false)

    await assign(learner, 'roadmap-nodes', node.id)
    expect((await rest('GET', `/lessons/${home.lessons[0].id}`, { token })).status).toBe(200)
    expect(await canAccessLesson(payload, learner, home.lessons[0].id)).toBe(true)
    // Сосед по чужой карте закрыт: назначена тема, а не вся карта.
    expect((await rest('GET', `/lessons/${map.lessons[0].id}`, { token })).status).toBe(404)
  })

  it('назначение на чужую карту открывает курс, запрет в ней не отнимает выданный курс', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const map = await createCourseTree(payload, { lessons: 1 })
    const node = await topic(map.roadmap.id, { sharedCourses: [home.course.id] })
    const byRoadmap = await createStudent(payload, { learningAccessMode: 'assigned' })
    await assign(byRoadmap, 'roadmaps', map.roadmap.id)
    expect(await canAccessLesson(payload, byRoadmap, home.lessons[0].id)).toBe(true)

    const byCourse = await createStudent(payload, { learningAccessMode: 'assigned' })
    await assign(byCourse, 'courses', home.course.id)
    await assign(byCourse, 'roadmap-nodes', node.id, 'deny')
    expect(await canAccessLesson(payload, byCourse, home.lessons[0].id)).toBe(true)
  })

  it('неопубликованная карта темы ничего не открывает и в точечной проверке', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const draft = await createCourseTree(payload, { lessons: 1, published: false })
    const node = await topic(draft.roadmap.id, { sharedCourses: [home.course.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'assigned' })
    await assign(learner, 'roadmap-nodes', node.id)

    expect(await canAccessLesson(payload, learner, home.lessons[0].id)).toBe(false)
    const access = await getLearningAccess(payload, learner, await createLocalReq({ user: learner }, payload))
    expect(access.canAccessCourse(home.course.id)).toBe(false)
  })

  it('курс, ставший буткемпом уже в теме, закрыт и каталогом, и точечной проверкой', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const map = await createCourseTree(payload, { lessons: 1 })
    const node = await topic(map.roadmap.id, { sharedCourses: [home.course.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'assigned' })
    await assign(learner, 'roadmap-nodes', node.id)
    expect(await canAccessLesson(payload, learner, home.lessons[0].id)).toBe(true)

    await payload.update({ collection: 'courses', id: home.course.id, data: { isBootcamp: true } as never })

    expect(await canAccessLesson(payload, learner, home.lessons[0].id)).toBe(false)
    const access = await getLearningAccess(payload, learner, await createLocalReq({ user: learner }, payload))
    expect(access.canAccessCourse(home.course.id)).toBe(false)
  })

  it('ученик не читает и не ищет состав темы, админ получает', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const map = await createCourseTree(payload, { lessons: 1 })
    const node = await topic(map.roadmap.id, { course: map.course.id, sharedCourses: [home.course.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'all', learningCatalogVisibility: 'catalog' })
    const token = await login(payload, learner)

    const visible = await rest('GET', `/roadmap-nodes/${node.id}?depth=2`, { token })
    expect(visible.status).toBe(200)
    expect(visible.json).not.toHaveProperty('sharedCourses')
    expect((await rest('GET', `/roadmap-nodes?where[sharedCourses][equals]=${home.course.id}&depth=0`, { token })).status).toBe(400)
    expect((await rest('GET', `/roadmap-nodes/${node.id}`, { token: await login(payload, admin) })).json).toMatchObject({ sharedCourses: [home.course.id] })
  })

  it('буткемп в список курсов других роадмапов не проходит', async () => {
    const map = await createCourseTree(payload, { lessons: 1 })
    const camp = await payload.create({ collection: 'courses', data: { title: uid('Буткемп'), roadmap: map.roadmap.id, isPublished: true, isBootcamp: true } as never })
    const node = await topic(map.roadmap.id)

    await expect(payload.update({ collection: 'roadmap-nodes', id: node.id, data: { sharedCourses: [camp.id] }, user: admin, overrideAccess: false }))
      .rejects.toMatchObject({ data: { errors: [expect.objectContaining({ path: 'sharedCourses' })] } })
  })
})

describe('завершение карты с курсом другого роадмапа', () => {
  it('бонус и сертификат карты ждут чужой курс, один урок завершает обе карты', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const map = await createCourseTree(payload, { lessons: 1 })
    await topic(map.roadmap.id, { sharedCourses: [home.course.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'all' })

    await finish(learner, map.lessons[0].id)
    expect(await roadmapBonuses(learner)).toEqual([])

    await finish(learner, home.lessons[0].id)
    const both = [String(home.roadmap.id), String(map.roadmap.id)].sort()
    expect(await roadmapBonuses(learner)).toEqual(both)
    expect(await roadmapCertificates(learner)).toEqual(both)
  })

  it('чужой курс, пройденный раньше, закрывает карту её последним своим уроком', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const map = await createCourseTree(payload, { lessons: 1 })
    await topic(map.roadmap.id, { sharedCourses: [home.course.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'all' })

    await finish(learner, home.lessons[0].id)
    expect(await roadmapBonuses(learner)).toEqual([String(home.roadmap.id)])
    await finish(learner, map.lessons[0].id)
    expect(await roadmapBonuses(learner)).toEqual([String(home.roadmap.id), String(map.roadmap.id)].sort())
  })

  it('чужой курс с закрытой картой или только по назначению завершению не мешает', async () => {
    const hidden = await createCourseTree(payload, { lessons: 1 })
    await payload.update({ collection: 'roadmaps', id: hidden.roadmap.id, data: { isPublished: false } })
    const paid = await createCourseTree(payload, { lessons: 1 })
    await payload.update({ collection: 'courses', id: paid.course.id, data: { assignedOnly: true } })
    const map = await createCourseTree(payload, { lessons: 1 })
    await topic(map.roadmap.id, { sharedCourses: [hidden.course.id, paid.course.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'all' })

    await finish(learner, map.lessons[0].id)
    expect(await roadmapBonuses(learner)).toEqual([String(map.roadmap.id)])
  })
})

describe('завершение карты без своих открытых курсов', () => {
  const emptyRoadmap = () => payload.create({ collection: 'roadmaps', data: { title: uid('Карта'), slug: uid('roadmap'), isPublished: true } })

  it('карта только из общих курсов завершается ими', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const map = await emptyRoadmap()
    await topic(map.id, { sharedCourses: [home.course.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'all' })

    await finish(learner, home.lessons[0].id)
    expect(await roadmapBonuses(learner)).toEqual([String(home.roadmap.id), String(map.id)].sort())
  })

  it('карта из своих курсов только по назначению общим курсом не завершается', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const paid = await createCourseTree(payload, { lessons: 1 })
    await payload.update({ collection: 'courses', id: paid.course.id, data: { assignedOnly: true } })
    await topic(paid.roadmap.id, { sharedCourses: [home.course.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'all' })

    await finish(learner, home.lessons[0].id)
    expect(await roadmapBonuses(learner)).toEqual([String(home.roadmap.id)])
    expect(await roadmapCertificates(learner)).toEqual([String(home.roadmap.id)])
  })

  it('карта, скрытая запретом темы, не попадает в бонус и сертификат', async () => {
    const home = await createCourseTree(payload, { lessons: 1 })
    const map = await emptyRoadmap()
    const node = await topic(map.id, { sharedCourses: [home.course.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned' })
    await assign(learner, 'courses', home.course.id)
    await assign(learner, 'roadmap-nodes', node.id, 'deny')

    await finish(learner, home.lessons[0].id)
    expect(await roadmapBonuses(learner)).toEqual([String(home.roadmap.id)])
    expect(await roadmapCertificates(learner)).toEqual([String(home.roadmap.id)])
  })
})

describe('буткемп в темах нескольких роадмапов', () => {
  it('виден на обеих картах и не входит в их прогресс', async () => {
    const first = await createCourseTree(payload, { lessons: 1 })
    const second = await createCourseTree(payload, { lessons: 1 })
    const camp = await payload.create({ collection: 'courses', data: { title: uid('Буткемп'), slug: uid('camp'), roadmap: first.roadmap.id, isPublished: true, isBootcamp: true } as never })
    const firstTopic = await topic(first.roadmap.id, { bootcamps: [camp.id] })
    const secondTopic = await topic(second.roadmap.id, { bootcamps: [camp.id] })
    const learner = await createStudent(payload, { learningAccessMode: 'all', learningCatalogVisibility: 'catalog' })
    const req = await createLocalReq({ user: learner }, payload)
    const access = await getLearningAccess(payload, learner, req)

    for (const [roadmap, node] of [[first.roadmap.id, firstTopic.id], [second.roadmap.id, secondTopic.id]]) {
      const content = await getRoadmapContent(payload, roadmap)
      const extras = await getRoadmapNodeExtras(payload, learner, access, content.nodes, req)
      expect(extras.get(node)?.map((extra) => extra.key)).toEqual([`bootcamp-${camp.id}`])
      expect(content.courses.map((course) => course.id)).not.toContain(camp.id)
    }
  })
})
