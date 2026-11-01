import { describe, expect, it } from 'vitest'

import { buildTrainerAccess, type TrainerAccessUser } from '@/lib/trainer-access'
import type { LearningGrant } from '@/lib/learning-access'

const metadata = {
  topics: [{ id: 10, isPublished: true }, { id: 11, isPublished: false }],
  tasks: [{ id: 1, topic: 10, isPublished: true }, { id: 2, topic: { id: 10 }, isPublished: true }, { id: 3, topic: 10, isPublished: false }, { id: 4, topic: 11, isPublished: true }, { id: 5, topic: 99, isPublished: true }],
}
const student: TrainerAccessUser = { id: 20, role: 'student', isActive: true, trainerAccessMode: 'assigned', learningCatalogVisibility: 'assigned' }
const rule = (relationTo: 'trainer-tasks' | 'trainer-topics', value: number, effect: 'allow' | 'deny' = 'allow', extra: Partial<LearningGrant> = {}): LearningGrant => ({ target: { relationTo, value }, effect, ...extra })

describe('персональные права тренажёра', () => {
  it('новый assigned ученик без назначений не получает задачи или темы', () => {
    const scope = buildTrainerAccess(student, [], metadata)
    expect(scope.accessibleTaskIds).toEqual([])
    expect(scope.browseTaskIds).toEqual([])
    expect(scope.browseTopicIds).toEqual([])
    expect(scope.hasAccess).toBe(false)
    expect(scope.canAccessTask(1)).toBe(false)
  })
  it('all совместим с прежними учениками, но не открывает unpublished/invalid parents', () => {
    const scope = buildTrainerAccess({ ...student, trainerAccessMode: null }, [], metadata)
    expect(scope.accessibleTaskIds).toEqual([1, 2])
  })
  it('назначение темы открывает только опубликованные задачи с валидным родителем', () => {
    expect(buildTrainerAccess(student, [rule('trainer-topics', 10)], metadata).accessibleTaskIds).toEqual([1, 2])
  })
  it('закрытие темы оставляет одну более точную явно разрешённую задачу', () => {
    const scope = buildTrainerAccess(student, [rule('trainer-topics', 10, 'deny'), rule('trainer-tasks', 2)], metadata)
    expect(scope.accessibleTaskIds).toEqual([2])
    expect(scope.browseTopicIds).toEqual([10])
  })
  it('deny задачи сильнее allow темы и одинаковый deny сильнее duplicate allow', () => {
    expect(buildTrainerAccess(student, [rule('trainer-topics', 10), rule('trainer-tasks', 1), rule('trainer-tasks', 1, 'deny')], metadata).accessibleTaskIds).toEqual([2])
  })
  it('disabled абсолютно закрывает даже явно назначенные задачи и каталог', () => {
    const scope = buildTrainerAccess({ ...student, trainerAccessMode: 'disabled', learningCatalogVisibility: 'catalog' }, [rule('trainer-topics', 10), rule('trainer-tasks', 1)], metadata)
    expect(scope.hasAccess).toBe(false)
    expect(scope.browseTaskIds).toEqual([])
  })
  it('catalog позволяет только видеть опубликованные карточки, не решать их', () => {
    const scope = buildTrainerAccess({ ...student, learningCatalogVisibility: 'catalog' }, [], metadata)
    expect(scope.browseTaskIds).toEqual([1, 2])
    expect(scope.accessibleTaskIds).toEqual([])
    expect(scope.canBrowseTask(1)).toBe(true)
    expect(scope.canAccessTask(1)).toBe(false)
  })
  it('startsAt включительно, expiresAt исключительно; некорректные даты закрыты', () => {
    const now = Date.parse('2026-10-09T10:00:00Z')
    expect(buildTrainerAccess(student, [rule('trainer-tasks', 1, 'allow', { startsAt: new Date(now).toISOString() })], metadata, now).accessibleTaskIds).toEqual([1])
    expect(buildTrainerAccess(student, [rule('trainer-tasks', 1, 'allow', { expiresAt: new Date(now).toISOString() }), rule('trainer-tasks', 2, 'allow', { startsAt: 'broken' })], metadata, now).accessibleTaskIds).toEqual([])
  })
  it('unauthenticated/inactive нельзя превратить в all ученика', () => {
    expect(buildTrainerAccess(null, [], metadata).hasAccess).toBe(false)
    expect(buildTrainerAccess({ ...student, isActive: false, trainerAccessMode: 'all' }, [], metadata).hasAccess).toBe(false)
  })
  it('legacy catalogue сохраняет пустые опубликованные темы, назначенная пустая тема тоже видна', () => {
    const empty = { topics: metadata.topics, tasks: [] }
    expect(buildTrainerAccess({ ...student, trainerAccessMode: 'all', learningCatalogVisibility: 'catalog' }, [], empty).browseTopicIds).toEqual([10])
    expect(buildTrainerAccess(student, [], empty).browseTopicIds).toEqual([])
    const assigned = buildTrainerAccess(student, [rule('trainer-topics', 10)], empty)
    expect(assigned.browseTopicIds).toEqual([10])
    expect(assigned.hasAccess).toBe(true)
    expect(buildTrainerAccess({ ...student, trainerAccessMode: 'disabled' }, [rule('trainer-topics', 10)], empty).browseTopicIds).toEqual([])
  })
  it('удалённая polymorphic цель с null target не восстанавливает доступ и не роняет проверку', () => {
    const orphan = { ...rule('trainer-tasks', 1), target: null } as unknown as LearningGrant
    expect(buildTrainerAccess(student, [orphan], metadata).accessibleTaskIds).toEqual([])
  })
  it('all включает модуль даже при пустом каталоге, assigned требует хотя бы одну задачу', () => {
    expect(buildTrainerAccess({ ...student, trainerAccessMode: 'all' }, [], { topics: [], tasks: [] }).hasAccess).toBe(true)
    expect(buildTrainerAccess(student, [], { topics: [], tasks: [] }).hasAccess).toBe(false)
  })
  it('админ редактирует unpublished задачи независимо от персональных назначений', () => {
    expect(buildTrainerAccess({ ...student, role: 'admin', trainerAccessMode: 'disabled' }, [], metadata).canAccessTask(3)).toBe(true)
  })
})

describe('темы тренажёра только по назначению', () => {
  // 10 - обычная тема, 30 - закрытая (SQL), 31 - закрытая и снятая с публикации.
  const restricted = {
    topics: [{ id: 10, isPublished: true }, { id: 30, isPublished: true, assignedOnly: true }, { id: 31, isPublished: false, assignedOnly: true }],
    tasks: [{ id: 1, topic: 10, isPublished: true }, { id: 7, topic: 30, isPublished: true }, { id: 8, topic: 30, isPublished: true }, { id: 9, topic: 31, isPublished: true }],
  }
  const everyone: TrainerAccessUser = { ...student, trainerAccessMode: 'all', learningCatalogVisibility: 'catalog' }

  it('режим «весь тренажёр» и витрина каталога не открывают и не показывают закрытую тему', () => {
    const scope = buildTrainerAccess(everyone, [], restricted)
    expect(scope.accessibleTaskIds).toEqual([1])
    expect(scope.browseTaskIds).toEqual([1])
    expect(scope.browseTopicIds).toEqual([10])
    expect(scope.canAccessTask(7)).toBe(false)
    expect(scope.canBrowseTask(7)).toBe(false)
    expect(scope.taskWhere).toEqual({ id: { in: [1] } })
  })

  it('назначение на тему открывает все её задачи при любом режиме, кроме отключённого тренажёра', () => {
    for (const user of [everyone, student, { ...student, learningCatalogVisibility: 'catalog' as const }]) {
      const scope = buildTrainerAccess(user, [rule('trainer-topics', 30)], restricted)
      expect(scope.accessibleTaskIds).toEqual(expect.arrayContaining([7, 8]))
      expect(scope.browseTopicIds).toContain(30)
      expect(scope.hasAccess).toBe(true)
    }
    const disabled = buildTrainerAccess({ ...everyone, trainerAccessMode: 'disabled' }, [rule('trainer-topics', 30)], restricted)
    expect(disabled.accessibleTaskIds).toEqual([])
    expect(disabled.browseTopicIds).toEqual([])
  })

  it('назначение одной задачи показывает тему только с этой задачей', () => {
    const scope = buildTrainerAccess(everyone, [rule('trainer-tasks', 8)], restricted)
    expect(scope.accessibleTaskIds).toEqual([1, 8])
    expect(scope.browseTaskIds).toEqual([1, 8])
    expect(scope.browseTopicIds).toEqual(expect.arrayContaining([10, 30]))
    expect(scope.canAccessTask(7)).toBe(false)
  })

  it('запрет задачи внутри назначенной темы и снятие темы с публикации сильнее назначения', () => {
    const scope = buildTrainerAccess(everyone, [rule('trainer-topics', 30), rule('trainer-tasks', 7, 'deny'), rule('trainer-topics', 31)], restricted)
    expect(scope.accessibleTaskIds).toEqual([1, 8])
    expect(scope.canAccessTask(9)).toBe(false)
    expect(scope.browseTopicIds).not.toContain(31)
  })

  it('назначение с истёкшим сроком закрытую тему не открывает', () => {
    const now = Date.parse('2026-11-01T00:00:00Z')
    const expired = rule('trainer-topics', 30, 'allow', { expiresAt: new Date(now - 1000).toISOString() })
    const scope = buildTrainerAccess(everyone, [expired], restricted, now)
    expect(scope.accessibleTaskIds).toEqual([1])
    expect(scope.browseTopicIds).toEqual([10])
  })

  it('админ видит закрытые темы без назначений', () => {
    const scope = buildTrainerAccess({ ...everyone, role: 'admin' }, [], restricted)
    expect(scope.canAccessTask(7)).toBe(true)
    expect(scope.browseTopicIds).toContain(30)
  })
})
