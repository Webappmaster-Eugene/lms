import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'

import { canAccessLesson, getLearningAccess } from '@/server/learning-access'
import { resolveLessonVideoSource } from '@/server/lesson-video-access'
import { isRoadmapCompleted } from '@/lib/course-completion'
import { notificationLinkIsVisible } from '@/server/notification-visibility'
import type { LearningTargetCollection } from '@/lib/learning-access'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, type CourseTree, type TestUser } from '../helpers/payload'

/**
 * Курс «только по назначению» — методички платного потока. Ученик с режимом «все
 * курсы» и открытым каталогом не должен ни прочитать урок, ни увидеть программу,
 * ни получить файл урока, пока ему не выдали курс.
 */
const PDF = 'https://disk.yandex.com/d/bootcamp-fixture/manual.pdf'
const SVG = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`
const MARKDOWN = `## Теория\n\n| Код | Смысл |\n|---|---|\n| 409 | конфликт |\n\n![Схема 1](${SVG})\n\n\`\`\`ts\nconst x = 1\n\`\`\`\n`

let payload: Payload
let closed: CourseTree
let open: CourseTree
let admin: TestUser
let everyone: TestUser
let everyoneToken: string
let adminToken: string

async function assign(user: TestUser, target: LearningTargetCollection, id: number, effect: 'allow' | 'deny' = 'allow') {
  const req = await createLocalReq({ user: admin }, payload)
  return payload.create({ collection: 'learning-access-grants', req, data: { user: user.id, target: { relationTo: target, value: id }, effect, ruleKey: 'server-generated' } })
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  everyone = await createStudent(payload, { learningAccessMode: 'all', learningCatalogVisibility: 'catalog' })
  everyoneToken = await login(payload, everyone)
  adminToken = await login(payload, admin)
  closed = await createCourseTree(payload, { lessons: 2 })
  open = await createCourseTree(payload, { lessons: 1 })
  const saved = await rest('PATCH', `/courses/${closed.course.id}`, { token: adminToken, body: { assignedOnly: true } })
  expect(saved.status).toBe(200)
  const lesson = await rest('PATCH', `/lessons/${closed.lessons[0].id}`, { token: adminToken, body: { content: [
    { id: 'manual', blockType: 'markdown', markdown: MARKDOWN, source: 'nodejs-bootcamp 08-outbox theory v0.1.1' },
    { id: 'pdf', blockType: 'slides', title: 'PDF', items: [{ url: PDF }] },
  ] } })
  expect(lesson.status).toBe(200)
})

describe('блок markdown хранится как есть', () => {
  it('REST администратора возвращает текст со схемой и источник без изменений', async () => {
    const read = await rest('GET', `/lessons/${closed.lessons[0].id}?depth=0`, { token: adminToken })
    expect(read.status).toBe(200)
    expect(read.json.content).toEqual(expect.arrayContaining([expect.objectContaining({ blockType: 'markdown', markdown: MARKDOWN, source: 'nodejs-bootcamp 08-outbox theory v0.1.1' })]))
  })

  it('пустой текст не сохраняется', async () => {
    const result = await rest('PATCH', `/lessons/${open.lessons[0].id}`, { token: adminToken, body: { content: [{ blockType: 'markdown', markdown: '' }] } })
    expect(result.status).toBe(400)
  })
})

describe('курс только по назначению', () => {
  it('режим «все курсы» не читает урок, курс и программу, другие курсы открыты', async () => {
    expect((await rest('GET', `/lessons/${closed.lessons[0].id}`, { token: everyoneToken })).status).toBe(404)
    expect((await rest('GET', `/lessons?where[course][equals]=${closed.course.id}`, { token: everyoneToken })).json.docs).toEqual([])
    expect((await rest('GET', `/courses/${closed.course.id}`, { token: everyoneToken })).status).toBe(404)
    expect((await rest('GET', `/sections?where[course][equals]=${closed.course.id}`, { token: everyoneToken })).json.docs).toEqual([])
    const access = await getLearningAccess(payload, everyone)
    expect(access.browseCourseIds).not.toContain(closed.course.id)
    expect(access.canBrowseLessonMetadata({ id: closed.lessons[1].id, course: closed.course.id, section: closed.section.id, isPublished: true })).toBe(false)
    expect(await canAccessLesson(payload, everyone, closed.lessons[0].id)).toBe(false)
    expect((await rest('GET', `/lessons/${open.lessons[0].id}`, { token: everyoneToken })).status).toBe(200)
  })

  it('уведомление со ссылкой на закрытый курс или урок не раскрывает их при открытом каталоге', async () => {
    expect(await notificationLinkIsVisible(payload, everyone.id, `/courses/${closed.course.slug}`)).toBe(false)
    expect(await notificationLinkIsVisible(payload, everyone.id, `/lessons/${closed.lessons[0].slug}`)).toBe(false)
    expect(await notificationLinkIsVisible(payload, everyone.id, `/courses/${open.course.slug}`)).toBe(true)
  })

  it('файл урока закрыт так же, как текст', async () => {
    const params = new URLSearchParams({ lesson: String(closed.lessons[0].id), block: 'pdf', asset: 'any' })
    await expect(resolveLessonVideoSource(payload, everyone, params, true)).rejects.toMatchObject({ status: 403 })
  })

  it('назначение на всю карту курс не открывает', async () => {
    const roadmapGrant = await assign(everyone, 'roadmaps', closed.roadmap.id)
    expect(await canAccessLesson(payload, everyone, closed.lessons[0].id)).toBe(false)
    expect((await rest('GET', `/lessons/${closed.lessons[0].id}`, { token: everyoneToken })).status).toBe(404)
    await payload.delete({ collection: 'learning-access-grants', id: roadmapGrant.id, req: await createLocalReq({ user: admin }, payload) })
  })

  it('назначение курса открывает текст, программу и файл, запрет снова закрывает', async () => {
    const grant = await assign(everyone, 'courses', closed.course.id)
    const read = await rest('GET', `/lessons/${closed.lessons[0].id}?depth=0`, { token: everyoneToken })
    expect(read.status).toBe(200)
    expect(read.json.content).toEqual(expect.arrayContaining([expect.objectContaining({ blockType: 'markdown', markdown: MARKDOWN })]))
    expect(JSON.stringify(read.json)).not.toContain(PDF)
    expect((await rest('GET', `/courses/${closed.course.id}`, { token: everyoneToken })).status).toBe(200)
    const params = new URLSearchParams({ lesson: String(closed.lessons[0].id), block: 'pdf', asset: new URL(String((read.json.content as { blockType: string; items?: { url: string }[] }[]).find((block) => block.blockType === 'slides')?.items?.[0]?.url), 'https://lms.test').searchParams.get('asset') ?? '' })
    expect(await resolveLessonVideoSource(payload, everyone, params, true)).toMatchObject({ kind: 'yandex' })
    // У пары «ученик — курс» одно правило: запрет — это то же назначение с другим действием.
    await payload.update({ collection: 'learning-access-grants', id: grant.id, data: { effect: 'deny' }, req: await createLocalReq({ user: admin }, payload) })
    expect((await rest('GET', `/lessons/${closed.lessons[0].id}`, { token: everyoneToken })).status).toBe(404)
    expect(await canAccessLesson(payload, everyone, closed.lessons[0].id)).toBe(false)
    await payload.delete({ collection: 'learning-access-grants', id: grant.id, req: await createLocalReq({ user: admin }, payload) })
  })
})

describe('общая программа роадмапа', () => {
  it('закрытый курс в той же карте не мешает закончить её остальные курсы', async () => {
    const learner = await createStudent(payload, { learningAccessMode: 'all', learningCatalogVisibility: 'catalog' })
    const extra = await payload.create({ collection: 'courses', data: { title: 'Методички потока', slug: `closed-in-open-${learner.id}`, roadmap: open.roadmap.id, isPublished: true, assignedOnly: true } })
    await payload.create({ collection: 'lessons', data: { title: 'Методичка', slug: `closed-lesson-${learner.id}`, course: extra.id, isPublished: true } })
    await payload.create({ collection: 'user-progress', data: { user: learner.id, lesson: open.lessons[0].id, isCompleted: true }, overrideAccess: true })
    const req = await createLocalReq({ user: admin }, payload)
    expect(await isRoadmapCompleted(req, learner.id, String(open.roadmap.id))).toBe(true)
  })
})
