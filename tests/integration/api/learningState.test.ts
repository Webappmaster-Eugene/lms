import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { GET, POST } from '@/app/api/learning-state/route'
import { learningVideos } from '@/lib/learning-state'
import { latestLearningResume } from '@/server/learning-state'
import { createCourseTree, createStudent, getTestPayload, login, rest, type CourseTree, type TestUser } from '../helpers/payload'

let payload: Payload
let tree: CourseTree
let student: TestUser
let other: TestUser
let token: string
let otherToken: string
let videoIds: string[]
const base = Date.now() - 20_000

function request(lessonId: number, auth = token, body?: Record<string, unknown>) {
  return new Request(`http://lms.test/api/learning-state?lessonId=${lessonId}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `JWT ${auth}` } : {}) },
    ...(body ? { body: JSON.stringify({ lessonId, ...body }) } : {}),
  })
}

beforeAll(async () => {
  payload = await getTestPayload()
  student = await createStudent(payload)
  other = await createStudent(payload)
  token = await login(payload, student)
  otherToken = await login(payload, other)
  tree = await createCourseTree(payload, { lessons: 2 })
  const lesson = await payload.update({ collection: 'lessons', id: tree.lessons[0].id, data: { content: [
    { blockType: 'video', id: 'first', title: 'Первый ролик', videoUrl: 'https://disk.yandex.ru/d/fixture/first.mp4' },
    { blockType: 'video', id: 'second', title: 'Второй ролик', videoUrl: 'https://disk.yandex.ru/d/fixture/second.ts' },
  ] } })
  videoIds = learningVideos(lesson).map((video) => video.id)
})

describe('серверное место остановки', () => {
  it('GET и RSC-prefetch не создают историю; гость получает 401', async () => {
    expect((await GET(request(tree.lessons[0].id, ''))).status).toBe(401)
    expect((await GET(request(tree.lessons[0].id))).status).toBe(200)
    expect((await payload.count({ collection: 'lesson-learning-states', where: { user: { equals: student.id } } })).totalDocs).toBe(0)
  })

  it('помнит точную позицию включая первые секунды; другой браузер читает её без localStorage', async () => {
    expect((await POST(request(tree.lessons[0].id, token, { at: base, videoId: videoIds[0], seconds: 7, ended: false }))).status).toBe(200)
    const response = await GET(request(tree.lessons[0].id))
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ userId: student.id, positions: { [videoIds[0]]: { seconds: 7, at: base, ended: false } } })
  })

  it('параллельные записи двух роликов не теряют позиции, а запоздавшее старое событие не откатывает', async () => {
    const responses = await Promise.all([
      POST(request(tree.lessons[0].id, token, { at: base + 1, videoId: videoIds[0], seconds: 754, ended: false })),
      POST(request(tree.lessons[0].id, token, { at: base + 2, videoId: videoIds[1], seconds: 121, ended: false })),
    ])
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    await POST(request(tree.lessons[0].id, token, { at: base, videoId: videoIds[0], seconds: 5, ended: false }))
    expect(await (await GET(request(tree.lessons[0].id))).json()).toMatchObject({ positions: { [videoIds[0]]: { seconds: 754 }, [videoIds[1]]: { seconds: 121 } }, lastVideoId: videoIds[1] })
    expect((await payload.count({ collection: 'lesson-learning-states', where: { user: { equals: student.id }, lesson: { equals: tree.lessons[0].id } } })).totalDocs).toBe(1)
  })

  it('текстовый урок становится последним открытым; поздний pagehide старого таба не меняет его', async () => {
    await POST(request(tree.lessons[1].id, token, { at: base + 5 }))
    await POST(request(tree.lessons[0].id, token, { at: base + 3, videoId: videoIds[0], seconds: 759, ended: false }))
    const resume = await latestLearningResume(payload, student)
    expect(resume).toMatchObject({ title: tree.lessons[1].title, href: `/lessons/${tree.lessons[1].slug}` })
  })

  it('чужое состояние недоступно; подмена user в body не меняет владельца; смена аккаунта отвергается', async () => {
    expect(await (await GET(request(tree.lessons[0].id, otherToken))).json()).toMatchObject({ userId: other.id, positions: {} })
    const swapped = await POST(request(tree.lessons[0].id, otherToken, { at: base, expectedUserId: student.id, videoId: videoIds[0], seconds: 90, ended: false }))
    expect(swapped.status).toBe(403)
    await POST(request(tree.lessons[0].id, otherToken, { at: base + 1, user: student.id, videoId: videoIds[0], seconds: 23, ended: false }))
    expect(await (await GET(request(tree.lessons[0].id, otherToken))).json()).toMatchObject({ positions: { [videoIds[0]]: { seconds: 23 } } })
    const list = await rest('GET', `/lesson-learning-states?where[user][equals]=${student.id}&depth=0`, { token: otherToken })
    expect(list.json.docs).toEqual([])
    expect((await rest('POST', '/lesson-learning-states', { token, body: { user: student.id, lesson: tree.lessons[0].id, lastViewedAt: new Date().toISOString() } })).status).toBe(403)
  })

  it('просмотр и ended не завершают урок, не дают баллы и награды', async () => {
    await POST(request(tree.lessons[0].id, token, { at: base + 6, videoId: videoIds[0], seconds: 3600, ended: true }))
    expect((await payload.findByID({ collection: 'users', id: student.id })).totalPoints).toBe(0)
    for (const collection of ['user-progress', 'points-transactions', 'user-achievements', 'certificates', 'streaks'] as const) {
      expect((await payload.count({ collection, where: { user: { equals: student.id } } })).totalDocs, collection).toBe(0)
    }
    expect(await latestLearningResume(payload, student)).toMatchObject({ videoTitle: 'Первый ролик', seconds: 3600, ended: true })
  })

  it('принимает настоящий public Origin за proxy и отвергает чужой Origin/X-Forwarded-Host', async () => {
    const headers = { Authorization: `JWT ${token}`, 'Content-Type': 'application/json', Host: 'learn.mentorcareer.test', 'X-Forwarded-Proto': 'https', Origin: 'https://learn.mentorcareer.test' }
    const body = JSON.stringify({ lessonId: tree.lessons[0].id, at: base })
    expect((await POST(new Request('http://0.0.0.0:3000/api/learning-state', { method: 'POST', headers, body }))).status).toBe(200)
    for (const extra of [{ Origin: 'https://evil.example', 'X-Forwarded-Host': 'evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[]) {
      expect((await POST(new Request('http://0.0.0.0:3000/api/learning-state', { method: 'POST', headers: { ...headers, ...extra }, body }))).status).toBe(403)
    }
  })

  it('неизвестное видео, неверное время и скрытый урок/курс/раздел не принимаются', async () => {
    for (const body of [
      { at: base, videoId: 'unknown', seconds: 20, ended: false },
      { at: base, videoId: videoIds[0], seconds: -1, ended: false },
      { at: Date.now() + 120_000 },
    ]) expect((await POST(request(tree.lessons[0].id, token, body))).status).toBeGreaterThanOrEqual(400)
    for (const [collection, id] of [['lessons', tree.lessons[0].id], ['courses', tree.course.id], ['sections', tree.section.id]] as const) {
      await payload.update({ collection, id, data: { isPublished: false } })
      expect((await POST(request(tree.lessons[0].id, token, { at: base }))).status).toBe(404)
      await payload.update({ collection, id, data: { isPublished: true } })
    }
  })

  it('смена источника сохраняет прочие позиции и не применяет время старого видео', async () => {
    await payload.update({ collection: 'lessons', id: tree.lessons[0].id, data: { content: [
      { blockType: 'video', id: 'first', title: 'Новая запись', videoUrl: 'https://disk.yandex.ru/d/fixture/replacement.mp4' },
      { blockType: 'video', id: 'second', title: 'Второй ролик', videoUrl: 'https://disk.yandex.ru/d/fixture/second.ts' },
    ] } })
    const state = await (await GET(request(tree.lessons[0].id))).json()
    expect(state.positions).not.toHaveProperty(videoIds[0])
    expect(state.positions).toHaveProperty(videoIds[1])
    expect((await POST(request(tree.lessons[0].id, token, { at: base, videoId: videoIds[0], seconds: 123, ended: false }))).status).toBe(409)
  })

  it('удаление урока и ученика очищает зависимую историю в транзакции', async () => {
    await payload.delete({ collection: 'lessons', id: tree.lessons[0].id })
    expect((await payload.count({ collection: 'lesson-learning-states', where: { lesson: { equals: tree.lessons[0].id } } })).totalDocs).toBe(0)
    await payload.delete({ collection: 'users', id: student.id })
    expect((await payload.count({ collection: 'lesson-learning-states', where: { user: { equals: student.id } } })).totalDocs).toBe(0)
  })
})
