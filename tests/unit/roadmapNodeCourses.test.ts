import { describe, it, expect } from 'vitest'
import { groupCoursesByNode, summarizeNode, type NodeCourse } from '@/lib/roadmap-node-courses'

/**
 * Узел карты рассчитан на тему, а не на один курс: по React их четыре,
 * по TypeScript — три. Раньше 21 курс из 47 не попадал на карту вовсе.
 */

function course(overrides: Partial<NodeCourse> & { id: string }): NodeCourse {
  return {
    slug: `slug-${overrides.id}`,
    title: `Курс ${overrides.id}`,
    nodeId: null,
    totalLessons: 10,
    completedCount: 0,
    prerequisitesMet: true,
    ...overrides,
  }
}

describe('распределение курсов по темам', () => {
  it('курс без темы на карту не попадает', () => {
    const byNode = groupCoursesByNode([course({ id: '1' }), course({ id: '2', nodeId: '7' })])

    expect(byNode.get('7')).toHaveLength(1)
    expect([...byNode.keys()]).toEqual(['7'])
  })

  it('несколько курсов одной темы собираются вместе', () => {
    const byNode = groupCoursesByNode([
      course({ id: '1', nodeId: '7' }),
      course({ id: '2', nodeId: '7' }),
      course({ id: '3', nodeId: '8' }),
    ])

    expect(byNode.get('7')?.map((c) => c.id)).toEqual(['1', '2'])
    expect(byNode.get('8')?.map((c) => c.id)).toEqual(['3'])
  })
})

describe('состояние узла по его курсам', () => {
  it('основной курс идёт первым и не дублируется', () => {
    const primary = course({ id: '1', nodeId: '7' })
    const summary = summarizeNode(primary, [course({ id: '2', nodeId: '7' }), primary])

    expect(summary.courses.map((c) => c.id)).toEqual(['1', '2'])
  })

  it('уроки и прогресс считаются по всем курсам темы', () => {
    const summary = summarizeNode(course({ id: '1', totalLessons: 40, completedCount: 10 }), [
      course({ id: '2', totalLessons: 60, completedCount: 20 }),
    ])

    expect(summary.totalLessons).toBe(100)
    expect(summary.completedLessons).toBe(30)
    expect(summary.progressPercent).toBe(30)
    expect(summary.status).toBe('in-progress')
  })

  it('тема считается пройденной, только когда пройдены все её курсы', () => {
    const done = summarizeNode(course({ id: '1', totalLessons: 5, completedCount: 5 }), [
      course({ id: '2', totalLessons: 3, completedCount: 3 }),
    ])
    const partial = summarizeNode(course({ id: '1', totalLessons: 5, completedCount: 5 }), [
      course({ id: '2', totalLessons: 3, completedCount: 1 }),
    ])

    expect(done.status).toBe('completed')
    expect(partial.status).toBe('in-progress')
  })

  it('невыполненные пререквизиты закрывают тему целиком', () => {
    const summary = summarizeNode(course({ id: '1' }), [
      course({ id: '2', prerequisitesMet: false }),
    ])

    expect(summary.status).toBe('locked')
  })

  it('тема без уроков помечается «скоро», а категория — нет', () => {
    const empty = summarizeNode(null, [])
    const category = summarizeNode(null, [], true)

    expect(empty.comingSoon).toBe(true)
    expect(empty.status).toBe('locked')
    expect(category.comingSoon).toBe(false)
  })

  it('курс без уроков не делает тему доступной', () => {
    const summary = summarizeNode(course({ id: '1', totalLessons: 0 }), [])

    expect(summary.comingSoon).toBe(true)
  })
})
