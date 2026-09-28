import { pluralize } from '@/lib/utils'

/** Что уже сделал ученик — те же величины, по которым хук выдаёт достижения. */
export type LearnerStats = {
  lessons: number
  courses: number
  roadmaps: number
  trainerTasks: number
  points: number
  completedCourseIds: Set<string>
  completedRoadmapIds: Set<string>
}

export type AchievementLike = {
  id: number | string
  title: string
  description?: string | null
  criteriaType?: string | null
  criteriaValue?: number | null
  criteriaEntityId?: string | null
  pointsReward?: number | null
}

export type AchievementGoal = {
  id: string
  title: string
  description: string | null
  current: number
  target: number
  percent: number
  /** «Ещё 3 урока» — сколько осталось, словами. */
  remaining: string
  pointsReward: number
}

const UNITS: Record<string, [string, string, string]> = {
  lesson_count: ['урок', 'урока', 'уроков'],
  course_completion: ['курс', 'курса', 'курсов'],
  roadmap_completion: ['роадмап', 'роадмапа', 'роадмапов'],
  trainer_task_count: ['задача', 'задачи', 'задач'],
  total_points: ['балл', 'балла', 'баллов'],
}

/**
 * Прогресс к неполученному достижению. null — тип условия неизвестен или
 * задан без цели: такое достижение показывать как цель бессмысленно.
 */
export function achievementGoal(achievement: AchievementLike, stats: LearnerStats): AchievementGoal | null {
  const type = achievement.criteriaType ?? ''
  const units = UNITS[type]
  if (!units) return null

  let current: number
  let target = Math.max(1, achievement.criteriaValue ?? 0)
  const entity = achievement.criteriaEntityId

  switch (type) {
    case 'lesson_count':
      current = stats.lessons
      break
    case 'trainer_task_count':
      current = stats.trainerTasks
      break
    case 'total_points':
      current = stats.points
      break
    case 'course_completion':
      if (entity) {
        target = 1
        current = stats.completedCourseIds.has(entity) ? 1 : 0
      } else current = stats.courses
      break
    case 'roadmap_completion':
      if (entity) {
        target = 1
        current = stats.completedRoadmapIds.has(entity) ? 1 : 0
      } else current = stats.roadmaps
      break
    default:
      return null
  }

  const clamped = Math.min(current, target)
  const left = target - clamped
  // Для конкретного курса «ещё 1 курс» звучит странно — условие объясняет описание.
  const remaining = entity ? 'Завершите нужный курс или роадмап' : `Ещё ${pluralize(left, ...units)}`

  return {
    id: String(achievement.id),
    title: achievement.title,
    description: achievement.description ?? null,
    current: clamped,
    target,
    percent: Math.round((clamped / target) * 100),
    remaining,
    pointsReward: achievement.pointsReward ?? 0,
  }
}

/**
 * Ближайшие цели: неполученные достижения, до которых осталось меньше всего
 * в процентах. Уже выполненные, но ещё не выданные (хук выдаст при следующем
 * прогрессе) тоже не показываются — «осталось 0» только сбивает.
 */
export function nearestGoals(
  achievements: AchievementLike[],
  unlocked: Set<string>,
  stats: LearnerStats,
  limit = 3,
): AchievementGoal[] {
  return achievements
    .filter((a) => !unlocked.has(String(a.id)))
    .flatMap((a) => achievementGoal(a, stats) ?? [])
    .filter((g) => g.current < g.target)
    .sort((a, b) => b.percent - a.percent || a.target - a.current - (b.target - b.current))
    .slice(0, limit)
}
