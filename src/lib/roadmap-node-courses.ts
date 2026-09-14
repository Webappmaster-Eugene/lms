/**
 * Узел карты собирает все курсы своей темы.
 *
 * Изначально узел был рассчитан ровно на один курс, но в библиотеке по одной
 * теме их несколько: по React — четыре, по TypeScript — три. Курс указывает
 * свою тему полем `roadmapNode`, а узел показывает их списком и считает
 * прогресс по всем вместе.
 */

export type NodeCourse = {
  id: string
  slug: string
  title: string
  /** Тема карты, к которой привязан курс. */
  nodeId: string | null
  totalLessons: number
  completedCount: number
  prerequisitesMet: boolean
}

export type NodeStatus = 'locked' | 'available' | 'in-progress' | 'completed'

export type NodeSummary = {
  courses: NodeCourse[]
  totalLessons: number
  completedLessons: number
  progressPercent: number
  status: NodeStatus
  /** Тема есть на карте, но материалов по ней пока нет. */
  comingSoon: boolean
}

/** Курсы по темам: считаем один раз на всю карту, а не на каждый узел. */
export function groupCoursesByNode(courses: NodeCourse[]): Map<string, NodeCourse[]> {
  const byNode = new Map<string, NodeCourse[]>()

  for (const course of courses) {
    if (!course.nodeId) continue
    const bucket = byNode.get(course.nodeId) ?? []
    bucket.push(course)
    byNode.set(course.nodeId, bucket)
  }

  return byNode
}

/**
 * Состояние узла по его курсам. Основной курс идёт первым — именно он
 * открывается по клику; остальные курсы темы следуют за ним.
 */
export function summarizeNode(
  primary: NodeCourse | null,
  attached: NodeCourse[],
  isCategory = false,
): NodeSummary {
  const courses = [...(primary ? [primary] : []), ...attached.filter((c) => c.id !== primary?.id)]

  const totalLessons = courses.reduce((sum, c) => sum + c.totalLessons, 0)
  const completedLessons = courses.reduce((sum, c) => sum + c.completedCount, 0)
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

  let status: NodeStatus = 'available'
  if (courses.length > 0) {
    if (!courses.every((c) => c.prerequisitesMet)) status = 'locked'
    else if (totalLessons > 0 && completedLessons === totalLessons) status = 'completed'
    else if (completedLessons > 0) status = 'in-progress'
  }

  const comingSoon = !isCategory && totalLessons === 0
  if (comingSoon) status = 'locked'

  return { courses, totalLessons, completedLessons, progressPercent, status, comingSoon }
}
