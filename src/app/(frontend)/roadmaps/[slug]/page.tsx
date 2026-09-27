import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { groupCoursesByNode, summarizeNode } from '@/lib/roadmap-node-courses'
import {
  blockingPrerequisites,
  nextLesson,
  orderCourseLessons,
  pickNextStep,
  type LessonLink,
  type LessonRef,
} from '@/lib/roadmap-next-step'
import { collectAllPages } from '@/lib/paginate'
import { pluralize } from '@/lib/utils'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, PartyPopper } from 'lucide-react'
import { MiroEmbed } from '@/components/lesson/MiroEmbed'
import { RoadmapExplorer } from '@/components/roadmap/RoadmapExplorer'
import type { GraphEdge, AnnotationGraphNode, AnyRoadmapNode, NodeCourse } from '@/components/roadmap/types'
import { STAGE_ANNOTATIONS, STAGE_LEVELS, STAGE_ORDER } from '@/components/roadmap/stage-colors'
import type {
  RoadmapNode as PayloadRoadmapNode,
  RoadmapEdge as PayloadRoadmapEdge,
} from '@/payload-types'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const payload = await getPayload()
  const result = await payload.find({
    collection: 'roadmaps',
    where: { slug: { equals: slug }, isPublished: { equals: true } },
    limit: 1,
  })
  const roadmap = result.docs[0]
  return { title: roadmap?.title ?? 'Роадмап' }
}

export default async function RoadmapDetailPage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  const roadmapResult = await payload.find({
    collection: 'roadmaps',
    where: {
      slug: { equals: slug },
      isPublished: { equals: true },
    },
    limit: 1,
  })

  const roadmap = roadmapResult.docs[0]
  if (!roadmap) return notFound()

  // Загружаем курсы роадмапа
  const courseDocs = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'courses',
        where: {
          roadmap: { equals: roadmap.id },
          isPublished: { equals: true },
        },
        sort: ['order', 'id'],
        depth: 1,
        page,
        limit,
      }),
    { label: `курсы роадмапа «${roadmap.slug}»` },
  )

  const courseIds = courseDocs.map((c) => String(c.id))

  const [lessonDocs, sectionDocs, progressDocs] = await Promise.all([
    courseIds.length > 0
      ? collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'lessons',
              where: {
                course: { in: courseIds },
                isPublished: { equals: true },
              },
              select: { course: true, section: true, order: true, slug: true, title: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `уроки роадмапа «${roadmap.slug}»` },
        )
      : [],
    // Порядок секций нужен, чтобы «Продолжить» вёл в тот же урок, что первым
    // стоит на странице курса.
    courseIds.length > 0
      ? collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'sections',
              where: { course: { in: courseIds }, isPublished: { equals: true } },
              select: { order: true },
              depth: 0,
              sort: ['order', 'id'],
              page,
              limit,
            }),
          { label: `секции роадмапа «${roadmap.slug}»` },
        )
      : [],
    user
      ? collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'user-progress',
              where: {
                user: { equals: user.id },
                isCompleted: { equals: true },
              },
              select: { lesson: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `прогресс пользователя ${user.id}` },
        )
      : [],
  ])

  // Группируем уроки по курсу
  const lessonsByCourse = new Map<string, string[]>()
  for (const lesson of lessonDocs) {
    const cId = String(typeof lesson.course === 'object' ? lesson.course.id : lesson.course)
    const courseLessons = lessonsByCourse.get(cId) ?? []
    courseLessons.push(String(lesson.id))
    lessonsByCourse.set(cId, courseLessons)
  }

  const completedLessonIds = new Set(
    progressDocs.map((p) => String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson)),
  )

  const sectionRank = new Map(sectionDocs.map((section, index) => [String(section.id), index]))
  const lessonRefs: LessonRef[] = lessonDocs.map((lesson) => ({
    id: String(lesson.id),
    slug: lesson.slug,
    title: lesson.title,
    courseId: String(resolveRelationId(lesson.course)),
    sectionId: resolveRelationId(lesson.section),
    order: lesson.order ?? 0,
  }))
  const orderedLessons = orderCourseLessons(lessonRefs, sectionRank)

  const isCourseComplete = (courseId: string): boolean | null => {
    const ids = lessonsByCourse.get(courseId)
    return ids && ids.length > 0 ? ids.every((id) => completedLessonIds.has(id)) : null
  }

  // Вычисляем прогресс для каждого курса (без доп. запросов!)
  const coursesWithProgress = courseDocs.map((course) => {
    const cId = String(course.id)
    const courseLessonIds = lessonsByCourse.get(cId) ?? []
    const totalLessons = courseLessonIds.length
    const completedCount = courseLessonIds.filter((id) => completedLessonIds.has(id)).length
    const isCompleted = totalLessons > 0 && completedCount === totalLessons

    // Пререквизиты: проверяем по тем же данным (без доп. запросов)
    let prerequisitesMet = true
    if (course.prerequisites && Array.isArray(course.prerequisites)) {
      for (const prereq of course.prerequisites) {
        const prereqId = String(typeof prereq === 'object' ? prereq.id : prereq)
        const prereqLessonIds = lessonsByCourse.get(prereqId) ?? []
        if (prereqLessonIds.length > 0) {
          const prereqCompleted = prereqLessonIds.every((id) => completedLessonIds.has(id))
          if (!prereqCompleted) {
            prerequisitesMet = false
            break
          }
        }
      }
    }

    const prerequisites = (course.prerequisites ?? []).flatMap((p) =>
      typeof p === 'object' ? [{ id: String(p.id), title: p.title }] : [],
    )

    return {
      id: cId,
      title: course.title,
      slug: course.slug,
      estimatedHours: course.estimatedHours,
      nextLesson: nextLesson(orderedLessons.get(cId) ?? [], completedLessonIds),
      blockedBy: prerequisitesMet ? [] : blockingPrerequisites(prerequisites, isCourseComplete),
      nodeId: resolveRelationId(course.roadmapNode),
      totalLessons,
      completedCount,
      isCompleted,
      prerequisitesMet,
      progressPercent: totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0,
    }
  })

  // Итого
  const totalLessons = coursesWithProgress.reduce((s, c) => s + c.totalLessons, 0)
  const completedTotal = coursesWithProgress.reduce((s, c) => s + c.completedCount, 0)
  const overallPercent = totalLessons > 0 ? Math.round((completedTotal / totalLessons) * 100) : 0
  const nextStep = pickNextStep(coursesWithProgress)

  // Загружаем узлы и связи графа роадмапа (параллельно)
  const [nodeDocs, edgeDocs] = await Promise.all([
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'roadmap-nodes',
          where: { roadmap: { equals: roadmap.id } },
          sort: ['order', 'id'],
          depth: 1,
          page,
          limit,
        }),
      { label: `узлы роадмапа «${roadmap.slug}»` },
    ),
    collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'roadmap-edges',
          where: { roadmap: { equals: roadmap.id } },
          sort: 'id',
          depth: 1,
          page,
          limit,
        }),
      { label: `связи роадмапа «${roadmap.slug}»` },
    ),
  ])

  // Трансформация в формат ReactFlow
  const { graphNodes, graphEdges, placedCourseIds } = buildGraphData(
    nodeDocs,
    edgeDocs,
    coursesWithProgress,
    nextStep?.id ?? null,
  )
  const nextStepNodeId =
    graphNodes.find((n) => n.type !== 'annotation' && (n.data as { isNextStep?: boolean }).isNextStep)?.id ?? null
  const looseCourses = coursesWithProgress.filter((c) => !placedCourseIds.has(c.id)).map(toNodeCourse)

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <Link
        href="/roadmaps"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Все роадмапы
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{roadmap.title}</h1>
        <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{pluralize(coursesWithProgress.length, 'курс', 'курса', 'курсов')}</span>
          <span>{pluralize(totalLessons, 'урок', 'урока', 'уроков')}</span>
          {graphNodes.length > 0 && (
            <span className="hidden sm:inline">
              Нажмите на тему, чтобы увидеть её курсы и продолжить
            </span>
          )}
        </div>

        <div className="mt-4 max-w-md">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Общий прогресс</span>
            <span className="font-medium text-foreground">{overallPercent}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>
      </div>

      <NextStepCard
        nextStep={nextStep}
        allDone={totalLessons > 0 && completedTotal === totalLessons}
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          {graphNodes.length > 0 ? 'Карта навыков' : 'Курсы роадмапа'}
        </h2>
        <RoadmapExplorer
          nodes={graphNodes}
          edges={graphEdges}
          looseCourses={looseCourses}
          nextStepNodeId={nextStepNodeId}
        />
      </section>

      {/* Miro embed — вторичный вид, сырая доска */}
      {roadmap.miroEmbedUrl && typeof roadmap.miroEmbedUrl === 'string' && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-lg font-semibold text-foreground">
            Оригинальная Miro-доска
          </summary>
          <div className="mt-3">
            <MiroEmbed
              title={`${roadmap.title} — Miro`}
              embedUrl={roadmap.miroEmbedUrl}
              height={600}
            />
          </div>
        </details>
      )}

    </div>
  )
}

type CourseWithProgress = {
  id: string
  title: string
  slug: string
  estimatedHours: number | null | undefined
  nextLesson: LessonLink | null
  blockedBy: string[]
  /** Тема карты, к которой курс привязан (может быть не задана). */
  nodeId: string | null
  totalLessons: number
  completedCount: number
  isCompleted: boolean
  prerequisitesMet: boolean
  progressPercent: number
}

function toNodeCourse(course: CourseWithProgress): NodeCourse {
  return {
    slug: course.slug,
    title: course.title,
    totalLessons: course.totalLessons,
    completedLessons: course.completedCount,
    nextLesson: course.nextLesson,
    blockedBy: course.blockedBy,
  }
}

function NextStepCard({ nextStep, allDone }: { nextStep: CourseWithProgress | null; allDone: boolean }) {
  if (allDone) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
        <PartyPopper className="h-6 w-6 shrink-0 text-success" aria-hidden="true" />
        <p className="text-sm text-foreground">
          Все курсы роадмапа пройдены. Сертификаты — в разделе{' '}
          <Link href="/certificates" className="font-medium underline underline-offset-2">
            «Сертификаты»
          </Link>
          .
        </p>
      </div>
    )
  }
  if (!nextStep?.nextLesson) return null

  const started = nextStep.completedCount > 0
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          {started ? 'Продолжить обучение' : 'Следующий шаг'}
        </p>
        <p className="mt-1 font-semibold text-foreground">{nextStep.nextLesson.title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Курс «{nextStep.title}» · {nextStep.completedCount}/{nextStep.totalLessons} уроков
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/lessons/${nextStep.nextLesson.slug}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {started ? 'Продолжить' : 'Начать'}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href={`/courses/${nextStep.slug}`}
          className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Программа курса
        </Link>
      </div>
    </div>
  )
}

function resolveRelationId(ref: unknown): string | null {
  if (ref && typeof ref === 'object' && 'id' in ref) {
    return String((ref as { id: number | string }).id)
  }
  if (typeof ref === 'number' || typeof ref === 'string') {
    return String(ref)
  }
  return null
}

function resolveNodeId(ref: PayloadRoadmapEdge['source'], edgeId: string, field: 'source' | 'target'): string {
  if (typeof ref === 'object' && ref !== null && 'nodeId' in ref) {
    return ref.nodeId
  }
  // Relation не populate'нут (depth слишком низкий) — ребро будет отброшено в buildGraphData.
  // В dev это почти всегда баг конфигурации запроса, а не валидные данные.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[roadmap] edge "${edgeId}".${field} не populate'нут: ${String(ref)}. Проверьте depth в payload.find({ collection: 'roadmap-edges' }).`,
    )
  }
  return ''
}

function buildGraphData(
  rawNodes: PayloadRoadmapNode[],
  rawEdges: PayloadRoadmapEdge[],
  coursesWithProgress: CourseWithProgress[],
  nextStepCourseId: string | null,
): { graphNodes: AnyRoadmapNode[]; graphEdges: GraphEdge[]; placedCourseIds: Set<string> } {
  const courseMap = new Map(coursesWithProgress.map((c) => [c.id, c]))
  const byNode = groupCoursesByNode(coursesWithProgress)

  const nodeIdSet = new Set<string>()
  const placedCourseIds = new Set<string>()

  const graphNodes: AnyRoadmapNode[] = rawNodes.map((n) => {
    nodeIdSet.add(n.nodeId)

    const linkedCourseId = resolveRelationId(n.course)
    const linkedCourse = linkedCourseId ? courseMap.get(linkedCourseId) ?? null : null

    // Тема без опубликованного курса с уроками — не тупик, а «скоро»:
    // клик по ней никуда не ведёт, но каркас карты сохраняется.
    const summary = summarizeNode(
      linkedCourse,
      byNode.get(String(n.id)) ?? [],
      n.nodeType === 'category',
    )
    const { courses: nodeCourses, totalLessons, completedLessons, progressPercent, status, comingSoon } = summary
    const fullCourses = nodeCourses.flatMap((c) => courseMap.get(c.id) ?? [])
    if (n.nodeType !== 'category') for (const c of fullCourses) placedCourseIds.add(c.id)

    const bullets = Array.isArray(n.bullets)
      ? n.bullets.map((b) => b.text).filter((t): t is string => typeof t === 'string' && t.length > 0)
      : []

    return {
      id: n.nodeId,
      type: n.nodeType,
      position: { x: n.positionX, y: n.positionY },
      data: {
        label: n.label,
        nodeType: n.nodeType,
        courseSlug: comingSoon ? null : (linkedCourse ?? nodeCourses[0])?.slug ?? null,
        courses: comingSoon ? [] : fullCourses.map(toNodeCourse),
        comingSoon,
        icon: n.icon ?? null,
        description: n.description ?? null,
        status,
        progressPercent,
        totalLessons,
        completedLessons,
        stage: n.stage ?? null,
        color: n.color ?? null,
        bullets,
        isNextStep:
          n.nodeType !== 'category' && nextStepCourseId !== null && fullCourses.some((c) => c.id === nextStepCourseId),
      },
    }
  })

  // Добавляем annotation-узлы (привязаны к координатам графа, двигаются при пан/зум)
  graphNodes.push(...buildAnnotationNodes(rawNodes))

  const graphEdges: GraphEdge[] = rawEdges
    .map((e) => ({
      id: e.edgeId,
      source: resolveNodeId(e.source, e.edgeId, 'source'),
      target: resolveNodeId(e.target, e.edgeId, 'target'),
      type: e.edgeType ?? 'smoothstep',
      animated: e.animated === true,
    }))
    .filter((e) => {
      const valid = nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
      if (!valid && process.env.NODE_ENV !== 'production') {
        console.warn(
          `[roadmap] orphan edge "${e.id}": source=${e.source || '<empty>'}, target=${e.target || '<empty>'}. Возможно, узел был удалён или seed неконсистентен.`,
        )
      }
      return valid
    })

  return { graphNodes, graphEdges, placedCourseIds }
}

type StageRange = { minY: number; maxY: number; minX: number; maxX: number }

/**
 * Создаёт annotation-узлы на основе реальных позиций roadmap-узлов.
 * Координаты вычисляются динамически — работает с любым роадмапом.
 */
function buildAnnotationNodes(rawNodes: PayloadRoadmapNode[]): AnnotationGraphNode[] {
  // Группируем узлы по stage для вычисления координат
  const stageRanges = new Map<string, StageRange>()
  for (const n of rawNodes) {
    if (!n.stage) continue
    const range = stageRanges.get(n.stage)
    if (range) {
      range.minY = Math.min(range.minY, n.positionY)
      range.maxY = Math.max(range.maxY, n.positionY)
      range.minX = Math.min(range.minX, n.positionX)
      range.maxX = Math.max(range.maxX, n.positionX)
    } else {
      stageRanges.set(n.stage, {
        minY: n.positionY,
        maxY: n.positionY,
        minX: n.positionX,
        maxX: n.positionX,
      })
    }
  }

  if (stageRanges.size === 0) return []

  const annotations: AnnotationGraphNode[] = []
  let counter = 0

  // Определяем горизонтальные границы всех узлов
  let globalMinX = Infinity
  let globalMaxX = -Infinity
  for (const range of stageRanges.values()) {
    globalMinX = Math.min(globalMinX, range.minX)
    globalMaxX = Math.max(globalMaxX, range.maxX)
  }
  const centerX = Math.round((globalMinX + globalMaxX) / 2)

  for (const ann of STAGE_ANNOTATIONS) {
    const range = stageRanges.get(ann.stage)
    if (!range) continue

    const midY = Math.round((range.minY + range.maxY) / 2)

    // Left label
    if (ann.leftLabel) {
      annotations.push({
        id: `ann-left-${counter++}`,
        type: 'annotation',
        position: { x: globalMinX - 200, y: midY },
        data: { annotationType: 'leftLabel', text: ann.leftLabel },
        selectable: false,
        draggable: false,
      })
    }

    // Right label
    if (ann.rightLabel) {
      annotations.push({
        id: `ann-right-${counter++}`,
        type: 'annotation',
        position: { x: globalMaxX + 280, y: midY },
        data: { annotationType: 'rightLabel', text: ann.rightLabel },
        selectable: false,
        draggable: false,
      })
    }

    // Level badge — между текущей и предыдущей стадией
    const level = STAGE_LEVELS[ann.stage as keyof typeof STAGE_LEVELS]
    if (level) {
      const stageIdx = STAGE_ORDER.indexOf(ann.stage)
      const prevStage = stageIdx > 0 ? STAGE_ORDER[stageIdx - 1] : null
      const prevRange = prevStage ? stageRanges.get(prevStage) : null
      const badgeY = prevRange
        ? Math.round((prevRange.maxY + range.minY) / 2)
        : range.minY - 60

      annotations.push({
        id: `ann-badge-${counter++}`,
        type: 'annotation',
        position: { x: centerX, y: badgeY },
        data: { annotationType: 'levelBadge', text: level },
        selectable: false,
        draggable: false,
      })
    }
  }

  return annotations
}
