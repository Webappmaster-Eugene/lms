import { describe, expect, it } from 'vitest'

import { buildLearningAccess, learningGrantIsActive, learningRelationId, type LearningGrant, type LearningPolicyMetadata, type LearningTargetCollection } from '@/lib/learning-access'

const student = { id: 7, role: 'student', learningAccessMode: 'assigned' as const }
const metadata: LearningPolicyMetadata = {
  roadmaps: [{ id: 1, isPublished: true }, { id: 2, isPublished: true }],
  courses: [{ id: 10, roadmap: 1, roadmapNode: 100, isPublished: true }, { id: 11, roadmap: 1, isPublished: true }, { id: 20, roadmap: 2, isPublished: true }],
  nodes: [{ id: 100, roadmap: 1, course: 11 }, { id: 101, roadmap: 1, course: 10 }],
  sections: [{ id: 30, course: 10, isPublished: true }, { id: 31, course: 11, isPublished: true }],
  lessons: [{ id: 40, course: 10, section: 30, isPublished: true }, { id: 41, course: 10, section: null, isPublished: true }, { id: 42, course: 11, section: 31, isPublished: true }],
}
const grant = (relationTo: LearningTargetCollection, value: number, effect: 'allow' | 'deny' = 'allow'): LearningGrant => ({ target: { relationTo, value }, effect })
const resolve = (grants: LearningGrant[] = [], source = metadata) => buildLearningAccess(student, grants, source, 1000)

describe('гранулярная политика учебного доступа', () => {
  it('assigned запрещает по умолчанию, all сохраняет опубликованный доступ существующих пользователей', () => {
    expect(resolve().canAccessLessonMetadata(metadata.lessons[0])).toBe(false)
    expect(resolve().canBrowseLessonMetadata(metadata.lessons[0])).toBe(true)
    expect(resolve().canBrowseCourse(10)).toBe(true)
    expect(buildLearningAccess({ id: 7, role: 'student', learningAccessMode: 'all' }, [], metadata).canAccessLessonMetadata(metadata.lessons[0])).toBe(true)
    expect(buildLearningAccess({ id: 7, role: 'student' }, [], metadata).canAccessLessonMetadata(metadata.lessons[0])).toBe(false)
    expect(buildLearningAccess({ id: 7, role: 'student', learningAccessMode: null }, [], metadata).canAccessLessonMetadata(metadata.lessons[0])).toBe(false)
    expect(buildLearningAccess(null, [], metadata).canAccessLessonMetadata(metadata.lessons[0])).toBe(false)
  })

  it('приоритет lesson > section > course > topic > roadmap, deny на одном уровне', () => {
    const grants = [grant('roadmaps', 1), grant('roadmap-nodes', 100, 'deny'), grant('courses', 10), grant('sections', 30, 'deny'), grant('lessons', 40)]
    const policy = resolve(grants)
    expect(policy.canAccessLessonMetadata(metadata.lessons[0])).toBe(true)
    expect(policy.canAccessLessonMetadata(metadata.lessons[1])).toBe(true)
    expect(policy.canAccessLessonMetadata(metadata.lessons[2])).toBe(false)
    expect(resolve([...grants, grant('lessons', 40, 'deny')]).canAccessLessonMetadata(metadata.lessons[0])).toBe(false)
    expect(resolve([grant('lessons', 40, 'deny'), ...grants]).canAccessLessonMetadata(metadata.lessons[0])).toBe(false)
  })

  it('назначение темы покрывает обе связи курса и только совпадающий roadmap', () => {
    const policy = resolve([grant('roadmap-nodes', 100)])
    expect(policy.canAccessCourse(10)).toBe(true)
    expect(policy.canAccessCourse(11)).toBe(true)
    expect(policy.canAccessCourse(20)).toBe(false)
    const wrongParent = { ...metadata, nodes: [{ id: 100, roadmap: 2, course: 11 }] }
    expect(resolve([grant('roadmap-nodes', 100)], wrongParent).canAccessCourse(11)).toBe(false)
    expect(resolve([grant('courses', 10)], wrongParent).canAccessCourse(10)).toBe(false)
  })

  it('несколько тематических родителей одного уровня используют deny независимо от порядка', () => {
    expect(resolve([grant('roadmap-nodes', 100), grant('roadmap-nodes', 101, 'deny')]).canAccessCourse(10)).toBe(false)
    expect(resolve([grant('roadmap-nodes', 101, 'deny'), grant('roadmap-nodes', 100)]).canAccessCourse(10)).toBe(false)
    expect(resolve([grant('roadmap-nodes', 101, 'deny'), grant('courses', 10)]).canAccessCourse(10)).toBe(true)
  })

  it('раздел или один урок открывает программу курса без соседних материалов', () => {
    const policy = resolve([grant('lessons', 40)])
    expect(policy.canAccessCourse(10)).toBe(true)
    expect(policy.canAccessLessonMetadata(metadata.lessons[0])).toBe(true)
    expect(policy.canAccessLessonMetadata(metadata.lessons[1])).toBe(false)
    expect(resolve([grant('sections', 30)]).canAccessLessonMetadata(metadata.lessons[0])).toBe(true)
  })

  it('публикация всех родителей обязательна и явный lesson allow её не обходит', () => {
    const grants = [grant('lessons', 40)]
    for (const source of [
      { ...metadata, roadmaps: [{ id: 1, isPublished: false }] },
      { ...metadata, courses: [{ ...metadata.courses[0], isPublished: false }] },
      { ...metadata, sections: [{ ...metadata.sections[0], isPublished: false }] },
      { ...metadata, sections: [{ ...metadata.sections[0], course: 11 }] },
      { ...metadata, sections: [] },
      { ...metadata, courses: [] },
      { ...metadata, nodes: [] },
    ]) {
      expect(resolve(grants, source).canAccessLessonMetadata(metadata.lessons[0])).toBe(false)
      expect(resolve(grants, source).canBrowseLessonMetadata(metadata.lessons[0])).toBe(false)
    }
    expect(resolve(grants).canAccessLessonMetadata({ ...metadata.lessons[0], isPublished: false })).toBe(false)
  })

  it('пустая секция допустима, испорченная непустая связь запрещена', () => {
    const policy = resolve([grant('courses', 10)])
    expect(policy.canAccessLessonMetadata(metadata.lessons[1])).toBe(true)
    expect(policy.canAccessLessonMetadata({ ...metadata.lessons[1], section: 'broken' })).toBe(false)
    expect(policy.canAccessLessonMetadata({ ...metadata.lessons[1], section: 31 })).toBe(false)
  })

  it('истечение исключений и будущие назначения пересчитываются при каждом снимке', () => {
    const allow = { ...grant('courses', 10), startsAt: new Date(1000).toISOString(), expiresAt: new Date(2000).toISOString() }
    expect(learningGrantIsActive(allow, 999)).toBe(false)
    expect(learningGrantIsActive(allow, 1000)).toBe(true)
    expect(learningGrantIsActive(allow, 2000)).toBe(false)
    expect(learningGrantIsActive({ ...allow, expiresAt: 'invalid' }, 1000)).toBe(false)
    expect(buildLearningAccess(student, [allow], metadata, 2000).canAccessCourse(10)).toBe(false)
  })

  it('админ имеет явный обход, а неопубликованный материал не исчезает для редактора', () => {
    const policy = buildLearningAccess({ id: 1, role: 'admin', learningAccessMode: 'assigned' }, [], { courses: [], sections: [], roadmaps: [], nodes: [], lessons: [] })
    expect(policy.canAccessCourse(10)).toBe(true)
    expect(policy.canAccessLessonMetadata({ id: 40, course: null, isPublished: false })).toBe(true)
    expect(policy.lessonWhere).toEqual({})
  })

  it('SQL Where состоит из родительских условий и явных исключений, без полного списка уроков', () => {
    const policy = resolve([grant('courses', 10), grant('lessons', 40, 'deny'), grant('lessons', 42)])
    expect(policy.lessonWhere).toEqual({ and: [
      { isPublished: { equals: true } },
      { or: [{ and: [{ course: { in: [10] } }, { section: { exists: false } }] }, { and: [{ course: { in: [10, 11, 20] } }, { section: { in: [30] } }] }, { id: { in: [42] } }] },
      { id: { not_in: [40] } },
    ] })
    expect(resolve().lessonWhere).toEqual({ and: [{ isPublished: { equals: true } }, { id: { equals: -1 } }] })
  })

  it('полиморфная цель с отсутствующим ID не предоставляет доступ', () => {
    expect(resolve([{ target: { relationTo: 'courses', value: null }, effect: 'allow' }]).canAccessCourse(10)).toBe(false)
    for (const invalid of [null, undefined, '', false, -1, 1.5, 'abc']) expect(learningRelationId(invalid)).toBeNull()
    expect(learningRelationId({ id: 10 })).toBe(10)
  })

  it('метаданные неконсистентных связей закрывают урок даже при явном разрешении', () => {
    const policy = resolve([grant('roadmaps', 1), grant('lessons', 40)], { ...metadata, invalidLessonIds: [40] })
    expect(policy.canBrowseLessonMetadata(metadata.lessons[0])).toBe(false)
    expect(policy.canAccessLessonMetadata(metadata.lessons[0])).toBe(false)
    expect(policy.lessonWhere.and).toContainEqual({ id: { not_in: [40] } })
  })
})
