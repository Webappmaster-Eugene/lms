import { describe, expect, it, vi } from 'vitest'
import type { Payload, PayloadRequest, Where } from 'payload'

import { buildLearningAccess, type LearningGrant, type LearningPolicyMetadata } from '@/lib/learning-access'
import { canAccessLesson } from '@/server/learning-access'

vi.mock('@/lib/learning-observability', () => ({ recordLearningAccess: vi.fn(), withLearningSpan: (_resource: string, _operation: string, callback: () => unknown) => callback() }))

const metadata: LearningPolicyMetadata = {
  roadmaps: [{ id: 1, isPublished: true }, { id: 2, isPublished: true }],
  courses: [{ id: 10, roadmap: 1, roadmapNode: 100, isPublished: true }, { id: 11, roadmap: 1, isPublished: true }],
  nodes: [{ id: 100, roadmap: 1, course: 11 }, { id: 101, roadmap: 1, course: 10 }],
  sections: [{ id: 30, course: 10, isPublished: true }],
  lessons: [{ id: 40, course: 10, section: 30, isPublished: true }],
}
const student = { id: 7, role: 'student', learningAccessMode: 'assigned' as const }
function fakePayload(grants: LearningGrant[]) {
  const find = vi.fn(async (options: { collection: string; where?: Where }) => {
    if (options.collection === 'learning-access-policies') return { docs: [{ id: 1, mode: 'assigned', role: 'student' }], hasNextPage: false }
    const key = options.collection === 'roadmap-nodes' ? 'nodes' : options.collection
    const source = key === 'learning-access-grants' ? grants : metadata[key as keyof LearningPolicyMetadata]
    const id = (options.where?.id as { equals?: number } | undefined)?.equals
    const docs = id === undefined ? source : (source as { id: number }[]).filter((doc) => doc.id === id)
    return { docs, hasNextPage: false }
  })
  return { payload: { find } as unknown as Payload, find }
}

describe('точечная проверка допуска для видео Range', () => {
  it('результат равен политике каталога для всех уровней и конфликтов', async () => {
    const grant = (relationTo: LearningGrant['target']['relationTo'], value: number, effect: 'allow' | 'deny' = 'allow'): LearningGrant => ({ target: { relationTo, value }, effect })
    for (const grants of [
      [], [grant('roadmaps', 1)], [grant('roadmap-nodes', 100)], [grant('courses', 10)],
      [grant('sections', 30)], [grant('lessons', 40)], [grant('roadmaps', 1), grant('sections', 30, 'deny')],
      [grant('roadmaps', 1), grant('lessons', 40, 'deny')], [grant('courses', 10, 'deny'), grant('lessons', 40)],
      [grant('roadmap-nodes', 100), grant('roadmap-nodes', 101, 'deny')],
    ]) {
      const { payload } = fakePayload(grants)
      expect(await canAccessLesson(payload, student, metadata.lessons[0])).toBe(buildLearningAccess(student, grants, metadata).canAccessLessonMetadata(metadata.lessons[0]))
    }
  })

  it('читает только конкретных родителей и назначения ученика, без всего каталога и lesson content', async () => {
    const { payload, find } = fakePayload([])
    await canAccessLesson(payload, student, metadata.lessons[0])
    expect(find).toHaveBeenCalledTimes(6)
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'learning-access-policies', where: { user: { equals: student.id } } }))
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'courses', where: { id: { equals: 10 } }, select: { roadmap: true, roadmapNode: true, isPublished: true } }))
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'roadmaps', where: { id: { equals: 1 } } }))
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'sections', where: { id: { equals: 30 } } }))
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'roadmap-nodes', where: { or: [{ course: { equals: 10 } }, { id: { equals: 100 } }] } }))
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'learning-access-grants', where: { user: { equals: student.id } } }))
    expect(find.mock.calls.some(([options]) => options.collection === 'lessons')).toBe(false)
  })

  it('частичный или устаревший DTO не расширяет действительную политику assigned до all', async () => {
    const source = fakePayload([])
    const findByID = vi.fn(async () => ({ id: student.id, role: 'student', learningAccessMode: 'assigned' }))
    const payload = { find: source.find, findByID } as unknown as Payload
    expect(await canAccessLesson(payload, { id: student.id, role: 'student' }, metadata.lessons[0])).toBe(false)
    expect(await canAccessLesson(payload, { id: student.id, role: 'student', learningAccessMode: 'all' }, metadata.lessons[0])).toBe(false)
    expect(await canAccessLesson(payload, { id: student.id, role: 'admin', learningAccessMode: 'all' }, metadata.lessons[0])).toBe(false)
    expect(findByID).not.toHaveBeenCalled()
    source.find.mockClear()
    const req = {} as PayloadRequest
    await canAccessLesson(payload, { id: student.id, role: 'student' }, metadata.lessons[0], req)
    await canAccessLesson(payload, { id: student.id, role: 'student' }, { ...metadata.lessons[0], id: 41 }, req)
    expect(source.find.mock.calls.filter(([options]) => options.collection === 'learning-access-policies')).toHaveLength(1)
  })
})
