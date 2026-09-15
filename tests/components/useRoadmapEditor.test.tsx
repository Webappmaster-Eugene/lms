import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())

const { useRoadmapEditor } = await import('@/components/roadmap-editor/use-roadmap-editor')

/**
 * Машина состояний редактора роадмапа.
 *
 * Правки копятся в памяти и уходят на сервер одним пакетом, поэтому почти
 * каждая ошибка здесь не падает, а тихо портит карту: удалённый узел
 * оставляет висящие рёбра, повторная связь дублируется, а несохранённые
 * изменения теряются при уходе со страницы.
 */

const ROADMAP_ID = 7

function payloadNode(nodeId: string, id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    nodeId,
    label: `Узел ${nodeId}`,
    nodeType: 'topic',
    positionX: 100,
    positionY: 200,
    bullets: [{ text: 'пункт' }],
    order: 1,
    ...overrides,
  }
}

function payloadEdge(edgeId: string, id: number, source: string, target: string) {
  return {
    id,
    edgeId,
    source: { nodeId: source },
    target: { nodeId: target },
    edgeType: 'smoothstep',
    animated: false,
  }
}

/** Ответы загрузки. Сохранение по умолчанию успешно. */
function mockApi({
  nodes = [payloadNode('n1', 1), payloadNode('n2', 2)],
  edges = [payloadEdge('e1', 10, 'n1', 'n2')],
  roadmapOk = true,
  saveOk = true,
}: {
  nodes?: unknown[]
  edges?: unknown[]
  roadmapOk?: boolean
  saveOk?: boolean
} = {}) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)

    if (init?.method && init.method !== 'GET') {
      if (!saveOk) return new Response('отказ', { status: 500 })
      return Response.json({ doc: { id: 999 } })
    }
    if (url.includes('/api/roadmaps/')) {
      return roadmapOk
        ? Response.json({ id: ROADMAP_ID, title: 'Frontend React', slug: 'frontend-react' })
        : new Response('нет', { status: 404 })
    }
    if (url.includes('/api/roadmap-nodes')) return Response.json({ docs: nodes })
    if (url.includes('/api/roadmap-edges')) return Response.json({ docs: edges })
    return Response.json({})
  }) as unknown as typeof fetch
}

/** Поднимает редактор и дожидается конца загрузки. */
async function openEditor(options: Parameters<typeof mockApi>[0] = {}) {
  mockApi(options)
  const view = renderHook(() => useRoadmapEditor(ROADMAP_ID))
  await waitFor(() => expect(view.result.current.isLoading).toBe(false))
  return view
}

describe('редактор роадмапа', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi()
  })

  describe('загрузка', () => {
    it('до ответа показывает загрузку', () => {
      mockApi()
      const { result } = renderHook(() => useRoadmapEditor(ROADMAP_ID))

      expect(result.current.isLoading).toBe(true)
    })

    it('узлы и рёбра раскладываются в состояние', async () => {
      const { result } = await openEditor()

      expect(result.current.nodes).toHaveLength(2)
      expect(result.current.edges).toHaveLength(1)
      expect(result.current.roadmapInfo).toMatchObject({ title: 'Frontend React' })
    })

    it('координаты и подписи переносятся из документа', async () => {
      const { result } = await openEditor()
      const node = result.current.nodes[0]

      expect(node.position).toEqual({ x: 100, y: 200 })
      expect(node.data.label).toBe('Узел n1')
      expect(node.data.bullets).toEqual(['пункт'])
    })

    it('пустые пункты списка отбрасываются', async () => {
      const { result } = await openEditor({
        nodes: [payloadNode('n1', 1, { bullets: [{ text: 'есть' }, { text: '' }, {}] })],
        edges: [],
      })

      expect(result.current.nodes[0].data.bullets).toEqual(['есть'])
    })

    it('ребро с неразвёрнутым концом пропускается — рисовать его не от чего', async () => {
      const { result } = await openEditor({
        edges: [{ id: 1, edgeId: 'e1', source: 5, target: { nodeId: 'n2' } }],
      })

      expect(result.current.edges).toHaveLength(0)
    })

    it('свежезагруженный редактор считается чистым', async () => {
      const { result } = await openEditor()

      expect(result.current.isDirty).toBe(false)
    })

    it('отказ загрузки показывается ошибкой, а не пустой канвой', async () => {
      mockApi({ roadmapOk: false })
      const { result } = renderHook(() => useRoadmapEditor(ROADMAP_ID))

      await waitFor(() => expect(result.current.error).toBe('Роадмап не найден'))
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('перемещение узла', () => {
    it('помечает роадмап несохранённым', async () => {
      const { result } = await openEditor()

      act(() =>
        result.current.onNodesChange([
          { type: 'position', id: 'n1', position: { x: 300, y: 400 } },
        ]),
      )

      expect(result.current.isDirty).toBe(true)
      expect(result.current.nodes[0].position).toEqual({ x: 300, y: 400 })
    })

    it('попадает в обновления при сохранении', async () => {
      const { result } = await openEditor()

      act(() =>
        result.current.onNodesChange([
          { type: 'position', id: 'n1', position: { x: 300, y: 400 } },
        ]),
      )
      await act(async () => {
        await result.current.saveAll()
      })

      const patch = vi.mocked(global.fetch).mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PATCH',
      )
      expect(patch?.[0]).toBe('/api/roadmap-nodes/1')
    })
  })

  describe('удаление узла', () => {
    it('уносит с собой входящие и исходящие рёбра', async () => {
      const { result } = await openEditor()

      act(() => result.current.onNodesChange([{ type: 'remove', id: 'n1' }]))

      await waitFor(() => expect(result.current.edges).toHaveLength(0))
      expect(result.current.nodes).toHaveLength(1)
    })

    it('и узел, и его рёбра попадают в удаление на сервере', async () => {
      const { result } = await openEditor()

      act(() => result.current.onNodesChange([{ type: 'remove', id: 'n1' }]))
      await act(async () => {
        await result.current.saveAll()
      })

      const deletes = vi
        .mocked(global.fetch)
        .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')
        .map(([url]) => String(url))

      expect(deletes).toContain('/api/roadmap-nodes/1')
      expect(deletes).toContain('/api/roadmap-edges/10')
    })

    it('снимает выделение, если удалён выделенный узел', async () => {
      const { result } = await openEditor()

      act(() => result.current.selectNode('n1'))
      act(() => result.current.onNodesChange([{ type: 'remove', id: 'n1' }]))

      expect(result.current.selectedNodeId).toBeNull()
    })

    it('несохранённый узел просто исчезает, на сервер за ним не ходим', async () => {
      const { result } = await openEditor({ nodes: [], edges: [] })

      act(() => result.current.addNode('topic', { x: 0, y: 0 }))
      const created = result.current.nodes[0].id
      act(() => result.current.onNodesChange([{ type: 'remove', id: created }]))
      await act(async () => {
        await result.current.saveAll()
      })

      const writes = vi
        .mocked(global.fetch)
        .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== undefined)
      expect(writes).toHaveLength(0)
    })
  })

  describe('связи между узлами', () => {
    it('новая связь добавляется на канву', async () => {
      const { result } = await openEditor({ edges: [] })

      act(() => result.current.onConnect({ source: 'n1', target: 'n2' } as never))

      await waitFor(() => expect(result.current.edges).toHaveLength(1))
      expect(result.current.isDirty).toBe(true)
    })

    it('повторная связь тех же узлов не создаётся', async () => {
      const { result } = await openEditor({ edges: [] })

      act(() => result.current.onConnect({ source: 'n1', target: 'n2' } as never))
      await waitFor(() => expect(result.current.edges).toHaveLength(1))
      act(() => result.current.onConnect({ source: 'n1', target: 'n2' } as never))

      expect(result.current.edges).toHaveLength(1)
    })

    it('обратная связь — это другая связь', async () => {
      const { result } = await openEditor({ edges: [] })

      act(() => result.current.onConnect({ source: 'n1', target: 'n2' } as never))
      await waitFor(() => expect(result.current.edges).toHaveLength(1))
      act(() => result.current.onConnect({ source: 'n2', target: 'n1' } as never))

      await waitFor(() => expect(result.current.edges).toHaveLength(2))
    })

    it('удаление связи помечает её к удалению на сервере', async () => {
      const { result } = await openEditor()

      act(() => result.current.onEdgesChange([{ type: 'remove', id: 'e1' }]))
      await act(async () => {
        await result.current.saveAll()
      })

      const deletes = vi
        .mocked(global.fetch)
        .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')
        .map(([url]) => String(url))

      expect(deletes).toEqual(['/api/roadmap-edges/10'])
    })
  })

  describe('добавление узла', () => {
    it('появляется на канве и сразу выделяется', async () => {
      const { result } = await openEditor({ nodes: [], edges: [] })

      act(() => result.current.addNode('category', { x: 50, y: 60 }))

      expect(result.current.nodes).toHaveLength(1)
      expect(result.current.selectedNodeId).toBe(result.current.nodes[0].id)
      expect(result.current.isDirty).toBe(true)
    })

    it.each([
      ['category', 'Новая категория'],
      ['topic', 'Новая тема'],
      ['subtopic', 'Новая подтема'],
    ] as const)('тип %s получает осмысленную подпись', async (type, label) => {
      const { result } = await openEditor({ nodes: [], edges: [] })

      act(() => result.current.addNode(type, { x: 0, y: 0 }))

      expect(result.current.nodes[0].data.label).toBe(label)
      expect(result.current.nodes[0].type).toBe(type)
    })

    it('у двух новых узлов разные идентификаторы', async () => {
      const { result } = await openEditor({ nodes: [], edges: [] })

      act(() => result.current.addNode('topic', { x: 0, y: 0 }))
      act(() => result.current.addNode('topic', { x: 10, y: 10 }))

      expect(result.current.nodes[0].id).not.toBe(result.current.nodes[1].id)
    })
  })

  describe('правка узла из боковой панели', () => {
    it('меняет только указанные поля', async () => {
      const { result } = await openEditor()

      act(() => result.current.updateNodeData('n1', { label: 'Новое имя' }))

      expect(result.current.nodes[0].data.label).toBe('Новое имя')
      expect(result.current.nodes[0].data.bullets).toEqual(['пункт'])
    })

    it('смена типа обновляет и тип узла на канве', async () => {
      const { result } = await openEditor()

      act(() => result.current.updateNodeData('n1', { nodeType: 'category' }))

      expect(result.current.nodes[0].type).toBe('category')
      expect(result.current.nodes[0].data.nodeType).toBe('category')
    })

    it('соседние узлы не затрагиваются', async () => {
      const { result } = await openEditor()

      act(() => result.current.updateNodeData('n1', { label: 'Новое имя' }))

      expect(result.current.nodes[1].data.label).toBe('Узел n2')
    })
  })

  describe('удаление выделенного', () => {
    it('без выделения ничего не делает', async () => {
      const { result } = await openEditor()

      act(() => result.current.deleteSelected())

      expect(result.current.nodes).toHaveLength(2)
      expect(result.current.isDirty).toBe(false)
    })

    it('убирает узел вместе со связями', async () => {
      const { result } = await openEditor()

      act(() => result.current.selectNode('n1'))
      act(() => result.current.deleteSelected())

      await waitFor(() => expect(result.current.nodes).toHaveLength(1))
      expect(result.current.edges).toHaveLength(0)
      expect(result.current.selectedNodeId).toBeNull()
    })
  })

  describe('сохранение', () => {
    it('успех сбрасывает признак несохранённых правок', async () => {
      const { result } = await openEditor()

      act(() => result.current.updateNodeData('n1', { label: 'Новое имя' }))
      expect(result.current.isDirty).toBe(true)

      await act(async () => {
        await result.current.saveAll()
      })

      expect(result.current.isDirty).toBe(false)
    })

    it('отказ сохраняет правки — иначе работа пропадёт', async () => {
      const { result } = await openEditor({ saveOk: false })

      act(() => result.current.updateNodeData('n1', { label: 'Новое имя' }))
      await act(async () => {
        await result.current.saveAll()
      })

      expect(result.current.isDirty).toBe(true)
      expect(result.current.error).toBeTruthy()
    })

    it('созданный узел получает серверный id, чтобы второе сохранение его обновило', async () => {
      const { result } = await openEditor({ nodes: [], edges: [] })

      act(() => result.current.addNode('topic', { x: 0, y: 0 }))
      await act(async () => {
        await result.current.saveAll()
      })

      expect(result.current.nodes[0].data.payloadId).toBe(999)
    })
  })

  describe('выделение', () => {
    it('выделяется и снимается', async () => {
      const { result } = await openEditor()

      act(() => result.current.selectNode('n2'))
      expect(result.current.selectedNodeId).toBe('n2')

      act(() => result.current.deselectNode())
      expect(result.current.selectedNodeId).toBeNull()
    })
  })
})
