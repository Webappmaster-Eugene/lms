import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import type { LearningTargetCollection } from '@/lib/learning-access'
import { lexical } from './helpers/fixtures'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, uid, type CourseTree, type TestUser } from './helpers/payload'

const TEXT = {
  course: 'Описание всего курса с перечнем недель',
  section: 'Описание первой недели',
  secondSection: 'Описание второй недели',
  topic: 'Описание темы назначенного курса',
  bullet: 'Подтема назначенного курса',
  sharedTopic: 'Описание темы с соседним курсом',
  category: 'Описание категории всей карты',
  roadmap: 'Описание всей карты',
  closedCourse: 'Описание курса только по назначению',
  closedSection: 'Описание раздела курса только по назначению',
}

let payload: Payload
let admin: TestUser
let learner: TestUser
let token: string
let tree: CourseTree
let closed: CourseTree
let secondSectionId: number
let secondLessonId: number
let neighbourCourseId: number
let topicId: number
let sharedTopicId: number
let categoryId: number

async function grant(collection: LearningTargetCollection, id: number, effect: 'allow' | 'deny' = 'allow') {
  await payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: learner.id, target: { relationTo: collection, value: id }, effect, ruleKey: 'server-generated' } })
}

async function get(path: string): Promise<{ status: number; json: Record<string, unknown> }> {
  return rest('GET', path, { token })
}

/** Описание через REST: undefined — документ не выдан вовсе, null — выдан без описания. */
async function description(collection: string, id: number): Promise<string | null | undefined> {
  const response = await get(`/${collection}/${id}?depth=0`)
  if (response.status === 404) return undefined
  expect(response.status, `${collection}/${id}`).toBe(200)
  const value = response.json.description
  if (value == null) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

async function bullets(id: number): Promise<unknown> {
  return (await get(`/roadmap-nodes/${id}?depth=0`)).json.bullets
}

/** Тот же запрос, которым страница курса читает разделы: Local API с правами ученика. */
async function pageSections(courseId: number): Promise<Record<number, string | null | undefined>> {
  const req = await createLocalReq({ user: learner }, payload)
  const result = await payload.find({ collection: 'sections', where: { course: { equals: courseId }, isPublished: { equals: true } }, select: { title: true, order: true, description: true }, depth: 0, overrideAccess: false, req })
  return Object.fromEntries(result.docs.map((section) => [section.id, section.description]))
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  tree = await createCourseTree(payload, { lessons: 1 })
  await payload.update({ collection: 'roadmaps', id: tree.roadmap.id, data: { description: lexical(TEXT.roadmap) } })
  await payload.update({ collection: 'courses', id: tree.course.id, data: { description: lexical(TEXT.course) } })
  await payload.update({ collection: 'sections', id: tree.section.id, data: { description: TEXT.section, order: 1 } })
  secondSectionId = (await payload.create({ collection: 'sections', data: { course: tree.course.id, title: 'Вторая неделя', slug: uid('week-2'), description: TEXT.secondSection, order: 2, isPublished: true } })).id
  secondLessonId = (await payload.create({ collection: 'lessons', data: { course: tree.course.id, section: secondSectionId, title: 'Урок второй недели', slug: uid('week-2-lesson'), isPublished: true } })).id
  neighbourCourseId = (await payload.create({ collection: 'courses', data: { roadmap: tree.roadmap.id, title: 'Соседний курс', slug: uid('neighbour'), isPublished: true } })).id
  const node = async (label: string, data: Record<string, unknown>) => (await payload.create({ collection: 'roadmap-nodes', data: { roadmap: tree.roadmap.id, nodeId: uid('node'), label, nodeType: 'topic', positionX: 0, positionY: 0, ...data } })).id
  topicId = await node('Тема курса', { course: tree.course.id, description: TEXT.topic, bullets: [{ text: TEXT.bullet }] })
  // Курс относится и к теме соседнего курса: её текст может перечислять неназначенное.
  sharedTopicId = await node('Тема с соседним курсом', { course: neighbourCourseId, description: TEXT.sharedTopic })
  await payload.update({ collection: 'courses', id: tree.course.id, data: { roadmapNode: sharedTopicId } })
  categoryId = await node('Категория карты', { nodeType: 'category', description: TEXT.category })

  closed = await createCourseTree(payload, { lessons: 1 })
  await payload.update({ collection: 'courses', id: closed.course.id, data: { assignedOnly: true, description: lexical(TEXT.closedCourse) } })
  await payload.update({ collection: 'sections', id: closed.section.id, data: { description: TEXT.closedSection } })
})

beforeEach(async () => {
  learner = await createStudent(payload, { learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned', trainerAccessMode: 'assigned' })
  token = await login(payload, learner)
})

describe('описания при скрытом каталоге: REST и Local API на настоящей БД', () => {
  it('назначенный урок оставляет названия родителей, но не их описания', async () => {
    await grant('lessons', tree.lessons[0].id)
    expect(await description('courses', tree.course.id)).toBeNull()
    expect(await description('sections', tree.section.id)).toBeNull()
    expect(await description('sections', secondSectionId)).toBeUndefined()
    expect(await description('roadmap-nodes', sharedTopicId)).toBeNull()
    expect(await description('roadmaps', tree.roadmap.id)).toBeNull()
    expect(await pageSections(tree.course.id)).toEqual({ [tree.section.id]: null })
    const lesson = await get(`/lessons/${tree.lessons[0].id}?depth=2`)
    expect(lesson.status).toBe(200)
    expect(JSON.stringify(lesson.json)).not.toContain(TEXT.section)
    expect(JSON.stringify(lesson.json)).not.toContain(TEXT.course)
  })

  it('назначенный раздел показывает своё описание, но не описание курса', async () => {
    await grant('sections', tree.section.id)
    expect(await description('sections', tree.section.id)).toBe(TEXT.section)
    expect(await description('courses', tree.course.id)).toBeNull()
    expect(await description('sections', secondSectionId)).toBeUndefined()
    expect(await pageSections(tree.course.id)).toEqual({ [tree.section.id]: TEXT.section })
  })

  it('курс целиком показывает описания курса, разделов и своей темы, но не темы с соседним курсом и не карты', async () => {
    await grant('courses', tree.course.id)
    expect(await description('courses', tree.course.id)).toContain(TEXT.course)
    expect(await pageSections(tree.course.id)).toEqual({ [tree.section.id]: TEXT.section, [secondSectionId]: TEXT.secondSection })
    expect(await description('roadmap-nodes', topicId)).toBe(TEXT.topic)
    expect(await bullets(topicId)).toMatchObject([{ text: TEXT.bullet }])
    expect(await description('roadmap-nodes', sharedTopicId)).toBeNull()
    expect(await bullets(sharedTopicId)).toEqual([])
    expect(await description('roadmaps', tree.roadmap.id)).toBeNull()
    expect(await description('roadmap-nodes', categoryId)).toBeUndefined()
    const lesson = await get(`/lessons/${tree.lessons[0].id}?depth=2`)
    expect(JSON.stringify(lesson.json)).toContain(TEXT.section)
  })

  it('исключённый урок делает курс и свой раздел доступными не целиком', async () => {
    await grant('courses', tree.course.id)
    await grant('lessons', secondLessonId, 'deny')
    expect(await description('courses', tree.course.id)).toBeNull()
    expect(await pageSections(tree.course.id)).toEqual({ [tree.section.id]: TEXT.section, [secondSectionId]: null })
    expect(await description('roadmap-nodes', topicId)).toBeNull()
  })

  it('карта целиком открывает описания карты и категории, исключение курса их снова скрывает', async () => {
    await grant('roadmaps', tree.roadmap.id)
    expect(await description('roadmaps', tree.roadmap.id)).toContain(TEXT.roadmap)
    expect(await description('roadmap-nodes', categoryId)).toBe(TEXT.category)
    expect(await description('roadmap-nodes', sharedTopicId)).toBe(TEXT.sharedTopic)
    await grant('courses', neighbourCourseId, 'deny')
    expect(await description('roadmaps', tree.roadmap.id)).toBeNull()
    expect(await description('roadmap-nodes', categoryId)).toBeNull()
    expect(await description('roadmap-nodes', sharedTopicId)).toBeNull()
    expect(await description('roadmap-nodes', topicId)).toBe(TEXT.topic)
    expect(await description('courses', tree.course.id)).toContain(TEXT.course)
  })

  it('курс только по назначению, назначенный целиком, показывает описания курса и разделов', async () => {
    await grant('courses', closed.course.id)
    expect(await description('courses', closed.course.id)).toContain(TEXT.closedCourse)
    expect(await pageSections(closed.course.id)).toEqual({ [closed.section.id]: TEXT.closedSection })
  })

  it('общий каталог показывает описания назначенного фрагмента как раньше', async () => {
    await payload.update({ collection: 'users', id: learner.id, req: await createLocalReq({ user: admin }, payload), data: { learningCatalogVisibility: 'catalog' } })
    await grant('lessons', tree.lessons[0].id)
    expect(await description('courses', tree.course.id)).toContain(TEXT.course)
    expect(await pageSections(tree.course.id)).toEqual({ [tree.section.id]: TEXT.section, [secondSectionId]: TEXT.secondSection })
    expect(await description('roadmap-nodes', sharedTopicId)).toBe(TEXT.sharedTopic)
  })
})
