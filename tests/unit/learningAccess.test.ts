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


describe('скрытый каталог', () => {
  const strict = { ...student, learningCatalogVisibility: 'assigned' as const }
  it('не открывает каталог, родителей и темы при нуле назначений', () => {
    const policy = buildLearningAccess(strict, [], metadata)
    expect(policy.browseCourseIds).toEqual([])
    expect(policy.browseRoadmapIds).toEqual([])
    expect(policy.browseSectionIds).toEqual([])
    expect(policy.browseNodeIds).toEqual([])
    expect(policy.canBrowseLessonMetadata(metadata.lessons[0])).toBe(false)
    expect(policy.browseLessonWhere).toEqual(policy.lessonWhere)
  })
  it('один урок показывает его родителей и скрывает соседний урок и чужой курс', () => {
    const policy = buildLearningAccess(strict, [grant('lessons', 40)], metadata)
    expect(policy.browseCourseIds).toEqual([10])
    expect(policy.browseRoadmapIds).toEqual([1])
    expect(policy.browseSectionIds).toEqual([30])
    expect(policy.canBrowseNode(101)).toBe(true)
    expect(policy.canBrowseLessonMetadata(metadata.lessons[0])).toBe(true)
    expect(policy.canBrowseLessonMetadata(metadata.lessons[1])).toBe(false)
    expect(policy.canBrowseCourse(11)).toBe(false)
  })
  it('исключённый курс не появляется как связанная тема при назначении роадмапа', () => {
    const policy = buildLearningAccess(strict, [grant('roadmaps', 1), grant('courses', 10, 'deny'), grant('courses', 11, 'deny')], metadata)
    expect(policy.browseCourseIds).toEqual([])
    expect(policy.canBrowseNode(100)).toBe(false)
    expect(policy.canBrowseNode(101)).toBe(false)
    expect(policy.canBrowseRoadmap(1)).toBe(true)
  })
  it('видимость каталога не разрешает прохождение закрытого урока', () => {
    const policy = buildLearningAccess({ ...strict, learningCatalogVisibility: 'catalog' }, [], metadata)
    expect(policy.canBrowseLessonMetadata(metadata.lessons[0])).toBe(true)
    expect(policy.canAccessLessonMetadata(metadata.lessons[0])).toBe(false)
    expect(policy.browseCourseIds).toHaveLength(3)
  })
})

describe('курс только по назначению', () => {
  const closed: LearningPolicyMetadata = {
    ...metadata,
    courses: [...metadata.courses, { id: 50, roadmap: 1, roadmapNode: 102, isPublished: true, assignedOnly: true }],
    nodes: [...metadata.nodes, { id: 102, roadmap: 1, course: 50 }],
    sections: [...metadata.sections, { id: 60, course: 50, isPublished: true }],
    lessons: [...metadata.lessons, { id: 70, course: 50, section: 60, isPublished: true }, { id: 71, course: 50, section: null, isPublished: true }],
  }
  const [inSection, withoutSection] = closed.lessons.slice(-2)
  const everyone = { id: 7, role: 'student', learningAccessMode: 'all' as const, learningCatalogVisibility: 'catalog' as const }
  const courseIdsOf = (where: unknown): unknown => JSON.stringify(where).match(/"course":\{"in":(\[[^\]]*\])/)?.[1]

  it('режим «все курсы» и каталог его не открывают и не показывают, остальные курсы — как раньше', () => {
    const policy = buildLearningAccess(everyone, [], closed)
    expect(policy.canAccessCourse(50)).toBe(false)
    expect(policy.canAccessLessonMetadata(inSection)).toBe(false)
    expect(policy.canBrowseCourse(50)).toBe(false)
    expect(policy.canBrowseSection(60)).toBe(false)
    expect(policy.canBrowseNode(102)).toBe(false)
    expect(policy.canBrowseLessonMetadata(inSection)).toBe(false)
    expect(policy.browseCourseIds).not.toContain(50)
    expect(courseIdsOf(policy.browseLessonWhere)).toBe('[10,11,20]')
    expect(courseIdsOf(policy.lessonWhere)).not.toContain('50')
    expect(policy.canAccessCourse(10)).toBe(true)
    expect(policy.canBrowseNode(101)).toBe(true)
  })

  it('доступ ко всей карте его не открывает', () => {
    const policy = buildLearningAccess(everyone, [grant('roadmaps', 1)], closed)
    expect(policy.canAccessCourse(10)).toBe(true)
    expect(policy.canAccessCourse(50)).toBe(false)
    expect(resolve([grant('roadmaps', 1)], closed).canBrowseCourse(50)).toBe(false)
  })

  it('назначение курса или его темы открывает весь курс и показывает его в каталоге', () => {
    for (const grants of [[grant('courses', 50)], [grant('roadmap-nodes', 102)]]) {
      for (const user of [student, everyone]) {
        const policy = buildLearningAccess(user, grants, closed)
        expect(policy.canAccessCourse(50)).toBe(true)
        expect(policy.canAccessLessonMetadata(inSection)).toBe(true)
        expect(policy.canAccessLessonMetadata(withoutSection)).toBe(true)
        expect(policy.canBrowseCourse(50)).toBe(true)
        expect(policy.canBrowseLessonMetadata(withoutSection)).toBe(true)
      }
    }
  })

  it('назначение раздела или урока открывает только его', () => {
    const section = buildLearningAccess(everyone, [grant('sections', 60)], closed)
    expect(section.canAccessLessonMetadata(inSection)).toBe(true)
    expect(section.canAccessLessonMetadata(withoutSection)).toBe(false)
    expect(section.canBrowseCourse(50)).toBe(true)
    const lesson = buildLearningAccess(everyone, [grant('lessons', 71)], closed)
    expect(lesson.canAccessLessonMetadata(withoutSection)).toBe(true)
    expect(lesson.canAccessLessonMetadata(inSection)).toBe(false)
  })

  it('тема без своего курса скрыта, если к ней привязаны только закрытые курсы', () => {
    const topics: LearningPolicyMetadata = {
      ...closed,
      courses: [...closed.courses, { id: 51, roadmap: 1, roadmapNode: 103, isPublished: true, assignedOnly: true }, { id: 52, roadmap: 1, roadmapNode: 104, isPublished: true, assignedOnly: true }, { id: 53, roadmap: 1, roadmapNode: 104, isPublished: true }],
      nodes: [...closed.nodes, { id: 103, roadmap: 1, course: null }, { id: 104, roadmap: 1, course: null }],
    }
    const policy = buildLearningAccess(everyone, [], topics)
    expect(policy.canBrowseNode(103)).toBe(false)
    expect(policy.canBrowseNode(104)).toBe(true)
    expect(buildLearningAccess(everyone, [grant('courses', 51)], topics).canBrowseNode(103)).toBe(true)
  })

  it('запрет сильнее назначения, срок назначения соблюдается, администратор видит всё', () => {
    expect(buildLearningAccess(everyone, [grant('courses', 50), grant('courses', 50, 'deny')], closed).canAccessCourse(50)).toBe(false)
    const expired = { ...grant('courses', 50), expiresAt: new Date(500).toISOString() }
    expect(buildLearningAccess(everyone, [expired], closed, 1000).canAccessCourse(50)).toBe(false)
    const admin = buildLearningAccess({ id: 1, role: 'admin' }, [], closed)
    expect(admin.canAccessCourse(50)).toBe(true)
    expect(admin.canBrowseLessonMetadata(inSection)).toBe(true)
  })
})
