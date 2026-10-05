'use client'

import { useState } from 'react'
import { List, Network } from 'lucide-react'

import { useHydrated } from '@/hooks/use-hydrated'
import { cn } from '@/lib/utils'
import { RoadmapGraph, isTopicNode } from './RoadmapGraph'
import { RoadmapTopicList } from './RoadmapTopicList'
import type { AnyRoadmapNode, GraphEdge, NodeCourse } from './types'

type View = 'map' | 'list'

const STORAGE_KEY = 'roadmap-view'
/** Уже этой ширины карточки карты мельчат, и список удобнее. */
const NARROW_QUERY = '(max-width: 639px)'

function readSavedView(): View | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved === 'map' || saved === 'list' ? saved : null
  } catch {
    // Хранилище закрыто (приватный режим) — выбор вида просто не запомнится.
    return null
  }
}

function saveView(view: View): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // См. readSavedView: выбор не запомнится, но вид переключится.
  }
}

function initialView(): View {
  return readSavedView() ?? (window.matchMedia(NARROW_QUERY).matches ? 'list' : 'map')
}

type Props = {
  nodes: AnyRoadmapNode[]
  edges: GraphEdge[]
  looseCourses: NodeCourse[]
  nextStepNodeId: string | null
  managementRoadmapId?: number
}

/**
 * Роадмап двумя видами: карта для обзора и список по этапам для телефона и
 * клавиатуры. Выбор запоминается; без выбора на узком экране открыт список.
 */
export function RoadmapExplorer({ nodes, edges, looseCourses, nextStepNodeId, managementRoadmapId }: Props) {
  const hydrated = useHydrated()
  const [chosen, setChosen] = useState<View | null>(null)
  const hasMap = nodes.some(isTopicNode)
  const topicNodes = nodes.filter(isTopicNode)

  const choose = (next: View) => {
    setChosen(next)
    saveView(next)
  }

  if (!hasMap) return <RoadmapTopicList nodes={topicNodes} looseCourses={looseCourses} managementRoadmapId={managementRoadmapId} />

  // До гидратации ширина экрана неизвестна: список на узком экране, место под карту на широком.
  if (!hydrated) {
    return (
      <div>
        <div className="sm:hidden">
          <RoadmapTopicList nodes={topicNodes} looseCourses={looseCourses} managementRoadmapId={managementRoadmapId} />
        </div>
        <div className="hidden h-[800px] animate-pulse rounded-xl border border-border bg-muted/40 sm:block" />
      </div>
    )
  }

  const view = chosen ?? initialView()
  const tab = (value: View, label: string, Icon: typeof List) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === value}
      onClick={() => choose(value)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        view === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  )

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Вид роадмапа" className="inline-flex rounded-lg bg-secondary p-1">
        {tab('map', 'Карта', Network)}
        {tab('list', 'Список по этапам', List)}
      </div>
      {view === 'map' ? (
        <RoadmapGraph nodes={nodes} edges={edges} nextStepNodeId={nextStepNodeId} managementRoadmapId={managementRoadmapId} />
      ) : (
        <RoadmapTopicList nodes={topicNodes} looseCourses={looseCourses} managementRoadmapId={managementRoadmapId} />
      )}
    </div>
  )
}
