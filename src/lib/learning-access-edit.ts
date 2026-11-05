import { maximumLearningRules, type AssignmentRule } from '@/components/learning-access/contracts'
import { buildLearningAccess, type LearningAccessSnapshot, type LearningTargetCollection } from '@/lib/learning-access'

export type CatalogRoadmap = { id: number; title: string; isPublished: boolean }
export type CatalogNode = { id: number; label: string; roadmap: number; course: number | null; nodeType: string | null; sharedCourses: number[] }
export type CatalogCourse = { id: number; title: string; roadmap: number; roadmapNode: number | null; isPublished: boolean; assignedOnly: boolean; isBootcamp: boolean }
export type CatalogSection = { id: number; title: string; course: number; isPublished: boolean }
export type CatalogLesson = { id: number; title: string; course: number; section: number | null; isPublished: boolean }
export type AccessCatalog = { roadmaps: CatalogRoadmap[]; nodes: CatalogNode[]; courses: CatalogCourse[]; sections: CatalogSection[] }

export type AccessState = 'full' | 'partial' | 'closed'
export type TreeTarget = { relationTo: 'roadmaps' | 'courses' | 'sections' | 'lessons'; value: number; title: string }
export type AccessMode = 'all' | 'assigned'
export type AccessInput = { catalog: AccessCatalog; lessons: readonly CatalogLesson[]; rules: readonly AssignmentRule[]; mode: AccessMode; now?: number }
export type ToggleOutcome =
  | { status: 'changed'; rules: AssignmentRule[] }
  | { status: 'confirm'; special: AssignmentRule[] }
  | { status: 'refused'; reason: string }

/** Обычный курс карты: его открывает назначение на карту. Закрытые типы назначаются отдельно. */
export function isOrdinaryCourse(course: CatalogCourse): boolean {
  return course.isPublished && !course.assignedOnly && !course.isBootcamp
}

/** Правило с датами или комментарием нельзя убрать молча: это чьё-то решение, а не состояние отметки. */
export function isSpecialRule(rule: AssignmentRule): boolean {
  return Boolean(rule.startsAt || rule.expiresAt || rule.note.trim())
}

const ruleKey = (rule: AssignmentRule) => `${rule.target.relationTo}:${rule.target.value}`

/** Порядок и служебные поля на доступ не влияют: возврат отметки не считается изменением. */
export function sameRules(left: readonly AssignmentRule[], right: readonly AssignmentRule[]): boolean {
  const normal = (rules: readonly AssignmentRule[]) => JSON.stringify(rules.map((rule) => [ruleKey(rule), rule.effect, rule.startsAt, rule.expiresAt, rule.note]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
  return normal(left) === normal(right)
}

/**
 * Состояния считает сама политика доступа, своей копии правил здесь нет. Скрытый каталог задан
 * намеренно: при нём canReadCourseDescription означает «открыт целиком», а canBrowseSection -
 * «открыта хотя бы часть раздела». Настройка каталога у самого ученика на это не влияет.
 */
function policyOf({ catalog, lessons, rules, mode, now }: AccessInput): LearningAccessSnapshot {
  return buildLearningAccess(
    { id: 1, role: 'student', learningAccessMode: mode, learningCatalogVisibility: 'assigned' },
    [...rules],
    { roadmaps: catalog.roadmaps, nodes: catalog.nodes, courses: catalog.courses, sections: catalog.sections, lessons: [...lessons] },
    now ?? Date.now(),
  )
}

export type AccessEvaluator = {
  lesson: (lesson: CatalogLesson) => AccessState
  section: (id: number) => AccessState
  course: (id: number) => AccessState
  /** Для показа: открытый закрытый курс делает карту хотя бы частично открытой. */
  roadmap: (id: number) => AccessState
  /** Для проверки действия: карта открыта или закрыта по своим обычным курсам. */
  ordinaryRoadmap: (id: number) => AccessState
}

export function evaluateAccess(input: AccessInput): AccessEvaluator {
  const policy = policyOf(input)
  const course = (id: number): AccessState => policy.canReadCourseDescription(id) ? 'full' : policy.canAccessCourse(id) ? 'partial' : 'closed'
  const ordinaryRoadmap = (id: number): AccessState => {
    const states = input.catalog.courses.filter((item) => item.roadmap === id && isOrdinaryCourse(item)).map((item) => course(item.id))
    if (states.length && states.every((state) => state === 'full')) return 'full'
    return states.some((state) => state !== 'closed') ? 'partial' : 'closed'
  }
  return {
    lesson: (lesson) => policy.canAccessLessonMetadata(lesson) ? 'full' : 'closed',
    section: (id) => policy.canReadSectionDescription(id) ? 'full' : policy.canBrowseSection(id) ? 'partial' : 'closed',
    course,
    ordinaryRoadmap,
    roadmap: (id) => {
      const state = ordinaryRoadmap(id)
      if (state !== 'closed') return state
      return input.catalog.courses.some((item) => item.roadmap === id && !isOrdinaryCourse(item) && policy.canAccessCourse(item.id)) ? 'partial' : 'closed'
    },
  }
}

/** Правила самой цели и всего, что под ней. Правила тем соседних курсов и закрытых типов независимы. */
function coveredRules({ catalog, lessons, rules }: AccessInput, target: TreeTarget): AssignmentRule[] {
  const keys = new Set<string>([`${target.relationTo}:${target.value}`])
  const add = (collection: LearningTargetCollection, id: number) => keys.add(`${collection}:${id}`)
  const courses = new Set<number>()
  const sections = new Set<number>()
  if (target.relationTo === 'roadmaps') {
    for (const node of catalog.nodes) if (node.roadmap === target.value) add('roadmap-nodes', node.id)
    for (const course of catalog.courses) {
      if (course.roadmap === target.value && !course.assignedOnly && !course.isBootcamp) { courses.add(course.id); add('courses', course.id) }
    }
  } else if (target.relationTo === 'courses') courses.add(target.value)
  else if (target.relationTo === 'sections') sections.add(target.value)
  for (const section of catalog.sections) {
    if (courses.has(section.course)) { sections.add(section.id); add('sections', section.id) }
  }
  for (const lesson of lessons) {
    if (courses.has(lesson.course) || (lesson.section !== null && sections.has(lesson.section))) add('lessons', lesson.id)
  }
  return rules.filter((rule) => keys.has(`${rule.target.relationTo}:${rule.target.value}`))
}

function targetState(evaluator: AccessEvaluator, input: AccessInput, target: TreeTarget): AccessState {
  if (target.relationTo === 'roadmaps') return evaluator.ordinaryRoadmap(target.value)
  if (target.relationTo === 'courses') return evaluator.course(target.value)
  if (target.relationTo === 'sections') return evaluator.section(target.value)
  const lesson = input.lessons.find((item) => item.id === target.value)
  return lesson ? evaluator.lesson(lesson) : 'closed'
}

/** Разрешение темы открывает и её платный курс, который сама карта открыть не может. */
function opensClosedCourse({ catalog }: AccessInput, rule: AssignmentRule): boolean {
  if (rule.target.relationTo !== 'roadmap-nodes' || rule.effect !== 'allow') return false
  const node = catalog.nodes.find((item) => item.id === rule.target.value)
  return catalog.courses.some((course) => (course.assignedOnly || course.isBootcamp) && (course.roadmapNode === rule.target.value || node?.course === course.id || node?.sharedCourses.includes(course.id)))
}

/**
 * Убирает правила цели и потомков, смотрит, что получилось, и только если этого мало, ставит
 * правило на цель. Так не копятся лишние записи: закрытый курс в открытой карте получит запрет,
 * а открытый только своим правилом просто его лишится.
 */
export function toggleAccess(input: AccessInput, target: TreeTarget, want: 'full' | 'closed', confirmed = false): ToggleOutcome {
  // Открытию карты такое разрешение не мешает, а без него ученик лишился бы платного курса.
  const covered = coveredRules(input, target).filter((rule) => want === 'closed' || !opensClosedCourse(input, rule))
  const special = covered.filter((rule) => isSpecialRule(rule) || opensClosedCourse(input, rule))
  if (special.length && !confirmed) return { status: 'confirm', special }
  const dropped = new Set(covered)
  const kept = input.rules.filter((rule) => !dropped.has(rule))
  let rules = kept
  if (targetState(evaluateAccess({ ...input, rules }), input, target) !== want) {
    const previous = covered.find((rule) => rule.target.relationTo === target.relationTo && rule.target.value === target.value)
    rules = [...kept, { ...(previous?.id === undefined ? {} : { id: previous.id }), target: { relationTo: target.relationTo, value: target.value }, title: target.title, effect: want === 'full' ? 'allow' : 'deny', startsAt: null, expiresAt: null, note: '' }]
  }
  if (rules.length > maximumLearningRules) return { status: 'refused', reason: `Можно сохранить не более ${maximumLearningRules} назначений. Назначьте роадмап или курс целиком.` }
  if (targetState(evaluateAccess({ ...input, rules }), input, target) !== want) return { status: 'refused', reason: want === 'full' ? `Не удалось открыть «${target.title}»: материал не опубликован или в нём нет обычных курсов.` : `Не удалось закрыть «${target.title}»: его курс открыт правилом темы другого роадмапа. Закройте этот курс отдельно или снимите то правило.` }
  return { status: 'changed', rules }
}
