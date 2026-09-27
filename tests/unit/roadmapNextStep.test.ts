import { describe, expect, it } from 'vitest'

import {
  blockingPrerequisites,
  lessonPosition,
  nextLesson,
  orderCourseLessons,
  pickNextStep,
  recentCourseIds,
  type LessonRef,
  type StepCourse,
} from '@/lib/roadmap-next-step'

/**
 * Карта отправляет ученика в конкретный урок. Если порядок разойдётся со
 * страницей курса, «Продолжить» откроет не тот урок, который он видит первым.
 */

function lesson(id: string, overrides: Partial<LessonRef> = {}): LessonRef {
  return { id, slug: `l-${id}`, title: `Урок ${id}`, courseId: 'c1', sectionId: null, order: 0, ...overrides }
}

describe('порядок уроков курса', () => {
  it('секции по их порядку, внутри — по порядку урока, без секции — в конце', () => {
    const rank = new Map([
      ['s2', 0],
      ['s1', 1],
    ])
    const ordered = orderCourseLessons(
      [
        lesson('1', { sectionId: null, order: 0 }),
        lesson('2', { sectionId: 's1', order: 0 }),
        lesson('3', { sectionId: 's2', order: 2 }),
        lesson('4', { sectionId: 's2', order: 1 }),
      ],
      rank,
    )
    expect(ordered.get('c1')?.map((l) => l.id)).toEqual(['4', '3', '2', '1'])
  })

  it('при равном порядке решает id, как в выборке страницы курса', () => {
    const ordered = orderCourseLessons([lesson('10'), lesson('9')], new Map())
    expect(ordered.get('c1')?.map((l) => l.id)).toEqual(['9', '10'])
  })

  it('урок из неопубликованной секции не предлагается', () => {
    const ordered = orderCourseLessons([lesson('1', { sectionId: 'hidden' }), lesson('2')], new Map())
    expect(ordered.get('c1')?.map((l) => l.id)).toEqual(['2'])
  })

  it('уроки разных курсов не смешиваются', () => {
    const ordered = orderCourseLessons([lesson('1'), lesson('2', { courseId: 'c2' })], new Map())
    expect(ordered.get('c1')).toHaveLength(1)
    expect(ordered.get('c2')).toHaveLength(1)
  })
})

describe('следующий урок', () => {
  it('первый непройденный, даже если дальше есть пройденные', () => {
    const ordered = [lesson('1'), lesson('2'), lesson('3')]
    expect(nextLesson(ordered, new Set(['1', '3']))).toEqual({ slug: 'l-2', title: 'Урок 2' })
  })

  it('курс пройден — следующего урока нет', () => {
    expect(nextLesson([lesson('1')], new Set(['1']))).toBeNull()
  })
})

function step(id: string, overrides: Partial<StepCourse> = {}): StepCourse {
  return {
    id,
    totalLessons: 10,
    completedCount: 0,
    prerequisitesMet: true,
    nextLesson: { slug: `next-${id}`, title: 'Урок' },
    ...overrides,
  }
}

describe('следующий шаг по роадмапу', () => {
  it('начатый курс важнее следующего по порядку', () => {
    const picked = pickNextStep([step('a'), step('b', { completedCount: 3 })])
    expect(picked?.id).toBe('b')
  })

  it('без начатых — первый доступный по порядку роадмапа', () => {
    const picked = pickNextStep([step('a', { prerequisitesMet: false }), step('b'), step('c')])
    expect(picked?.id).toBe('b')
  })

  it('пройденные и пустые курсы пропускаются', () => {
    const picked = pickNextStep([
      step('a', { completedCount: 10, nextLesson: null }),
      step('b', { totalLessons: 0, nextLesson: null }),
      step('c'),
    ])
    expect(picked?.id).toBe('c')
  })

  it('всё пройдено — шага нет', () => {
    expect(pickNextStep([step('a', { completedCount: 10, nextLesson: null })])).toBeNull()
  })
})

describe('что закрывает курс', () => {
  it('называет только непройденные курсы роадмапа', () => {
    const complete = new Map<string, boolean>([
      ['1', true],
      ['2', false],
    ])
    const blocking = blockingPrerequisites(
      [
        { id: '1', title: 'Основы JS' },
        { id: '2', title: 'TypeScript' },
        { id: '3', title: 'Курс вне роадмапа' },
      ],
      (id) => complete.get(id) ?? null,
    )
    expect(blocking).toEqual(['TypeScript'])
  })
})

describe('место урока в курсе', () => {
  const ordered = [lesson('1'), lesson('2'), lesson('3')]

  it('соседи и номер из порядка страницы курса', () => {
    expect(lessonPosition(ordered, '2')).toEqual({
      index: 2,
      total: 3,
      prev: { slug: 'l-1', title: 'Урок 1' },
      next: { slug: 'l-3', title: 'Урок 3' },
    })
  })

  it('у первого нет предыдущего, у последнего — следующего', () => {
    expect(lessonPosition(ordered, '1')?.prev).toBeNull()
    expect(lessonPosition(ordered, '3')?.next).toBeNull()
  })

  it('урок вне программы — без навигации', () => {
    expect(lessonPosition(ordered, '99')).toBeNull()
  })
})

describe('недавние курсы', () => {
  it('сначала курс с самой свежей активностью, без повторов', () => {
    const courseOf = new Map([
      ['a1', 'A'],
      ['a2', 'A'],
      ['b1', 'B'],
    ])
    const ids = recentCourseIds(
      [
        { lessonId: 'a1', at: '2026-09-01T10:00:00Z' },
        { lessonId: 'b1', at: '2026-09-02T10:00:00Z' },
        { lessonId: 'a2', at: '2026-09-03T10:00:00Z' },
      ],
      courseOf,
    )
    expect(ids).toEqual(['A', 'B'])
  })

  it('урок неизвестного курса пропускается', () => {
    expect(recentCourseIds([{ lessonId: 'x', at: '2026-09-01' }], new Map())).toEqual([])
  })
})
