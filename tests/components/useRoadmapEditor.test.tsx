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

async function measureEditor(view: Pick<Awaited<ReturnType<typeof openEditor>>, 'result'>) {
  act(() => view.result.current.setNodes((nodes) => nodes.map((node, index) => ({
    ...node, measured: { width: 240 + index * 20, height: 180 + index * 80 },
  }))))
  await waitFor(() => expect(view.result.current.layoutReady).toBe(true))
}

describe('редактор роадмапа', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi()
  })

  describe('начальная раскладка и явное выравнивание', () => {
    it('ждёт измерения всех карточек и убирает пересечения без dirty и запросов записи', async () => {
      const view = await openEditor()
      expect(view.result.current.layoutReady).toBe(false)
      act(() => view.result.current.setNodes((nodes) => nodes.map((node, index) => index === 0
        ? { ...node, measured: { width: 240, height: 240 } } : node)))
      expect(view.result.current.layoutReady).toBe(false)
      expect(view.result.current.nodes[0].position).toEqual({ x: 100, y: 200 })
      await measureEditor(view)
      const [left, right] = view.result.current.nodes
      expect(left.position.x + (left.measured?.width ?? 0)).toBeLessThan(right.position.x)
      expect(view.result.current.layoutRoutes.e1).toBeDefined()
      expect(view.result.current.isDirty).toBe(false)
      expect(view.result.current.canUndoAlignment).toBe(false)
      expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true)
      expect(left.width).toBeUndefined()
      expect(left.height).toBeUndefined()
    })

    it('сохранение подписи оставляет хранимые координаты до явного выравнивания', async () => {
      const view = await openEditor()
      await measureEditor(view)
      expect(view.result.current.nodes[0].position).not.toEqual({ x: 100, y: 200 })
      act(() => view.result.current.updateNodeData('n1', { label: 'Новая подпись' }))
      await act(async () => view.result.current.saveAll())
      const patch = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ label: 'Новая подпись', positionX: 100, positionY: 200 })
      expect(view.result.current.isDirty).toBe(false)
    })

    it('позднее измерение не отменяет перемещение и очищает устаревшие маршруты', async () => {
      const view = await openEditor()
      await measureEditor(view)
      act(() => view.result.current.onNodesChange([{ type: 'position', id: 'n1', position: { x: 900, y: 750 } }]))
      act(() => view.result.current.setNodes((nodes) => nodes.map((node) => ({ ...node, measured: { width: 290, height: 350 } }))))
      expect(view.result.current.nodes[0].position).toEqual({ x: 900, y: 750 })
      expect(view.result.current.layoutRoutes).toEqual({})
      expect(view.result.current.isDirty).toBe(true)
      await act(async () => view.result.current.saveAll())
      const patch = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ positionX: 900, positionY: 750 })
    })

    it('ручная правка до измерений предотвращает последующий сброс позиции', async () => {
      const view = await openEditor()
      act(() => view.result.current.onNodesChange([{ type: 'position', id: 'n1', position: { x: 450, y: 600 } }]))
      await measureEditor(view)
      expect(view.result.current.nodes[0].position).toEqual({ x: 450, y: 600 })
      expect(view.result.current.layoutRoutes).toEqual({})
    })

    it('явное выравнивание становится pending для всех изменённых позиций, до сохранения запросов нет', async () => {
      const view = await openEditor()
      await measureEditor(view)
      act(() => view.result.current.alignNodes())
      expect(view.result.current.isDirty).toBe(true)
      expect(view.result.current.canUndoAlignment).toBe(true)
      expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true)
      const aligned = structuredClone(view.result.current.nodes.map((node) => ({ id: node.data.payloadId, position: node.position })))
      await act(async () => view.result.current.saveAll())
      const patches = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH')
      expect(patches).toHaveLength(2)
      for (const node of aligned) {
        const patch = patches.find(([url]) => url === `/api/roadmap-nodes/${node.id}`)
        expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ positionX: Math.round(node.position.x), positionY: Math.round(node.position.y) })
      }
      expect(view.result.current.canUndoAlignment).toBe(false)
    })

    it('отмена выравнивания восстанавливает предыдущие dirty, позиции и очередь сохранения', async () => {
      const view = await openEditor()
      await measureEditor(view)
      act(() => view.result.current.updateNodeData('n2', { label: 'Сохранить эту подпись' }))
      act(() => view.result.current.onNodesChange([{ type: 'position', id: 'n1', position: { x: 700, y: 800 } }]))
      const previous = view.result.current.nodes.map((node) => node.position)
      act(() => view.result.current.alignNodes())
      expect(view.result.current.nodes.map((node) => node.position)).not.toEqual(previous)
      act(() => view.result.current.undoAlignment())
      expect(view.result.current.nodes.map((node) => node.position)).toEqual(previous)
      expect(view.result.current.isDirty).toBe(true)
      expect(view.result.current.nodes[1].data.label).toBe('Сохранить эту подпись')
      await act(async () => view.result.current.saveAll())
      const patches = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH')
      expect(JSON.parse(String(patches.find(([url]) => url === '/api/roadmap-nodes/1')?.[1]?.body))).toMatchObject({ positionX: 700, positionY: 800 })
      expect(JSON.parse(String(patches.find(([url]) => url === '/api/roadmap-nodes/2')?.[1]?.body))).toMatchObject({ label: 'Сохранить эту подпись', positionX: 100, positionY: 200 })
    })

    it('отмена выравнивания чистой карты возвращает clean и не оставляет ненужных PATCH', async () => {
      const view = await openEditor()
      await measureEditor(view)
      act(() => view.result.current.alignNodes())
      act(() => view.result.current.undoAlignment())
      expect(view.result.current.isDirty).toBe(false)
      await act(async () => view.result.current.saveAll())
      expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true)
    })

    it('новая ручная правка закрывает отмену предыдущего выравнивания, не затирая последнюю правку', async () => {
      const view = await openEditor()
      await measureEditor(view)
      act(() => view.result.current.alignNodes())
      act(() => view.result.current.updateNodeData('n1', { label: 'Последняя правка' }))
      expect(view.result.current.canUndoAlignment).toBe(false)
      act(() => view.result.current.undoAlignment())
      expect(view.result.current.nodes[0].data.label).toBe('Последняя правка')
      expect(view.result.current.isDirty).toBe(true)
    })

    it('поздняя смена размеров не возвращает устаревшие маршруты при отмене выравнивания', async () => {
      const view = await openEditor()
      await measureEditor(view)
      const previous = view.result.current.nodes.map((node) => node.position)
      act(() => view.result.current.alignNodes())
      act(() => view.result.current.setNodes((nodes) => nodes.map((node) => ({ ...node, measured: { width: 310, height: 360 } }))))
      act(() => view.result.current.undoAlignment())
      expect(view.result.current.nodes.map((node) => node.position)).toEqual(previous)
      expect(view.result.current.layoutRoutes).toEqual({})
      expect(view.result.current.isDirty).toBe(false)
    })
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
      expect(result.current.layoutReady).toBe(true)
    })

    it('ошибка перехода к другой карте не оставляет dirty и очередь записи предыдущей карты', async () => {
      mockApi()
      const view = renderHook(({ roadmapId }) => useRoadmapEditor(roadmapId), { initialProps: { roadmapId: ROADMAP_ID } })
      await waitFor(() => expect(view.result.current.isLoading).toBe(false))
      await measureEditor(view)
      act(() => view.result.current.alignNodes())
      act(() => view.result.current.updateNodeData('n1', { label: 'Правка первой карты' }))
      expect(view.result.current.isDirty).toBe(true)
      mockApi({ roadmapOk: false })
      view.rerender({ roadmapId: ROADMAP_ID + 1 })
      await waitFor(() => expect(view.result.current.error).toBe('Роадмап не найден'))
      expect(view.result.current.isLoading).toBe(false)
      expect(view.result.current.isDirty).toBe(false)
      expect(view.result.current.canUndoAlignment).toBe(false)
      expect(view.result.current.canAlign).toBe(false)
      expect(view.result.current.roadmapInfo).toBeNull()
      expect(view.result.current.nodes).toEqual([])
      expect(view.result.current.edges).toEqual([])
      await act(async () => view.result.current.saveAll())
      expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true)
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
