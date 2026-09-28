import { describe, expect, it } from 'vitest'

import { achievementGoal, nearestGoals, type LearnerStats } from '@/lib/achievement-progress'

/** Цели в профиле считаются по тем же условиям, по которым хук выдаёт достижения. */

const stats: LearnerStats = {
  lessons: 7,
  courses: 1,
  roadmaps: 0,
  trainerTasks: 2,
  points: 180,
  completedCourseIds: new Set(['12']),
  completedRoadmapIds: new Set(),
}

describe('прогресс к достижению', () => {
  it('уроки: сколько осталось, с согласованием', () => {
    const goal = achievementGoal({ id: 1, title: 'Десятка', criteriaType: 'lesson_count', criteriaValue: 10 }, stats)
    expect(goal).toMatchObject({ current: 7, target: 10, percent: 70, remaining: 'Ещё 3 урока' })
  })

  it('задачи тренажёра и баллы', () => {
    expect(achievementGoal({ id: 2, title: 't', criteriaType: 'trainer_task_count', criteriaValue: 5 }, stats)?.remaining).toBe(
      'Ещё 3 задачи',
    )
    expect(achievementGoal({ id: 3, title: 'p', criteriaType: 'total_points', criteriaValue: 200 }, stats)?.remaining).toBe(
      'Ещё 20 баллов',
    )
  })

  it('конкретный курс — выполнено или нет, без счётчика', () => {
    const done = achievementGoal({ id: 4, title: 'c', criteriaType: 'course_completion', criteriaValue: 1, criteriaEntityId: '12' }, stats)
    const todo = achievementGoal({ id: 5, title: 'c', criteriaType: 'course_completion', criteriaValue: 1, criteriaEntityId: '99' }, stats)
    expect(done).toMatchObject({ current: 1, target: 1 })
    expect(todo).toMatchObject({ current: 0, target: 1, remaining: 'Завершите нужный курс или роадмап' })
  })

  it('неизвестный тип условия целью не становится', () => {
    expect(achievementGoal({ id: 6, title: 'x', criteriaType: 'streak_days', criteriaValue: 7 }, stats)).toBeNull()
  })

  it('перевыполнение не даёт больше 100%', () => {
    expect(achievementGoal({ id: 7, title: 'x', criteriaType: 'lesson_count', criteriaValue: 5 }, stats)?.percent).toBe(100)
  })
})

describe('ближайшие цели', () => {
  const achievements = [
    { id: 1, title: 'Первые шаги', criteriaType: 'lesson_count', criteriaValue: 5 },
    { id: 2, title: 'Десятка', criteriaType: 'lesson_count', criteriaValue: 10 },
    { id: 3, title: 'Полсотни', criteriaType: 'lesson_count', criteriaValue: 50 },
    { id: 4, title: 'Решатель', criteriaType: 'trainer_task_count', criteriaValue: 3 },
    { id: 5, title: 'Мастер пути', criteriaType: 'roadmap_completion', criteriaValue: 1 },
  ]

  it('сначала самые близкие, без полученных и уже выполненных', () => {
    const goals = nearestGoals(achievements, new Set(['4']), stats)
    expect(goals.map((g) => g.title)).toEqual(['Десятка', 'Полсотни', 'Мастер пути'])
  })

  it('лимит соблюдается', () => {
    expect(nearestGoals(achievements, new Set(), stats, 2)).toHaveLength(2)
  })
})
