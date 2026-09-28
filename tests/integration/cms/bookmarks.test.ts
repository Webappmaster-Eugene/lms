import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { findBookmarkId, loadSaved } from '@/lib/bookmarks'
import {
  createCourseTree,
  createStudent,
  createSumTask,
  getTestPayload,
  type CourseTree,
  type TestUser,
} from '../helpers/payload'

/** «Сохранённое»: закладки на уроки и задачи тренажёра на настоящей базе. */
let payload: Payload
let tree: CourseTree
let student: TestUser

const save = (user: TestUser, data: Record<string, unknown>) =>
  payload.create({ collection: 'bookmarks', data: data as never, user, overrideAccess: false })

beforeAll(async () => {
  payload = await getTestPayload()
  tree = await createCourseTree(payload, { lessons: 3 })
  student = await createStudent(payload)
})

describe('закладки', () => {
  it('ведут ровно на одно: урок или задачу', async () => {
    const task = await createSumTask(payload)
    await expect(save(student, {})).rejects.toThrow()
    await expect(save(student, { lesson: tree.lessons[0].id, task: task.id })).rejects.toThrow()
  })

  it('повторное сохранение того же урока не создаёт дубль', async () => {
    await save(student, { lesson: tree.lessons[1].id })
    await expect(save(student, { lesson: tree.lessons[1].id })).rejects.toThrow()
  })

  it('один урок могут сохранить разные ученики', async () => {
    const other = await createStudent(payload)
    await save(other, { lesson: tree.lessons[1].id })
    expect(await findBookmarkId(payload, other.id, { lesson: tree.lessons[1].id })).not.toBeNull()
  })

  it('«Сохранённое»: уроки с курсом и задачи с темой, свежие сверху, без снятых с публикации', async () => {
    const user = await createStudent(payload)
    const task = await createSumTask(payload)
    const hidden = await createCourseTree(payload, { lessons: 1 })
    await save(user, { lesson: tree.lessons[0].id })
    await save(user, { task: task.id })
    await save(user, { lesson: hidden.lessons[0].id })
    await payload.update({ collection: 'lessons', id: hidden.lessons[0].id, data: { isPublished: false } })

    const items = await loadSaved(payload, user.id)

    expect(items.map((i) => i.kind)).toEqual(['task', 'lesson'])
    expect(items[1]).toMatchObject({ title: tree.lessons[0].title, href: `/lessons/${tree.lessons[0].slug}`, context: tree.course.title })
    expect(items[0].href).toMatch(new RegExp(`/trainer/.+/${task.slug}$`))
  })

  it('удаление урока убирает закладки на него', async () => {
    const lessonTree = await createCourseTree(payload, { lessons: 1 })
    const user = await createStudent(payload)
    await save(user, { lesson: lessonTree.lessons[0].id })

    await payload.delete({ collection: 'lessons', id: lessonTree.lessons[0].id })

    expect((await payload.find({ collection: 'bookmarks', where: { user: { equals: user.id } } })).totalDocs).toBe(0)
  })

  it('удаление задачи убирает закладки и прогресс по ней — раньше удаление упиралось в прогресс', async () => {
    const task = await createSumTask(payload)
    const user = await createStudent(payload)
    await save(user, { task: task.id })
    await payload.create({ collection: 'user-trainer-progress', data: { user: user.id, task: task.id, isCompleted: true } })

    await payload.delete({ collection: 'trainer-tasks', id: task.id })

    expect((await payload.find({ collection: 'bookmarks', where: { task: { equals: task.id } } })).totalDocs).toBe(0)
    expect((await payload.find({ collection: 'user-trainer-progress', where: { task: { equals: task.id } } })).totalDocs).toBe(0)
  })

  it('удаление ученика убирает его закладки', async () => {
    const user = await createStudent(payload)
    await save(user, { lesson: tree.lessons[2].id })

    await payload.delete({ collection: 'users', id: user.id })

    expect((await payload.find({ collection: 'bookmarks', where: { user: { equals: user.id } } })).totalDocs).toBe(0)
  })
})
