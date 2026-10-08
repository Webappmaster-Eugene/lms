import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, type Payload } from 'payload'
import type { Pool } from 'pg'

import { canAccessLesson } from '@/server/learning-access'
import { createAdmin, createStudent, getTestPayload, login, rest, uid, type TestUser } from '../helpers/payload'

let payload: Payload
let admin: TestUser
let student: TestUser
let token: string
const courses: number[] = []
const sections: number[] = []
const lessons: number[] = []
let mismatchedLesson: number
let unsectionedLesson: number
let closedLesson: number

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  student = await createStudent(payload, { learningAccessMode: 'assigned' })
  token = await login(payload, student)
  const roadmap = await payload.create({ collection: 'roadmaps', data: { title: 'Большой назначенный роадмап', slug: uid('scale-roadmap'), isPublished: true } })
  for (let index = 0; index < 75; index += 1) {
    const key = uid(`scale-${index}`)
    const course = await payload.create({ collection: 'courses', data: { title: `Курс ${index}`, slug: `${key}-course`, roadmap: roadmap.id, isPublished: true } })
    const section = await payload.create({ collection: 'sections', data: { title: `Раздел ${index}`, slug: `${key}-section`, course: course.id, isPublished: true } })
    const lesson = await payload.create({ collection: 'lessons', data: { title: `Урок ${index}`, slug: `${key}-lesson`, course: course.id, section: section.id, isPublished: true } })
    courses.push(course.id); sections.push(section.id); lessons.push(lesson.id)
  }
  const otherRoadmap = await payload.create({ collection: 'roadmaps', data: { title: 'Другой роадмап', slug: uid('scale-other-roadmap'), isPublished: true } })
  const otherCourse = await payload.create({ collection: 'courses', data: { title: 'Закрытый курс', slug: uid('scale-other-course'), roadmap: otherRoadmap.id, isPublished: true } })
  closedLesson = (await payload.create({ collection: 'lessons', data: { title: 'Закрытый урок', slug: uid('scale-closed'), course: otherCourse.id, isPublished: true } })).id
  mismatchedLesson = (await payload.create({ collection: 'lessons', data: { title: 'Урок с чужим разделом', slug: uid('scale-mismatch'), course: courses[0], section: sections[1], isPublished: true } })).id
  unsectionedLesson = (await payload.create({ collection: 'lessons', data: { title: 'Урок без раздела', slug: uid('scale-no-section'), course: courses[0], isPublished: true } })).id
  const req = await createLocalReq({ user: admin }, payload)
  const grant = async (relationTo: 'roadmaps' | 'courses' | 'sections' | 'lessons', value: number, effect: 'allow' | 'deny', expiresAt?: string) => payload.create({ collection: 'learning-access-grants', req, data: { user: student.id, target: { relationTo, value }, effect, expiresAt, ruleKey: 'server-generated' } })
  await grant('roadmaps', roadmap.id, 'allow')
  await grant('courses', courses[1], 'deny')
  await grant('lessons', lessons[1], 'allow')
  await grant('sections', sections[2], 'deny')
  await grant('lessons', lessons[3], 'deny')
  await grant('courses', courses[4], 'deny', new Date(Date.now() - 1000).toISOString())
  for (const lesson of [...lessons, mismatchedLesson, unsectionedLesson, closedLesson]) {
    await payload.create({ collection: 'user-progress', data: { user: student.id, lesson, isCompleted: false }, context: { skipHooks: true } })
    await payload.create({ collection: 'notes', data: { user: student.id, lesson, content: 'Личная заметка' }, context: { skipHooks: true } })
  }
})

describe('фильтр доступа к данным ученика на большом каталоге', () => {
  it('75 курсов дают постоянное число JOIN, сохраняют исключения и запрещают чужой раздел', async () => {
    const pool = (payload.db as unknown as { pool: Pool }).pool
    const queries = vi.spyOn(pool, 'query')
    try {
      const result = await rest('GET', '/user-progress?limit=200&depth=0', { token })
      expect(result.status).toBe(200)
      const docs = result.json.docs as { lesson: number }[]
      const expected = [...lessons.filter((id) => id !== lessons[2] && id !== lessons[3]), unsectionedLesson].sort((a, b) => a - b)
      expect(docs.map((doc) => doc.lesson).sort((a, b) => a - b)).toEqual(expected)
      const statements = queries.mock.calls.flatMap(([statement]) => {
        const value: unknown = statement
        if (typeof value === 'string') return [value]
        if (value && typeof value === 'object' && 'text' in value && typeof value.text === 'string') return [value.text]
        return []
      }).filter((statement) => statement.includes('"user_progress"') && statement.includes(' join '))
      expect(statements.length).toBeGreaterThan(0)
      for (const statement of statements) expect((statement.match(/\bjoin\b/gi) ?? []).length).toBeLessThanOrEqual(12)
      const notes = await rest('GET', '/notes?limit=200&depth=0', { token })
      expect(notes.status).toBe(200)
      expect((notes.json.docs as { lesson: number }[]).map((doc) => doc.lesson).sort((a, b) => a - b)).toEqual(expected)
      expect((await rest('GET', `/lessons/${mismatchedLesson}`, { token })).status).toBe(404)
      expect(await canAccessLesson(payload, student, mismatchedLesson)).toBe(false)
      expect(await canAccessLesson(payload, student, lessons[1])).toBe(true)
      expect(await canAccessLesson(payload, student, lessons[2])).toBe(false)
      expect(await canAccessLesson(payload, student, lessons[4])).toBe(true)
    } finally { queries.mockRestore() }
  })
})
