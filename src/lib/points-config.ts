/**
 * Дефолтные значения баллов. В runtime используются значения из SiteSettings,
 * эти константы — fallback если SiteSettings ещё не настроены.
 */
export const DEFAULT_POINTS = {
  LESSON_COMPLETED: 10,
  COURSE_COMPLETED: 50,
  ROADMAP_COMPLETED: 200,
} as const

export type PointsReason =
  | 'lesson_completed'
  | 'course_completed'
  | 'roadmap_completed'
  | 'achievement_unlocked'
  | 'admin_adjustment'
