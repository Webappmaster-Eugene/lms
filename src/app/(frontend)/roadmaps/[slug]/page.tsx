import type { Metadata } from 'next'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BookOpen, CheckCircle2, Clock, Lock } from 'lucide-react'
import { MiroEmbed } from '@/components/lesson/MiroEmbed'
import { RoadmapGraph } from '@/components/roadmap/RoadmapGraph'
import type { GraphNode, GraphEdge, NodeStatus, AnnotationGraphNode, AnyRoadmapNode } from '@/components/roadmap/types'
import { STAGE_ANNOTATIONS, STAGE_LEVELS } from '@/components/roadmap/stage-colors'
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
  const courses = await payload.find({
    collection: 'courses',
    where: {
      roadmap: { equals: roadmap.id },
      isPublished: { equals: true },
    },
    sort: 'order',
    limit: 100,
    depth: 1,
  })

  const courseIds = courses.docs.map((c) => String(c.id))

  // BATCH: загружаем ВСЕ уроки всех курсов роадмапа ОДНИМ запросом
  const allLessons = courseIds.length > 0
    ? await payload.find({
        collection: 'lessons',
        where: {
          course: { in: courseIds },
          isPublished: { equals: true },
        },
        limit: 2000,
      })
    : { docs: [], totalDocs: 0 }

  // Группируем уроки по курсу
  const lessonsByCourse = new Map<string, string[]>()
  for (const lesson of allLessons.docs) {
    const cId = String(typeof lesson.course === 'object' ? lesson.course.id : lesson.course)
    if (!lessonsByCourse.has(cId)) lessonsByCourse.set(cId, [])
    lessonsByCourse.get(cId)!.push(String(lesson.id))
  }

  // Прогресс пользователя (один запрос)
  let completedLessonIds = new Set<string>()

  if (user) {
    const progress = await payload.find({
      collection: 'user-progress',
      where: {
        user: { equals: user.id },
        isCompleted: { equals: true },
      },
      limit: 5000,
    })
    completedLessonIds = new Set(
      progress.docs.map((p) =>
        String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson),
      ),
    )
  }

  // Вычисляем прогресс для каждого курса (без доп. запросов!)
  const coursesWithProgress = courses.docs.map((course) => {
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

    return {
      id: cId,
      title: course.title,
      slug: course.slug,
      estimatedHours: course.estimatedHours,
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

  // Загружаем узлы и связи графа роадмапа (параллельно)
  const [nodesResult, edgesResult] = await Promise.all([
    payload.find({
      collection: 'roadmap-nodes',
      where: { roadmap: { equals: roadmap.id } },
      sort: 'order',
      limit: 500,
      depth: 1,
    }),
    payload.find({
      collection: 'roadmap-edges',
      where: { roadmap: { equals: roadmap.id } },
      limit: 500,
      depth: 1,
    }),
  ])

  // Трансформация в формат ReactFlow
  const { graphNodes, graphEdges } = buildGraphData(
    nodesResult.docs,
    edgesResult.docs,
    coursesWithProgress,
  )

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
          <span>{coursesWithProgress.length} курсов</span>
          <span>{totalLessons} уроков</span>
          <span className="hidden sm:inline">
            Клик по узлу графа → переход к курсу
          </span>
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

      {/* Interactive roadmap graph — главный инструмент навигации */}
      {graphNodes.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-foreground">Карта навыков</h2>
          <RoadmapGraph nodes={graphNodes} edges={graphEdges} />
        </section>
      )}

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

      {/* Список курсов — свёрнут, как вспомогательный способ навигации */}
      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-lg font-semibold text-foreground">
          Все курсы роадмапа списком ({coursesWithProgress.length})
        </summary>
        <div className="mt-4 space-y-3">
          {coursesWithProgress.map((course) => {
            const isLocked = !course.prerequisitesMet

            return (
              <div
                key={course.id}
                className={`rounded-lg border bg-background p-4 transition-colors ${
                  isLocked ? 'border-border opacity-60' : 'border-border hover:border-primary/50'
                }`}
              >
                {isLocked ? (
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{course.title}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Пройдите предыдущие курсы для разблокировки
                      </p>
                    </div>
                  </div>
                ) : (
                  <Link href={`/courses/${course.slug}`} className="block">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        {course.isCompleted ? (
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        ) : (
                          <BookOpen className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{course.title}</h3>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {course.completedCount}/{course.totalLessons} уроков
                          </span>
                          {course.estimatedHours != null && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {course.estimatedHours}ч
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">
                        {course.progressPercent}%
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${course.progressPercent}%` }}
                      />
                    </div>
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}

type CourseWithProgress = {
  id: string
  title: string
  slug: string
  estimatedHours: number | null | undefined
  totalLessons: number
  completedCount: number
  isCompleted: boolean
  prerequisitesMet: boolean
  progressPercent: number
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
): { graphNodes: AnyRoadmapNode[]; graphEdges: GraphEdge[] } {
  const courseMap = new Map(coursesWithProgress.map((c) => [c.id, c]))

  const nodeIdSet = new Set<string>()

  const graphNodes: AnyRoadmapNode[] = rawNodes.map((n) => {
    nodeIdSet.add(n.nodeId)

    const linkedCourseId = resolveRelationId(n.course)
    const linkedCourse = linkedCourseId ? courseMap.get(linkedCourseId) ?? null : null

    let status: NodeStatus = 'available'
    let progressPercent = 0
    let totalLessons = 0
    let completedLessons = 0

    if (linkedCourse) {
      totalLessons = linkedCourse.totalLessons
      completedLessons = linkedCourse.completedCount
      progressPercent = linkedCourse.progressPercent
      if (!linkedCourse.prerequisitesMet) status = 'locked'
      else if (linkedCourse.isCompleted) status = 'completed'
      else if (completedLessons > 0) status = 'in-progress'
    }

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
        courseSlug: linkedCourse?.slug ?? null,
        icon: n.icon ?? null,
        description: n.description ?? null,
        status,
        progressPercent,
        totalLessons,
        completedLessons,
        stage: n.stage ?? null,
        color: n.color ?? null,
        bullets,
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

  return { graphNodes, graphEdges }
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

  // Стадии в порядке обучения
  const stageOrder: string[] = ['start', 'base', 'stage1', 'stage2', 'practice', 'advanced', 'growth']

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
      const stageIdx = stageOrder.indexOf(ann.stage)
      const prevStage = stageIdx > 0 ? stageOrder[stageIdx - 1] : null
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
