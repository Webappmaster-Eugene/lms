import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, handleEndpoints, type Payload } from 'payload'
import config from '@payload-config'

import { TRAINER_CATALOG } from '@/data/trainer'
import type { LearningTargetCollection } from '@/lib/learning-access'
import { createLmsClient } from '../../scripts/lib/lms-rest'
import { buildLesson, openExampleRunner, readLessons, readManifest, sqlTaskLinks } from '../../scripts/lib/sql-course'
import { publishSqlCourse, publishSqlTrainer, type BuiltCourse } from '../../scripts/lib/sql-publish'
import { createAdmin, createStudent, getTestPayload, login, rest, type TestUser } from './helpers/payload'

/**
 * Скрипты публикации SQL-курса работают с настоящей схемой Payload через тот же REST,
 * что на проде: поля задач и тем, markdown-блок урока, закрытость по назначению.
 */

let payload: Payload
let admin: TestUser
const silent = () => {}
// Первая тема каталога и два раздела курса, которые на неё ссылаются: весь курс здесь не нужен.
const topics = TRAINER_CATALOG.filter((topic) => topic.slug === 'sql-select')
const lms = () => createLmsClient({ base: 'http://lms.test', email: admin.email, password: admin.password, minIntervalMs: 0, log: silent, fetch: (async (input, init) => handleEndpoints({ config, request: new Request(input, init) })) as typeof fetch })

async function grant(userId: number, target: LearningTargetCollection, value: number) {
  return payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: userId, target: { relationTo: target, value }, effect: 'allow', ruleKey: 'server-generated' } })
}

async function smallCourse(): Promise<BuiltCourse> {
  const full = readManifest()
  const manifest = { ...full, sections: full.sections.filter((section) => section.slug === 'sql-intro' || section.slug === 'sql-select').map((section) => ({ ...section, lessons: section.lessons.slice(0, section.slug === 'sql-select' ? 1 : 2) })) }
  const parts = readLessons(manifest)
  const runner = await openExampleRunner()
  const built = new Map<string, string>()
  try {
    for (const { lessons } of parts) for (const lesson of lessons) built.set(lesson.slug, await buildLesson(lesson, runner, sqlTaskLinks(topics)))
  } finally {
    await runner.close()
  }
  return { manifest, parts, built }
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  const roadmap = (await payload.find({ collection: 'roadmaps', where: { slug: { equals: 'backend-nodejs' } }, limit: 1 })).docs[0]
    ?? await payload.create({ collection: 'roadmaps', data: { title: 'Backend Node.js', slug: 'backend-nodejs', isPublished: true } })
  const node = await payload.find({ collection: 'roadmap-nodes', where: { roadmap: { equals: roadmap.id }, nodeId: { equals: 'be-sql' } }, limit: 1 })
  if (!node.docs.length) await payload.create({ collection: 'roadmap-nodes', data: { nodeId: 'be-sql', label: 'SQL и реляционные БД', nodeType: 'topic', roadmap: roadmap.id, positionX: 0, positionY: 0 } })
}, 120_000)

describe('публикация SQL-тренажёра и курса через REST', () => {
  it('темы и задачи создаются черновиками по назначению, повтор ничего не меняет, публикация открывает их только назначенным', async () => {
    const client = lms()
    await client.login()
    const planned = topics.length + topics.reduce((sum, topic) => sum + topic.tasks.length, 0)
    expect((await publishSqlTrainer(client, topics, { dryRun: true, publish: false, log: silent })).created).toBe(planned)
    expect((await payload.find({ collection: 'trainer-topics', where: { slug: { equals: 'sql-select' } } })).docs).toHaveLength(0)

    expect((await publishSqlTrainer(client, topics, { dryRun: false, publish: false, log: silent })).created).toBe(planned)
    const topic = (await payload.find({ collection: 'trainer-topics', where: { slug: { equals: 'sql-select' } }, depth: 0 })).docs[0]
    expect(topic).toMatchObject({ assignedOnly: true, isPublished: false, category: 'sql' })
    const task = (await payload.find({ collection: 'trainer-tasks', where: { slug: { equals: topics[0].tasks[0].slug } }, depth: 0 })).docs[0]
    expect(task).toMatchObject({ isPublished: false, checkMode: 'program', languages: ['sql'], sqlOrdered: topics[0].tasks[0].sqlOrdered === true })
    expect(task.runtimeCases?.filter((item) => item.hidden).length).toBeGreaterThan(0)
    expect(task.runtimeCases?.every((item) => item.expected && item.input)).toBe(true)

    expect(await publishSqlTrainer(client, topics, { dryRun: false, publish: false, log: silent })).toEqual({ created: 0, updated: 0, unchanged: planned })
    expect((await publishSqlTrainer(client, topics, { dryRun: false, publish: true, log: silent })).updated).toBe(planned)

    // Режим «весь тренажёр» закрытую тему не открывает, назначение открывает.
    const student = await createStudent(payload, { trainerAccessMode: 'all', learningCatalogVisibility: 'catalog' })
    const token = await login(payload, student)
    expect((await rest('GET', `/trainer-tasks?where[id][equals]=${task.id}`, { token })).json.docs).toEqual([])
    expect((await rest('GET', `/trainer-topics/${topic.id}`, { token })).status).toBe(404)
    await grant(student.id, 'trainer-topics', topic.id)
    expect((await rest('GET', `/trainer-tasks?where[id][equals]=${task.id}`, { token })).json.docs).toHaveLength(1)
    await client.logout()
  }, 300_000)

  it('курс создаётся закрытым на узле роадмапа, уроки одним markdown-блоком, повтор ничего не меняет', async () => {
    const client = lms()
    await client.login()
    const course = await smallCourse()
    const lessonCount = course.built.size
    expect(lessonCount).toBe(3)
    const first = await publishSqlCourse(client, course, { dryRun: false, publish: false, log: silent })
    expect(first.created).toBe(1 + course.parts.length + lessonCount)
    expect(await publishSqlCourse(client, course, { dryRun: false, publish: false, log: silent })).toEqual({ created: 0, updated: 0, unchanged: 1 + course.parts.length + lessonCount })

    const saved = (await payload.find({ collection: 'courses', where: { slug: { equals: course.manifest.slug } }, depth: 0 })).docs[0]
    expect(saved).toMatchObject({ assignedOnly: true, isPublished: false })
    const node = (await payload.find({ collection: 'roadmap-nodes', where: { nodeId: { equals: 'be-sql' } }, depth: 0 })).docs[0]
    expect(saved.roadmapNode).toBe(node.id)
    const lesson = (await payload.find({ collection: 'lessons', where: { slug: { equals: 'sql-select-columns' } }, depth: 0 })).docs[0]
    expect(lesson.content).toHaveLength(1)
    expect(lesson.content?.[0]).toMatchObject({ blockType: 'markdown', markdown: course.built.get('sql-select-columns') })

    await publishSqlCourse(client, course, { dryRun: false, publish: true, log: silent })
    const student = await createStudent(payload, { learningAccessMode: 'all', learningCatalogVisibility: 'catalog' })
    const token = await login(payload, student)
    expect((await rest('GET', `/courses?where[slug][equals]=${course.manifest.slug}`, { token })).json.docs).toEqual([])
    await grant(student.id, 'courses', saved.id)
    expect((await rest('GET', `/courses?where[slug][equals]=${course.manifest.slug}`, { token })).json.docs).toHaveLength(1)
    await client.logout()
  }, 300_000)

  it('не загружает задачи без ожидаемых таблиц и не публикует курс, пока задачи практики черновики', async () => {
    const client = lms()
    await client.login()
    const broken = topics.map((topic) => ({ ...topic, tasks: topic.tasks.map((task, index) => index === 0 ? { ...task, runtimeCases: task.runtimeCases?.map((item) => ({ ...item, expected: '' })) } : task) }))
    await expect(publishSqlTrainer(client, broken, { dryRun: true, publish: false, log: silent })).rejects.toThrow(/pnpm trainer:sql-expected/)

    const course = await smallCourse()
    const linked = course.parts.flatMap(({ lessons }) => lessons.flatMap((lesson) => lesson.tasks))[0]
    const task = (await payload.find({ collection: 'trainer-tasks', where: { slug: { equals: linked } }, depth: 0 })).docs[0]
    await payload.update({ collection: 'trainer-tasks', id: task.id, data: { isPublished: false } })
    try {
      await expect(publishSqlCourse(client, course, { dryRun: true, publish: true, log: silent })).rejects.toThrow(/черновики/)
      expect((await publishSqlCourse(client, course, { dryRun: true, publish: false, log: silent })).created).toBe(0)
    } finally {
      await payload.update({ collection: 'trainer-tasks', id: task.id, data: { isPublished: true } })
      await client.logout()
    }
  }, 300_000)
})

