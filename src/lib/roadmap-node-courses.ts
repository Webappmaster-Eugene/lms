/**
 * Узел карты собирает все курсы своей темы.
 *
 * Изначально узел был рассчитан ровно на один курс, но в библиотеке по одной
 * теме их несколько: по React — четыре, по TypeScript — три. Курс указывает
 * свою тему полем `roadmapNode`, а узел показывает их списком и считает
 * прогресс по всем вместе.
 */

import { completionPercent } from '@/lib/progress-percent'

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
 * Тема «следующего шага». Курс может стоять в нескольких темах карты: в своей и
 * дополнительным курсом других. Подсветка нужна одна - родная тема курса, иначе
 * первая по порядку карты.
 */
export function nextStepTopicId(
  topics: { id: string; nodeType?: string | null; courseIds: string[] }[],
  course: { id: string; nodeId: string | null } | null,
): string | null {
  if (!course) return null
  const holders = topics.filter((topic) => topic.nodeType !== 'category' && topic.courseIds.includes(course.id))
  return (holders.find((topic) => topic.id === course.nodeId) ?? holders[0])?.id ?? null
}

/**
 * Состояние узла по его курсам. Основной курс идёт первым — именно он
 * открывается по клику; остальные курсы темы следуют за ним. Гайды и буткемпы
 * темы (`extrasCount`) в прогресс не входят, но тема с ними не «готовится».
 */
export function summarizeNode(
  primary: NodeCourse | null,
  attached: NodeCourse[],
  isCategory = false,
  extrasCount = 0,
): NodeSummary {
  // Курс может попасть в тему двумя путями: привязан к ней и выбран как курс другого роадмапа.
  const courses = [...new Map([...(primary ? [primary] : []), ...attached].map((c) => [c.id, c])).values()]

  const totalLessons = courses.reduce((sum, c) => sum + c.totalLessons, 0)
  const completedLessons = courses.reduce((sum, c) => sum + c.completedCount, 0)
  const progressPercent = completionPercent(completedLessons, totalLessons)

  let status: NodeStatus = 'available'
  if (courses.length > 0) {
    if (!courses.every((c) => c.prerequisitesMet)) status = 'locked'
    else if (totalLessons > 0 && completedLessons === totalLessons) status = 'completed'
    else if (completedLessons > 0) status = 'in-progress'
  }

  const comingSoon = !isCategory && totalLessons === 0 && extrasCount === 0
  if (comingSoon) status = 'locked'

  return { courses, totalLessons, completedLessons, progressPercent, status, comingSoon }
}
