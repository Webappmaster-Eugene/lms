import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { seedRoadmapNodes } from '@/lib/seed-roadmap-runner'

/**
 * Каталог роадмапов — таблица, набранная руками: узлы и рёбра связаны строковыми
 * nodeId. Опечатка в конце ребра ничего не ломает на выкате — ребро просто молча
 * не создаётся, и в графе пропадает стрелка. Поэтому целостность самих данных
 * проверяется здесь наравне с поведением раннера.
 */

type Row = { id: number } & Record<string, unknown>
type Call = { collection: string; id: number; data: Record<string, unknown> }

function equalsValue(where: unknown, field: string): unknown {
  const clause = (where as Record<string, { equals?: unknown }> | undefined)?.[field]
  return clause?.equals
}

function makePayload(existingCourseSlugs: string[] = []) {
  const created: Call[] = []
  const deleted: { collection: string; roadmap: unknown }[] = []
  const courses = new Map<string, Row>()
  const roadmaps = new Map<string, Row>()
  let nextId = 1000

  existingCourseSlugs.forEach((slug, index) => courses.set(slug, { id: 500 + index, slug }))

  const find = vi.fn(async ({ collection, where }: { collection: string; where?: unknown }) => {
    if (collection === 'courses') {
      const found = courses.get(String(equalsValue(where, 'slug')))
      return { docs: found ? [found] : [] }
    }
    if (collection === 'roadmaps') {
      const found = roadmaps.get(String(equalsValue(where, 'slug')))
      return { docs: found ? [found] : [] }
    }
    return { docs: [] }
  })

  const create = vi.fn(async ({ collection, data }: Omit<Call, 'id'>) => {
    const row: Row = { id: (nextId += 1), ...data }
    created.push({ collection, id: row.id, data })
    if (collection === 'courses') courses.set(String(data.slug), row)
    if (collection === 'roadmaps') roadmaps.set(String(data.slug), row)
    return row
  })

  const remove = vi.fn(async ({ collection, where }: { collection: string; where?: unknown }) => {
    deleted.push({ collection, roadmap: equalsValue(where, 'roadmap') })
    return { docs: [], errors: [] }
  })

  const payload = {
    find,
    create,
    update: vi.fn(async ({ id, data }: { id: number; data: Record<string, unknown> }) => ({ id, ...data })),
    delete: remove,
  } as unknown as Payload

  return { payload, created, deleted, find, create, remove }
}

const rows = (created: Call[], collection: string) =>
  created.filter((entry) => entry.collection === collection).map((entry) => entry.data)

describe('сидирование роадмапов', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('роадмапы', () => {
    it('создаются оба — frontend и backend', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      expect(rows(created, 'roadmaps').map((row) => row.slug)).toEqual([
        'frontend-react',
        'backend-nodejs',
      ])
    })

    it('существующие переиспользуются, а не дублируются', async () => {
      const { payload, created } = makePayload()
      await seedRoadmapNodes(payload)
      const first = rows(created, 'roadmaps').length

      await seedRoadmapNodes(payload)

      expect(rows(created, 'roadmaps')).toHaveLength(first)
    })
  })

  describe('идемпотентность', () => {
    it('старые узлы и рёбра каждого роадмапа удаляются перед пересозданием', async () => {
      const { payload, deleted } = makePayload()

      await seedRoadmapNodes(payload)

      expect(deleted.map((entry) => entry.collection)).toEqual([
        'roadmap-edges',
        'roadmap-nodes',
        'roadmap-edges',
        'roadmap-nodes',
      ])
    })

    it('рёбра удаляются раньше узлов — иначе останутся ссылки в никуда', async () => {
      const { payload, deleted } = makePayload()

      await seedRoadmapNodes(payload)

      expect(deleted[0].collection).toBe('roadmap-edges')
      expect(deleted[1].collection).toBe('roadmap-nodes')
    })

    it('удаление ограничено своим роадмапом', async () => {
      const { payload, deleted } = makePayload()

      await seedRoadmapNodes(payload)

      for (const entry of deleted) expect(typeof entry.roadmap).toBe('number')
      expect(new Set(deleted.map((entry) => entry.roadmap)).size).toBe(2)
    })

    it('повторный прогон даёт ровно тот же граф', async () => {
      const first = makePayload()
      await seedRoadmapNodes(first.payload)
      const second = makePayload()
      await seedRoadmapNodes(second.payload)
      await seedRoadmapNodes(second.payload)

      for (const collection of ['roadmap-nodes', 'roadmap-edges']) {
        expect(rows(second.created, collection)).toHaveLength(
          2 * rows(first.created, collection).length,
        )
      }
    })
  })

  describe('целостность каталога', () => {
    it('ни одно ребро не потеряно — все концы указывают на существующие узлы', async () => {
      const { payload } = makePayload()

      await seedRoadmapNodes(payload)

      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('не найден узел'))
    })

    it('nodeId уникальны', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      const ids = rows(created, 'roadmap-nodes').map((row) => row.nodeId)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('edgeId уникальны', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      const ids = rows(created, 'roadmap-edges').map((row) => row.edgeId)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('граф непустой в обоих роадмапах', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      const byRoadmap = new Map<unknown, number>()
      for (const row of rows(created, 'roadmap-nodes')) {
        byRoadmap.set(row.roadmap, (byRoadmap.get(row.roadmap) ?? 0) + 1)
      }
      expect(byRoadmap.size).toBe(2)
      for (const count of byRoadmap.values()) expect(count).toBeGreaterThan(5)
    })

    it('ребро связывает узлы одного роадмапа', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      const roadmapOfNode = new Map<number, unknown>(
        created
          .filter((entry) => entry.collection === 'roadmap-nodes')
          .map((entry) => [entry.id, entry.data.roadmap]),
      )

      const edges = rows(created, 'roadmap-edges')
      expect(edges.length).toBeGreaterThan(0)
      for (const edge of edges) {
        expect(roadmapOfNode.get(Number(edge.source))).toBe(edge.roadmap)
        expect(roadmapOfNode.get(Number(edge.target))).toBe(edge.roadmap)
      }
    })

    it('координаты узлов заданы числами — иначе узел схлопнется в левый верхний угол', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      for (const row of rows(created, 'roadmap-nodes')) {
        expect(typeof row.positionX).toBe('number')
        expect(typeof row.positionY).toBe('number')
      }
    })

    it('тип, стадия и цвет узла — из допустимых наборов', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      const types = new Set(['category', 'topic', 'subtopic'])
      const stages = new Set(['start', 'base', 'stage1', 'stage2', 'practice', 'advanced', 'growth'])
      const colors = new Set(['yellow', 'lime', 'white', 'gray', 'pink', 'blue', 'red'])

      for (const row of rows(created, 'roadmap-nodes')) {
        expect(types.has(String(row.nodeType)), String(row.nodeId)).toBe(true)
        expect(stages.has(String(row.stage)), String(row.nodeId)).toBe(true)
        expect(colors.has(String(row.color)), String(row.nodeId)).toBe(true)
      }
    })
  })

  describe('рёбра', () => {
    it('рисуются сглаженными и по умолчанию статичны', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      for (const edge of rows(created, 'roadmap-edges')) {
        expect(edge.edgeType).toBe('smoothstep')
        expect(typeof edge.animated).toBe('boolean')
      }
    })
  })

  describe('привязка курсов к узлам', () => {
    it('узел с существующим курсом ссылается на него, заглушку не плодит', async () => {
      const { payload, created } = makePayload(['js-basics'])

      await seedRoadmapNodes(payload)

      const node = rows(created, 'roadmap-nodes').find((row) => row.nodeId === 'fe-js')
      expect(node?.course).toBe(500)
      expect(rows(created, 'courses').some((row) => row.slug === 'rm-fe-js')).toBe(false)
    })

    it('ненайденный курс заменяется заглушкой, и об этом сказано в логе', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      expect(rows(created, 'courses').some((row) => row.slug === 'rm-fe-js')).toBe(true)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('fe-js'))
    })

    it('заглушки получают порядок ниже реальных курсов', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      for (const course of rows(created, 'courses')) {
        if (String(course.slug).startsWith('rm-')) {
          expect(Number(course.order)).toBeGreaterThanOrEqual(1000)
        }
      }
    })

    it('у заглушки есть урок — узел графа должен вести на что-то', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      expect(rows(created, 'lessons').length).toBeGreaterThan(0)
    })

    it('узел без курса поля course не получает — пустая ссылка ломает переход', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      const start = rows(created, 'roadmap-nodes').find((row) => row.nodeId === 'fe-start')
      expect(start).toBeDefined()
      expect(start).not.toHaveProperty('course')
    })
  })

  describe('пункты узла', () => {
    it('непустые сохраняются массивом объектов', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      const html = rows(created, 'roadmap-nodes').find((row) => row.nodeId === 'fe-html')
      expect(html?.bullets).toEqual(
        expect.arrayContaining([expect.objectContaining({ text: expect.any(String) })]),
      )
    })

    it('пустые полем не становятся', async () => {
      const { payload, created } = makePayload()

      await seedRoadmapNodes(payload)

      const start = rows(created, 'roadmap-nodes').find((row) => row.nodeId === 'fe-start')
      expect(start).not.toHaveProperty('bullets')
    })
  })
})
