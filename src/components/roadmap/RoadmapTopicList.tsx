import { CheckCircle2, Circle, CircleDot, Lock, Play } from 'lucide-react'

import { NodeCourseList } from './NodeCourseList'
import { STAGE_ORDER, STAGE_TITLES } from './stage-colors'
import type { GraphNode, NodeCourse, NodeStatus, RoadmapNodeData } from './types'
import type { NodeStage } from './stage-colors'

const STATUS_ICON: Record<NodeStatus, typeof Circle> = {
  locked: Lock,
  available: Circle,
  'in-progress': CircleDot,
  completed: CheckCircle2,
}

const STATUS_COLOR: Record<NodeStatus, string> = {
  locked: 'text-muted-foreground',
  available: 'text-muted-foreground',
  'in-progress': 'text-info',
  completed: 'text-success',
}

type StageGroup = { key: string; title: string; nodes: GraphNode[] }

/** Темы по этапам в порядке обучения, внутри этапа — сверху вниз, как на карте. */
export function groupTopicsByStage(nodes: GraphNode[]): StageGroup[] {
  const topics = nodes.filter((n) => n.type === 'topic' || n.type === 'subtopic')
  const byStage = new Map<NodeStage | null, GraphNode[]>()
  for (const node of topics) {
    const bucket = byStage.get(node.data.stage) ?? []
    bucket.push(node)
    byStage.set(node.data.stage, bucket)
  }

  const groups: StageGroup[] = []
  for (const stage of [...STAGE_ORDER, null]) {
    const bucket = byStage.get(stage)
    if (!bucket?.length) continue
    bucket.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    groups.push({ key: stage ?? 'other', title: stage ? STAGE_TITLES[stage] : 'Другие темы', nodes: bucket })
  }
  return groups
}

function TopicRow({ data }: { data: RoadmapNodeData }) {
  const Icon = STATUS_ICON[data.status]

  return (
    <details
      open={data.isNextStep}
      className="group rounded-lg border border-border bg-background open:border-primary/40"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <Icon className={`h-4 w-4 shrink-0 ${STATUS_COLOR[data.status]}`} aria-hidden="true" />
        <span className="flex-1 text-sm font-medium text-foreground">{data.label}</span>
        {data.isNextStep && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
            <Play className="h-3 w-3" aria-hidden="true" />
            Следующий шаг
          </span>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {data.comingSoon ? 'готовится' : data.totalLessons > 0 ? `${data.progressPercent}%` : ''}
        </span>
      </summary>
      <div className="border-t border-border p-3">
        {data.description && <p className="mb-3 text-sm text-muted-foreground">{data.description}</p>}
        {data.courses.length > 0 ? (
          <NodeCourseList courses={data.courses} />
        ) : (
          <p className="text-sm text-muted-foreground">Курсов по этой теме пока нет.</p>
        )}
      </div>
    </details>
  )
}

/**
 * Карта в виде списка: читается на телефоне, проходится с клавиатуры и
 * скринридером. Карта остаётся основным видом на широком экране.
 */
export function RoadmapTopicList({ nodes, looseCourses }: { nodes: GraphNode[]; looseCourses: NodeCourse[] }) {
  const groups = groupTopicsByStage(nodes)

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
          <div className="space-y-2">
            {group.nodes.map((node) => (
              <TopicRow key={node.id} data={node.data} />
            ))}
          </div>
        </section>
      ))}

      {looseCourses.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {groups.length > 0 ? 'Курсы вне карты' : 'Курсы роадмапа'}
          </h3>
          <NodeCourseList courses={looseCourses} />
        </section>
      )}
    </div>
  )
}
