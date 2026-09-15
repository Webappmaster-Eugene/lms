import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import { useEditorSave } from '@/components/roadmap-editor/use-editor-save'
import {
  createEmptyPendingChanges,
  type EditorEdge,
  type EditorNode,
  type EditorNodeData,
  type PendingChanges,
} from '@/components/roadmap-editor/types'

/**
 * Пакетное сохранение правок редактора роадмапа.
 *
 * Порядок операций — часть контракта: новые узлы создаются первыми, потому что
 * рёбра ссылаются на их payloadId, который до сохранения не существует.
 * Перепутанный порядок даст ребро в никуда.
 */

const ROADMAP_ID = 7

type Call = { url: string; method: string; body: Record<string, unknown> | null }

let calls: Call[] = []

function mockApi(
  reply: (call: Call, index: number) => Response = () => Response.json({ doc: { id: 100 } }),
) {
  calls = []
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    }
    calls.push(call)
    return reply(call, calls.length - 1)
  }) as unknown as typeof fetch
}

function node(id: string, overrides: Partial<EditorNodeData> = {}): EditorNode {
  return {
    id,
    type: 'topic',
    position: { x: 10.4, y: 20.6 },
    data: {
      label: `Узел ${id}`,
      nodeType: 'topic',
      icon: null,
      description: null,
      stage: null,
      color: null,
      bullets: ['первый', 'второй'],
      courseId: null,
      courseName: null,
      order: 1,
      payloadId: null,
      nodeId: id,
      ...overrides,
    },
  } as EditorNode
}

function edge(id: string, source: string, target: string): EditorEdge {
  return {
    id,
    source,
    target,
    data: { payloadId: null, edgeType: 'smoothstep', animated: false },
  } as EditorEdge
}

function pendingWith(patch: Partial<PendingChanges>): PendingChanges {
  return { ...createEmptyPendingChanges(), ...patch }
}

async function save(
  nodes: EditorNode[],
  edges: EditorEdge[],
  pending: PendingChanges,
  map = new Map<string, number>(),
) {
  const { result } = renderHook(() => useEditorSave(ROADMAP_ID))
  let outcome!: { ok: boolean; error?: string }
  await act(async () => {
    outcome = await result.current.saveAll(nodes, edges, pending, map)
  })
  return { outcome, map, result }
}

describe('сохранение правок редактора', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi()
  })

  describe('создание узлов', () => {
    it('уходит POST с привязкой к роадмапу', async () => {
      await save([node('n1')], [], pendingWith({ createdNodeIds: new Set(['n1']) }))

      expect(calls[0].url).toBe('/api/roadmap-nodes')
      expect(calls[0].method).toBe('POST')
      expect(calls[0].body).toMatchObject({ roadmap: ROADMAP_ID, nodeId: 'n1', label: 'Узел n1' })
    })

    it('координаты округляются — дробные Payload не принимает', async () => {
      await save([node('n1')], [], pendingWith({ createdNodeIds: new Set(['n1']) }))

      expect(calls[0].body).toMatchObject({ positionX: 10, positionY: 21 })
    })

    it('пункты списка приводятся к виду, который ждёт коллекция', async () => {
      await save([node('n1')], [], pendingWith({ createdNodeIds: new Set(['n1']) }))

      expect(calls[0].body?.bullets).toEqual([{ text: 'первый' }, { text: 'второй' }])
    })

    it('присвоенный сервером id запоминается — на него сошлются рёбра', async () => {
      mockApi(() => Response.json({ doc: { id: 555 } }))

      const { map } = await save([node('n1')], [], pendingWith({ createdNodeIds: new Set(['n1']) }))

      expect(map.get('n1')).toBe(555)
    })

    it('узел, которого нет на канве, пропускается без запроса', async () => {
      await save([], [], pendingWith({ createdNodeIds: new Set(['исчез']) }))

      expect(calls).toHaveLength(0)
    })
  })

  describe('обновление узлов', () => {
    it('уходит PATCH по id, полученному от сервера', async () => {
      await save(
        [node('n1')],
        [],
        pendingWith({ updatedNodeIds: new Set(['n1']) }),
        new Map([['n1', 42]]),
      )

      expect(calls[0].url).toBe('/api/roadmap-nodes/42')
      expect(calls[0].method).toBe('PATCH')
    })

    it('очищенные поля уходят как null, а не пропадают из запроса', async () => {
      await save(
        [node('n1', { description: null, icon: null, courseId: null })],
        [],
        pendingWith({ updatedNodeIds: new Set(['n1']) }),
        new Map([['n1', 42]]),
      )

      expect(calls[0].body).toMatchObject({ description: null, icon: null, course: null })
    })

    it('узел без известного id не обновляется', async () => {
      await save([node('n1')], [], pendingWith({ updatedNodeIds: new Set(['n1']) }), new Map())

      expect(calls).toHaveLength(0)
    })
  })

  describe('удаление', () => {
    it('узел удаляется по id', async () => {
      await save([], [], pendingWith({ deletedNodes: new Map([['n1', 9]]) }))

      expect(calls[0]).toMatchObject({ url: '/api/roadmap-nodes/9', method: 'DELETE' })
    })

    it('ребро удаляется по id', async () => {
      await save([], [], pendingWith({ deletedEdges: new Map([['e1', 3]]) }))

      expect(calls[0]).toMatchObject({ url: '/api/roadmap-edges/3', method: 'DELETE' })
    })
  })

  describe('создание рёбер', () => {
    it('ссылается на серверные id концов, а не на локальные', async () => {
      await save(
        [],
        [edge('e1', 'n1', 'n2')],
        pendingWith({ createdEdgeIds: new Set(['e1']) }),
        new Map([
          ['n1', 11],
          ['n2', 22],
        ]),
      )

      expect(calls[0].url).toBe('/api/roadmap-edges')
      expect(calls[0].body).toMatchObject({ source: 11, target: 22, roadmap: ROADMAP_ID })
    })

    it('ребро с неизвестным концом пропускается, а не создаётся битым', async () => {
      await save(
        [],
        [edge('e1', 'n1', 'n2')],
        pendingWith({ createdEdgeIds: new Set(['e1']) }),
        new Map([['n1', 11]]),
      )

      expect(calls).toHaveLength(0)
    })
  })

  describe('порядок операций', () => {
    it('узлы создаются раньше рёбер — иначе ребру не на что ссылаться', async () => {
      mockApi((call) =>
        Response.json({ doc: { id: call.url.includes('nodes') ? 11 : 99 } }),
      )

      const pending = pendingWith({
        createdNodeIds: new Set(['n1']),
        createdEdgeIds: new Set(['e1']),
      })

      await save([node('n1')], [edge('e1', 'n1', 'n1')], pending)

      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
        'POST /api/roadmap-nodes',
        'POST /api/roadmap-edges',
      ])
    })

    it('полный набор правок идёт в объявленном порядке', async () => {
      const pending = pendingWith({
        createdNodeIds: new Set(['n1']),
        updatedNodeIds: new Set(['n2']),
        deletedNodes: new Map([['n3', 3]]),
        createdEdgeIds: new Set(['e1']),
        deletedEdges: new Map([['e2', 5]]),
      })

      await save(
        [node('n1'), node('n2')],
        [edge('e1', 'n1', 'n2')],
        pending,
        new Map([['n2', 2]]),
      )

      expect(calls.map((c) => c.method)).toEqual(['POST', 'PATCH', 'DELETE', 'POST', 'DELETE'])
    })
  })

  describe('отказ сервера', () => {
    it('возвращается ошибка с названием узла — по ней понятно, что чинить', async () => {
      mockApi(() => new Response('нет прав', { status: 403 }))

      const { outcome } = await save(
        [node('n1', { label: 'Глубокий React' })],
        [],
        pendingWith({ createdNodeIds: new Set(['n1']) }),
      )

      expect(outcome.ok).toBe(false)
      expect(outcome.error).toContain('Глубокий React')
      expect(outcome.error).toContain('нет прав')
    })

    it('дальнейшие правки не отправляются — частичное сохранение хуже отказа', async () => {
      mockApi(() => new Response('сбой', { status: 500 }))

      await save(
        [node('n1'), node('n2')],
        [],
        pendingWith({ createdNodeIds: new Set(['n1', 'n2']) }),
      )

      expect(calls).toHaveLength(1)
    })

    it('сетевой сбой не выбрасывает исключение наружу', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('соединение разорвано')
      }) as unknown as typeof fetch

      const { outcome } = await save([node('n1')], [], pendingWith({ createdNodeIds: new Set(['n1']) }))

      expect(outcome.ok).toBe(false)
      expect(outcome.error).toContain('соединение разорвано')
    })
  })

  describe('признак сохранения', () => {
    it('в покое выключен', () => {
      const { result } = renderHook(() => useEditorSave(ROADMAP_ID))

      expect(result.current.isSaving).toBe(false)
    })

    it('снимается и после успеха, и после отказа', async () => {
      mockApi(() => new Response('сбой', { status: 500 }))

      const { result } = await save([node('n1')], [], pendingWith({ createdNodeIds: new Set(['n1']) }))

      await waitFor(() => expect(result.current.isSaving).toBe(false))
    })
  })

  describe('пустой набор правок', () => {
    it('запросов не делает и отвечает успехом', async () => {
      const { outcome } = await save([], [], createEmptyPendingChanges())

      expect(calls).toHaveLength(0)
      expect(outcome.ok).toBe(true)
    })
  })

  describe('запрос уходит с сессией', () => {
    it('credentials выставлены — иначе Payload ответит 403', async () => {
      const init: RequestInit[] = []
      global.fetch = vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
        init.push(options ?? {})
        return Response.json({ doc: { id: 1 } })
      }) as unknown as typeof fetch

      await save([node('n1')], [], pendingWith({ createdNodeIds: new Set(['n1']) }))

      expect(init[0].credentials).toBe('include')
    })
  })
})
