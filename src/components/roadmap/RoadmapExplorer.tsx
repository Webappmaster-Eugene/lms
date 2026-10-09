'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { boundedQueryText, queryHref, sharedVideoId } from '@/lib/shared-url'
import { ShareButton } from '@/components/ui/ShareButton'
import { List, Network } from 'lucide-react'

import { useHydrated } from '@/hooks/use-hydrated'
import { cn } from '@/lib/utils'
import { RoadmapGraph, isTopicNode } from './RoadmapGraph'
import { RoadmapTopicList } from './RoadmapTopicList'
import type { AnyRoadmapNode, GraphEdge, NodeCourse } from './types'

type View = 'map' | 'list'

/** На телефоне список читабельнее; явная ссылка всегда важнее ширины. */
const NARROW_QUERY = '(max-width: 639px)'

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
  const search = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const current = search.toString()
  const rawView = search.get('view')
  const view: View = rawView === 'map' || rawView === 'list' ? rawView : hydrated && window.matchMedia(NARROW_QUERY).matches ? 'list' : 'map'
  const selectedTopic = sharedVideoId(search.get('topic'))
  const query = boundedQueryText(search.get('q'))
  const hasMap = nodes.some(isTopicNode)
  const topicNodes = nodes.filter(isTopicNode)

  const choose = (next: View) => router.push(queryHref(pathname, current, { view: next }), { scroll: false })
  const chooseTopic = (topic: string | null) => router.push(queryHref(pathname, current, { topic, view }), { scroll: false })
  const changeQuery = (next: string) => router.replace(queryHref(pathname, current, { q: next.slice(0, 160), view }), { scroll: false })
  useEffect(() => {
    if (hydrated && hasMap && rawView !== 'map' && rawView !== 'list') router.replace(queryHref(pathname, current, { view }), { scroll: false })
  }, [hydrated, hasMap, rawView, router, pathname, current, view])

  if (!hasMap) return <RoadmapTopicList nodes={topicNodes} looseCourses={looseCourses} managementRoadmapId={managementRoadmapId} selectedTopic={selectedTopic} onTopicChange={chooseTopic} />

  // До гидратации ширина экрана неизвестна: список на узком экране, место под карту на широком.
  if (!hydrated) {
    return (
      <div>
        <div className="sm:hidden">
          <RoadmapTopicList nodes={topicNodes} looseCourses={looseCourses} managementRoadmapId={managementRoadmapId} selectedTopic={selectedTopic} onTopicChange={chooseTopic} />
        </div>
        <div className="hidden h-[800px] animate-pulse rounded-xl border border-border bg-muted/40 sm:block" />
      </div>
    )
  }

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
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Вид роадмапа" className="inline-flex rounded-lg bg-secondary p-1">
          {tab('map', 'Карта', Network)}
          {tab('list', 'Список по этапам', List)}
        </div>
        <ShareButton />
      </div>
      {view === 'map' ? (
        <RoadmapGraph nodes={nodes} edges={edges} nextStepNodeId={nextStepNodeId} managementRoadmapId={managementRoadmapId} selectedTopic={selectedTopic} onTopicChange={chooseTopic} searchQuery={query} onSearchQueryChange={changeQuery} />
      ) : (
        <RoadmapTopicList nodes={topicNodes} looseCourses={looseCourses} managementRoadmapId={managementRoadmapId} selectedTopic={selectedTopic} onTopicChange={chooseTopic} />
      )}
    </div>
  )
}
