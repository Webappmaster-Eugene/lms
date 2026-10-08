import { describe, expect, it } from 'vitest'
import { checkCriteria } from '@/payload/hooks/checkAchievements'

const stats = {
  completedLessonCount: 10, completedCourseCount: 1, completedRoadmapCount: 0,
  completedTrainerTaskCount: 5, totalPoints: 300, streakDays: 3,
  completedCourseEntityIds: new Set(['12']), completedRoadmapEntityIds: new Set<string>(),
}

describe('server achievement conditions', () => {
  it('activity milestones use genuine completed counts', () => {
    expect(checkCriteria('lesson_count', 10, null, stats)).toBe(true)
    expect(checkCriteria('lesson_count', 25, null, stats)).toBe(false)
    expect(checkCriteria('trainer_task_count', 5, null, stats)).toBe(true)
    expect(checkCriteria('streak_days', 3, null, stats)).toBe(true)
    expect(checkCriteria('streak_days', 7, null, stats)).toBe(false)
  })
  it('an entity-specific course cannot be substituted with another completion', () => {
    expect(checkCriteria('course_completion', 1, '12', stats)).toBe(true)
    expect(checkCriteria('course_completion', 1, '13', stats)).toBe(false)
    expect(checkCriteria('course_completion', 3, null, stats)).toBe(false)
  })
  it('malformed or unknown criteria never award automatically', () => {
    expect(checkCriteria('lesson_count', 0, null, stats)).toBe(false)
    expect(checkCriteria('lesson_count', Number.NaN, null, stats)).toBe(false)
    expect(checkCriteria('unknown', 1, null, stats)).toBe(false)
  })
})
