import { BOOTCAMP_LOCKED_PATH, coursePath } from '@/lib/course-path'

/**
 * Гайд или буткемп в теме карты. В прогресс, следующий шаг и завершение роадмапа не входит:
 * это дополнительный материал рядом с курсами темы.
 */
export type NodeExtra = {
  key: string
  kind: 'guide' | 'bootcamp'
  title: string
  /** Закрытый гайд ведёт на свою страницу с объяснением, закрытый буткемп — на общий экран без адреса. */
  href: string
  accessAllowed: boolean
  /** Гайд уже открывался учеником. */
  read: boolean
}

export type NodeExtrasSource = { id: number; guides?: number[] | null; bootcamps?: number[] | null }
export type NodeExtraDoc = { id: number; title: string; slug: string }

/**
 * Состав каждой темы: сначала буткемпы, затем гайды, внутри — в порядке, выставленном
 * администратором. В `guides` и `bootcamps` только опубликованные: остальные id отбрасываются.
 */
export function buildNodeExtras({
  nodes,
  guides,
  bootcamps,
  canAccessGuide,
  canBrowseBootcamp,
  readGuideIds,
}: {
  nodes: NodeExtrasSource[]
  guides: NodeExtraDoc[]
  bootcamps: NodeExtraDoc[]
  canAccessGuide: (id: number) => boolean
  canBrowseBootcamp: (id: number) => boolean
  readGuideIds: ReadonlySet<number>
}): Map<number, NodeExtra[]> {
  const guideById = new Map(guides.map((guide) => [guide.id, guide]))
  const bootcampById = new Map(bootcamps.map((bootcamp) => [bootcamp.id, bootcamp]))
  const result = new Map<number, NodeExtra[]>()
  for (const node of nodes) {
    const extras: NodeExtra[] = []
    const seen = new Set<string>()
    for (const id of node.bootcamps ?? []) {
      const bootcamp = bootcampById.get(id)
      if (!bootcamp || seen.has(`bootcamp-${id}`)) continue
      seen.add(`bootcamp-${id}`)
      const open = canBrowseBootcamp(id)
      extras.push({ key: `bootcamp-${id}`, kind: 'bootcamp', title: bootcamp.title, href: open ? coursePath({ slug: bootcamp.slug, isBootcamp: true }) : BOOTCAMP_LOCKED_PATH, accessAllowed: open, read: false })
    }
    for (const id of node.guides ?? []) {
      const guide = guideById.get(id)
      if (!guide || seen.has(`guide-${id}`)) continue
      seen.add(`guide-${id}`)
      const open = canAccessGuide(id)
      extras.push({ key: `guide-${id}`, kind: 'guide', title: guide.title, href: `/guides/${guide.slug}`, accessAllowed: open, read: open && readGuideIds.has(id) })
    }
    if (extras.length) result.set(node.id, extras)
  }
  return result
}
