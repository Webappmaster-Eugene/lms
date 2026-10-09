import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import type { LearningTargetCollection } from '@/lib/learning-access'
import { getLearningAccess } from '@/server/learning-access'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, uid, type CourseTree, type TestUser } from './helpers/payload'

let payload: Payload
let admin: TestUser
let learner: TestUser
let token: string
let tree: CourseTree
let other: CourseTree
let hiddenSectionId: number
let hiddenLessonId: number
let hiddenCourseId: number
let visibleNodeId: number
let anotherVisibleNodeId: number
let hiddenNodeId: number
let categoryId: number
let visibleEdgeId: number
let hiddenEdgeId: number

async function grant(collection: LearningTargetCollection, id: number, effect: 'allow' | 'deny' = 'allow', expiresAt?: string) {
  return payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: learner.id, target: { relationTo: collection, value: id }, effect, ruleKey: 'server-generated', ...(expiresAt ? { expiresAt } : {}) } })
}
async function read(collection: string, id: number, suffix = '?depth=3') {
  return rest('GET', `/${collection}/${id}${suffix}`, { token })
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  tree = await createCourseTree(payload, { lessons: 2 })
  other = await createCourseTree(payload)
  const hiddenSection = await payload.create({ collection: 'sections', data: { course: tree.course.id, title: 'Секретный соседний раздел', slug: uid('private-section'), isPublished: true } })
  hiddenSectionId = hiddenSection.id
  hiddenLessonId = (await payload.create({ collection: 'lessons', data: { course: tree.course.id, section: hiddenSection.id, title: 'Секретный соседний урок', slug: uid('private-lesson'), isPublished: true } })).id
  hiddenCourseId = (await payload.create({ collection: 'courses', data: { roadmap: tree.roadmap.id, title: 'Секретный соседний курс', slug: uid('private-course'), isPublished: true } })).id
  await payload.update({ collection: 'courses', id: tree.course.id, data: { prerequisites: [hiddenCourseId] } })
  const node = async (label: string, course?: number, nodeType: 'topic' | 'category' = 'topic') => payload.create({ collection: 'roadmap-nodes', data: { roadmap: tree.roadmap.id, nodeId: uid('visible-node'), label, nodeType, course, positionX: 0, positionY: 0 } })
  visibleNodeId = (await node('Тема назначенного курса', tree.course.id)).id
  anotherVisibleNodeId = (await node('Вторая тема назначенного курса', tree.course.id)).id
  hiddenNodeId = (await node('Секретная тема', hiddenCourseId)).id
  categoryId = (await node('Секретная неназначенная категория', undefined, 'category')).id
  visibleEdgeId = (await payload.create({ collection: 'roadmap-edges', data: { roadmap: tree.roadmap.id, edgeId: uid('visible-edge'), source: visibleNodeId, target: anotherVisibleNodeId } })).id
  hiddenEdgeId = (await payload.create({ collection: 'roadmap-edges', data: { roadmap: tree.roadmap.id, edgeId: uid('hidden-edge'), source: visibleNodeId, target: hiddenNodeId } })).id
})
beforeEach(async () => {
  learner = await createStudent(payload, { learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned', trainerAccessMode: 'assigned' })
  token = await login(payload, learner)
})

describe('персональная видимость через настоящую БД, REST и Local API', () => {
  it('без назначений не выдаёт ни заголовки, ни числа, ни связи через ID/select/depth/find', async () => {
    for (const [collection, id] of [['courses', tree.course.id], ['roadmaps', tree.roadmap.id], ['sections', tree.section.id], ['lessons', tree.lessons[0].id], ['roadmap-nodes', visibleNodeId], ['roadmap-edges', visibleEdgeId]] as const) {
      expect((await read(collection, id)).status, collection).toBe(404)
      const list = await rest('GET', `/${collection}?where[id][equals]=${id}&depth=4&select[title]=true&select[label]=true`, { token })
      expect(list.status, collection).toBe(200)
      expect(list.json.docs, collection).toEqual([])
      expect(list.json.totalDocs, collection).toBe(0)
    }
    await expect(payload.findByID({ collection: 'courses', id: tree.course.id, user: learner, overrideAccess: false })).rejects.toMatchObject({ status: 404 })
  })

  it('назначение одного урока оставляет родителей и его темы, но скрывает соседние уроки, разделы, курс и края графа', async () => {
    await grant('lessons', tree.lessons[0].id)
    for (const [collection, id] of [['courses', tree.course.id], ['roadmaps', tree.roadmap.id], ['sections', tree.section.id], ['lessons', tree.lessons[0].id], ['roadmap-nodes', visibleNodeId], ['roadmap-edges', visibleEdgeId]] as const) expect((await read(collection, id)).status, collection).toBe(200)
    for (const [collection, id] of [['courses', hiddenCourseId], ['roadmaps', other.roadmap.id], ['sections', hiddenSectionId], ['lessons', tree.lessons[1].id], ['lessons', hiddenLessonId], ['roadmap-nodes', hiddenNodeId], ['roadmap-nodes', categoryId], ['roadmap-edges', hiddenEdgeId]] as const) expect((await read(collection, id)).status, collection).toBe(404)
    const lesson = await read('lessons', tree.lessons[0].id, '?depth=4')
    const serialized = JSON.stringify(lesson.json)
    for (const title of [tree.lessons[1].title, 'Секретный соседний раздел', 'Секретный соседний курс', 'Секретная тема']) expect(serialized).not.toContain(title)
    const lessons = await rest('GET', `/lessons?where[course][equals]=${tree.course.id}&depth=4`, { token })
    expect(lessons.json.totalDocs).toBe(1)
    expect(lessons.json.docs).toMatchObject([{ id: tree.lessons[0].id }])
    const nodes = await rest('GET', `/roadmap-nodes?where[roadmap][equals]=${tree.roadmap.id}&depth=4`, { token })
    expect(nodes.json.totalDocs).toBe(2)
    expect(JSON.stringify(nodes.json)).not.toContain('Секретная')
  })

  it('поиск названия закрытого курса, урока, раздела, темы и роадмапа возвращает ноль результатов', async () => {
    await grant('lessons', tree.lessons[0].id)
    for (const [collection, field, title] of [['courses', 'title', 'Секретный соседний курс'], ['lessons', 'title', 'Секретный соседний урок'], ['sections', 'title', 'Секретный соседний раздел'], ['roadmap-nodes', 'label', 'Секретная тема'], ['roadmaps', 'title', other.roadmap.title]] as const) {
      const response = await rest('GET', `/${collection}?where[${field}][contains]=${encodeURIComponent(title)}&depth=3`, { token })
      expect(response.status).toBe(200)
      expect(response.json.docs, collection).toEqual([])
      expect(response.json.totalDocs, collection).toBe(0)
      expect(JSON.stringify(response.json)).not.toContain(title)
    }
  })

  it('открытый роадмап с исключением курса не раскрывает закрытый курс, его разделы и темы', async () => {
    await grant('roadmaps', tree.roadmap.id)
    await grant('courses', tree.course.id, 'deny')
    expect((await read('roadmaps', tree.roadmap.id)).status).toBe(200)
    expect((await read('courses', hiddenCourseId)).status).toBe(200)
    for (const [collection, id] of [['courses', tree.course.id], ['sections', tree.section.id], ['lessons', tree.lessons[0].id], ['roadmap-nodes', visibleNodeId], ['roadmap-edges', visibleEdgeId]] as const) expect((await read(collection, id)).status, collection).toBe(404)
    const scope = await getLearningAccess(payload, learner)
    expect(scope.canBrowseCourse(tree.course.id)).toBe(false)
    expect(scope.canBrowseNode(visibleNodeId)).toBe(false)
  })

  it('истёкшее и будущее назначения скрыты до начала; отзыв действует даже для старого JWT', async () => {
    const assignment = await grant('courses', tree.course.id, 'allow', new Date(Date.now() - 1000).toISOString())
    expect((await read('courses', tree.course.id)).status).toBe(404)
    const req = await createLocalReq({ user: admin }, payload)
    await payload.update({ collection: 'learning-access-grants', id: assignment.id, req, data: { expiresAt: null, startsAt: new Date(Date.now() + 60000).toISOString() } })
    expect((await read('courses', tree.course.id)).status).toBe(404)
    await payload.update({ collection: 'learning-access-grants', id: assignment.id, req, data: { startsAt: null } })
    expect((await read('courses', tree.course.id)).status).toBe(200)
    await payload.update({ collection: 'learning-access-grants', id: assignment.id, req, data: { effect: 'deny' } })
    expect((await read('courses', tree.course.id)).status).toBe(404)
    expect((await read('sections', tree.section.id)).status).toBe(404)
  })

  it('режим каталога сохраняет закрытые метаданные, но содержание урока остаётся запрещено', async () => {
    await payload.update({ collection: 'users', id: learner.id, req: await createLocalReq({ user: admin }, payload), data: { learningCatalogVisibility: 'catalog' } })
    for (const [collection, id] of [['courses', tree.course.id], ['roadmaps', tree.roadmap.id], ['sections', tree.section.id], ['roadmap-nodes', categoryId], ['roadmap-edges', hiddenEdgeId]] as const) expect((await read(collection, id)).status, collection).toBe(200)
    expect((await read('lessons', tree.lessons[0].id)).status).toBe(404)
  })
})
