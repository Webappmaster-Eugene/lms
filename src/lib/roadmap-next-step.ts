/**
 * «Что делать дальше» на карте роадмапа: следующий урок каждого курса и один
 * общий следующий шаг. Порядок уроков повторяет страницу курса, иначе карта
 * отправляла бы ученика не в тот урок, который он видит первым в программе.
 */

export type LessonRef = {
  id: string
  slug: string
  title: string
  courseId: string
  /** null — урок вне секций, такие курс показывает после всех секций. */
  sectionId: string | null
  order: number
}

export type LessonLink = { slug: string; title: string }

function byOrderThenId(a: LessonRef, b: LessonRef): number {
  if (a.order !== b.order) return a.order - b.order
  return Number(a.id) - Number(b.id)
}

/**
 * Уроки каждого курса в порядке страницы курса: секции по их порядку, внутри —
 * по порядку урока, в конце уроки без секции. Урок из неопубликованной секции
 * на странице курса не виден — сюда он тоже не попадает.
 *
 * @param sectionRank позиция опубликованной секции в общей сортировке секций
 */
export function orderCourseLessons(
  lessons: LessonRef[],
  sectionRank: Map<string, number>,
): Map<string, LessonRef[]> {
  const byCourse = new Map<string, LessonRef[]>()
  for (const lesson of lessons) {
    if (lesson.sectionId !== null && !sectionRank.has(lesson.sectionId)) continue
    const bucket = byCourse.get(lesson.courseId) ?? []
    bucket.push(lesson)
    byCourse.set(lesson.courseId, bucket)
  }

  const rank = (lesson: LessonRef) =>
    lesson.sectionId === null ? Number.POSITIVE_INFINITY : (sectionRank.get(lesson.sectionId) ?? 0)

  for (const bucket of byCourse.values()) {
    bucket.sort((a, b) => {
      const ra = rank(a)
      const rb = rank(b)
      if (ra !== rb) return ra < rb ? -1 : 1
      return byOrderThenId(a, b)
    })
  }
  return byCourse
}

/** Первый непройденный урок — с него ученик продолжает курс. */
export function nextLesson(ordered: LessonRef[], completed: Set<string>): LessonLink | null {
  const lesson = ordered.find((l) => !completed.has(l.id))
  return lesson ? { slug: lesson.slug, title: lesson.title } : null
}

export type StepCourse = {
  id: string
  totalLessons: number
  completedCount: number
  prerequisitesMet: boolean
  nextLesson: LessonLink | null
}

/**
 * Один курс, к которому стоит вернуться. Начатый важнее нового: бросать курс
 * на середине ради следующего по карте — ровно то, от чего ученика нужно
 * удержать. Среди равных решает порядок курсов в роадмапе.
 */
export function pickNextStep<T extends StepCourse>(courses: T[]): T | null {
  const open = courses.filter(
    (c) => c.prerequisitesMet && c.totalLessons > 0 && c.completedCount < c.totalLessons && c.nextLesson,
  )
  return open.find((c) => c.completedCount > 0) ?? open[0] ?? null
}

export type PrerequisiteRef = { id: string; title: string }

/**
 * Какие курсы закрывают доступ. Пререквизит вне роадмапа или без уроков не
 * блокирует — так же считает и сама проверка доступа на карте.
 */
export function blockingPrerequisites(
  prerequisites: PrerequisiteRef[],
  isCourseComplete: (courseId: string) => boolean | null,
): string[] {
  return prerequisites.filter((p) => isCourseComplete(p.id) === false).map((p) => p.title)
}
