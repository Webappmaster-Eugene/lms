import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import { GET, POST } from '@/app/api/learning-state/route'
import { learningVideos } from '@/lib/learning-state'
import { learningHistory, recentLearningCourses } from '@/server/learning-history'
import { getLearningState, latestLearningResume, saveLearningState } from '@/server/learning-state'
import * as catalog from '@/server/learning-catalog'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, uid, type CourseTree, type TestUser } from '../helpers/payload'

let payload: Payload
let student: TestUser
let other: TestUser
let admin: TestUser
let first: CourseTree
let second: CourseTree
let hidden: CourseTree
let videoId: string
const viewedAt = Date.now() - 100_000
const uploadedFiles: number[] = []
const uploadedLessons: number[] = []

beforeAll(async () => {
  payload = await getTestPayload()
  student = await createStudent(payload)
  other = await createStudent(payload)
  admin = await createAdmin(payload)
  first = await createCourseTree(payload, { lessons: 55 })
  second = await createCourseTree(payload, { lessons: 2 })
  hidden = await createCourseTree(payload, { lessons: 24 })
  const videoLesson = await payload.update({ collection: 'lessons', id: first.lessons[54].id, data: { content: [{ blockType: 'video', id: 'clip', title: 'История ролика', videoUrl: 'https://disk.yandex.ru/d/private-recording.mp4' }] } })
  videoId = learningVideos(videoLesson)[0].id
  for (const [offset, tree] of [[0, second], [100, first], [1000, hidden]] as const) {
    for (const [index, lesson] of tree.lessons.entries()) {
      await payload.create({ collection: 'lesson-learning-states', data: { user: student.id, lesson: lesson.id, lastViewedAt: new Date(viewedAt + offset + index).toISOString(), ...(lesson.id === videoLesson.id ? { lastVideoId: videoId, positions: { [videoId]: { seconds: 123, at: viewedAt + offset + index, ended: false } } } : {}) }, depth: 0 })
    }
  }
  await payload.create({ collection: 'lesson-learning-states', data: { user: other.id, lesson: second.lessons[0].id, lastViewedAt: new Date(viewedAt + 2000).toISOString() } })
  await payload.update({ collection: 'courses', id: hidden.course.id, data: { isPublished: false } })
})

afterAll(async () => {
  for (const id of uploadedLessons) await payload.delete({ collection: 'lessons', id })
  for (const id of uploadedFiles) await payload.delete({ collection: 'media', id })
})

describe('история уроков и независимые места остановки курсов', () => {
  it('пагинация не ограничена двадцатью уроками; недоступные недавние записи исключаются до count и limit', async () => {
    const firstPage = await learningHistory(payload, student, { limit: 20 })
    const lastPage = await learningHistory(payload, student, { page: 3, limit: 20 })
    expect(firstPage).toMatchObject({ page: 1, totalDocs: 57, hasNextPage: true })
    expect(firstPage.docs).toHaveLength(20)
    expect(firstPage.docs[0]).toMatchObject({ lessonId: first.lessons[54].id, courseId: first.course.id, videoTitle: 'История ролика', seconds: 123, isCompleted: false })
    expect(lastPage).toMatchObject({ page: 3, totalDocs: 57, hasNextPage: false })
    expect(lastPage.docs).toHaveLength(17)
    expect(lastPage.docs.at(-1)?.lessonId).toBe(second.lessons[0].id)
    expect((await learningHistory(payload, student, { page: 4 })).docs).toEqual([])
  })

  it('находит последний урок каждого курса даже за пятьюдесятью просмотрами другого курса', async () => {
    const reads = vi.spyOn(payload, 'find')
    let recent
    try {
      recent = await recentLearningCourses(payload, student)
      const fullContentReads = reads.mock.calls.filter(([query]) => query.collection === 'lessons' && query.select && 'content' in query.select && query.select.content === true)
      expect(fullContentReads).toHaveLength(1)
      expect(fullContentReads[0][0]).toMatchObject({ limit: 2, depth: 0, where: { id: { in: [first.lessons[54].id, second.lessons[1].id] } } })
      const completionReads = reads.mock.calls.filter(([query]) => query.collection === 'user-progress')
      expect(completionReads).toHaveLength(1)
      expect(completionReads[0][0]).toMatchObject({ where: { user: { equals: student.id }, lesson: { in: [first.lessons[54].id, second.lessons[1].id] } } })
    } finally {
      reads.mockRestore()
    }
    expect(recent.map((entry) => [entry.courseId, entry.lessonId])).toEqual([[first.course.id, first.lessons[54].id], [second.course.id, second.lessons[1].id]])
    expect(await latestLearningResume(payload, student)).toMatchObject({ title: first.lessons[54].title, course: first.course.title, seconds: 123 })
    const onlySecond = await learningHistory(payload, student, { courseId: second.course.id })
    expect(onlySecond.totalDocs).toBe(2)
    expect(onlySecond.docs.map((entry) => entry.lessonId)).toEqual([second.lessons[1].id, second.lessons[0].id])
  })

  it('изолирует аккаунты и возвращает только навигационный DTO без исходников видео и чужих позиций', async () => {
    const own = await learningHistory(payload, other)
    expect(own.totalDocs).toBe(1)
    expect(own.docs.map((entry) => entry.lessonId)).toEqual([second.lessons[0].id])
    const encoded = JSON.stringify(await learningHistory(payload, student))
    expect(encoded).not.toContain('disk.yandex.ru')
    expect(encoded).not.toContain('positions')
    expect(encoded).not.toContain('userId')
    expect((await payload.findByID({ collection: 'users', id: student.id })).totalPoints).toBe(0)
    expect((await payload.count({ collection: 'user-progress', where: { user: { equals: student.id } } })).totalDocs).toBe(0)
  })

  it('читает GET и сохраняет POST конкретного урока без повторной загрузки общего каталога', async () => {
    const token = await login(payload, student)
    const readCatalog = vi.spyOn(catalog, 'getLearningCatalog')
    try {
      const url = `http://lms.test/api/learning-state?lessonId=${second.lessons[1].id}`
      const headers = { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' }
      const get = await GET(new Request(url, { headers }))
      expect(get.status).toBe(200)
      expect(await get.json()).toMatchObject({ userId: student.id, positions: {} })
      expect(readCatalog.mock.calls).toHaveLength(1)
      readCatalog.mockClear()
      const post = await POST(new Request(url, { method: 'POST', headers, body: JSON.stringify({ lessonId: second.lessons[1].id, at: viewedAt + 1 }) }))
      expect(post.status).toBe(200)
      expect(readCatalog.mock.calls).toHaveLength(1)
    } finally {
      readCatalog.mockRestore()
    }
  })

  it('отличает явное завершение от просмотра и сохраняет историю при смене источника ролика', async () => {
    await payload.create({ collection: 'user-progress', data: { user: student.id, lesson: second.lessons[1].id, isCompleted: true }, context: { skipHooks: true } })
    expect((await learningHistory(payload, student, { courseId: second.course.id })).docs.map((entry) => entry.isCompleted)).toEqual([true, false])
    await payload.update({ collection: 'lessons', id: first.lessons[54].id, data: { content: [{ blockType: 'video', id: 'clip', title: 'Новая запись', videoUrl: 'https://disk.yandex.ru/d/replacement-recording.mp4' }] } })
    const latest = (await learningHistory(payload, student, { limit: 1 })).docs[0]
    expect(latest).toMatchObject({ lessonId: first.lessons[54].id, href: `/lessons/${first.lessons[54].slug}`, lastViewedAt: new Date(viewedAt + 154).toISOString() })
    expect(latest.seconds).toBeUndefined()
    expect(latest.videoTitle).toBeUndefined()
    expect((await payload.count({ collection: 'lesson-learning-states', where: { user: { equals: student.id } } })).totalDocs).toBe(81)
  })

  it('отзыв назначения и изменение all→assigned действуют сразу, даже со старым DTO пользователя', async () => {
    const restricted = await createStudent(payload, { learningAccessMode: 'assigned' })
    const adminReq = await createLocalReq({ user: admin }, payload)
    const grant = await payload.create({ collection: 'learning-access-grants', data: { user: restricted.id, target: { relationTo: 'courses', value: second.course.id }, effect: 'allow', ruleKey: 'generated' }, req: adminReq })
    await saveLearningState(payload, restricted, second.lessons[0], { at: viewedAt })
    expect((await learningHistory(payload, restricted)).totalDocs).toBe(1)
    await payload.delete({ collection: 'learning-access-grants', id: grant.id, req: await createLocalReq({ user: admin }, payload) })
    expect((await learningHistory(payload, restricted)).docs).toEqual([])
    await expect(getLearningState(payload, restricted, second.lessons[0])).rejects.toMatchObject({ status: 403 })
    await expect(saveLearningState(payload, restricted, second.lessons[0], { at: viewedAt + 1 })).rejects.toMatchObject({ status: 403 })
    await payload.update({ collection: 'users', id: other.id, data: { learningAccessMode: 'assigned' }, req: await createLocalReq({ user: admin }, payload) })
    expect((await learningHistory(payload, other)).docs).toEqual([])
    await expect(getLearningState(payload, other, second.lessons[0])).rejects.toMatchObject({ status: 403 })
  })

  it('публикация и возврат доступа восстанавливают прежнюю историю без пересоздания позиций', async () => {
    await payload.update({ collection: 'courses', id: hidden.course.id, data: { isPublished: true } })
    const history = await learningHistory(payload, student, { limit: 1 })
    expect(history.totalDocs).toBe(81)
    expect(history.docs[0].lessonId).toBe(hidden.lessons[23].id)
    await payload.update({ collection: 'sections', id: hidden.section.id, data: { isPublished: false } })
    expect((await learningHistory(payload, student)).totalDocs).toBe(57)
    await payload.update({ collection: 'sections', id: hidden.section.id, data: { isPublished: true } })
    expect((await learningHistory(payload, student)).totalDocs).toBe(81)
  })

  it('загруженный файл-видео сохраняет позицию и историю; заменённый файл сбрасывает только старый клип', async () => {
    const viewer = await createStudent(payload)
    const tree = await createCourseTree(payload, { lessons: 1 })
    uploadedLessons.push(tree.lessons[0].id)
    const upload = async () => {
      const bytes = Buffer.from('00000018667479706d703432000000006d7034326d703431', 'hex')
      const media = await payload.create({ collection: 'media', data: { alt: 'Тестовая запись' }, file: { data: bytes, mimetype: 'video/mp4', name: `${uid('history-video')}.mp4`, size: bytes.length } })
      uploadedFiles.push(media.id)
      return media
    }
    const firstFile = await upload()
    const secondFile = await upload()
    const lesson = await payload.update({ collection: 'lessons', id: tree.lessons[0].id, depth: 1, data: { content: [
      { blockType: 'file', id: 'file-clip', title: 'Файл-видео', file: firstFile.id },
      { blockType: 'video', id: 'unchanged', title: 'Другой ролик', videoUrl: 'https://disk.yandex.ru/d/other-recording.mp4' },
    ] } })
    const [fileId, otherId] = learningVideos(lesson).map((video) => video.id)
    expect(fileId).toMatch(/^file-clip:/)
    const token = await login(payload, viewer)
    const url = `http://lms.test/api/learning-state?lessonId=${lesson.id}`
    const headers = { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' }
    for (const [videoId, seconds] of [[fileId, 321], [otherId, 5], [fileId, 322]] as const) {
      const response = await POST(new Request(url, { method: 'POST', headers, body: JSON.stringify({ lessonId: lesson.id, at: viewedAt + seconds, videoId, seconds, ended: false }) }))
      expect(response.status).toBe(200)
    }
    expect(await (await GET(new Request(url, { headers }))).json()).toMatchObject({ positions: { [fileId]: { seconds: 322 }, [otherId]: { seconds: 5 } }, lastVideoId: fileId })
    expect((await learningHistory(payload, viewer)).docs[0]).toMatchObject({ lessonId: lesson.id, videoTitle: 'Файл-видео', seconds: 322 })
    await payload.update({ collection: 'lessons', id: lesson.id, data: { content: [
      { blockType: 'file', id: 'file-clip', title: 'Новый файл', file: secondFile.id },
      { blockType: 'video', id: 'unchanged', title: 'Другой ролик', videoUrl: 'https://disk.yandex.ru/d/other-recording.mp4' },
    ] } })
    const state = await (await GET(new Request(url, { headers }))).json()
    expect(state.positions).not.toHaveProperty(fileId)
    expect(state.positions).toHaveProperty(otherId)
    expect((await learningHistory(payload, viewer)).docs[0].seconds).toBeUndefined()
    const staleWrite = await POST(new Request(url, { method: 'POST', headers, body: JSON.stringify({ lessonId: lesson.id, at: viewedAt + 500, videoId: fileId, seconds: 500, ended: false }) }))
    expect(staleWrite.status).toBe(409)
  })

  it('переданный request другого аккаунта не позволяет читать или писать позицию', async () => {
    const req = await createLocalReq({ user: admin }, payload)
    await expect(getLearningState(payload, student, first.lessons[0], req)).rejects.toMatchObject({ status: 403 })
    await expect(saveLearningState(payload, student, first.lessons[0], { at: viewedAt }, req)).rejects.toMatchObject({ status: 403 })
    await expect(learningHistory(payload, student, {}, req)).rejects.toMatchObject({ status: 403 })
    await expect(recentLearningCourses(payload, student, 6, req)).rejects.toMatchObject({ status: 403 })
  })
})
