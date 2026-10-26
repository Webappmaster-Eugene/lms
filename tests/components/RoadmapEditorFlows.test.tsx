import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@xyflow/react', async () => (await import('../helpers/component-mocks')).xyflowMock())

const { NodeSidePanel } = await import('@/components/roadmap-editor/NodeSidePanel')
const { EditorToolbar } = await import('@/components/roadmap-editor/EditorToolbar')
const { RoadmapEditorClient } = await import('@/components/roadmap-editor/RoadmapEditorClient')
const { useEditorSave } = await import('@/components/roadmap-editor/use-editor-save')
const { useRoadmapEditor } = await import('@/components/roadmap-editor/use-roadmap-editor')

import { createEmptyPendingChanges, type EditorEdge, type EditorNode, type EditorNodeData, type PendingChanges } from '@/components/roadmap-editor/types'

/**
 * Визуальный редактор роадмапа: панель узла, связка панели с канвой и пакетное
 * сохранение. Правки копятся в памяти, поэтому ошибка здесь не падает, а тихо
 * теряет работу администратора.
 */

const ROADMAP_ID = 7

function editorNode(id: string, data: Partial<EditorNodeData> = {}, position = { x: 120.4, y: 80.6 }): EditorNode {
  return {
    id, type: data.nodeType ?? 'topic', position,
    data: { label: `Узел ${id}`, nodeType: 'topic', icon: null, description: null, stage: null, color: null, bullets: [], courseId: null, courseName: null, order: 1, payloadId: 10, nodeId: id, ...data },
  } as EditorNode
}

function payloadNode(nodeId: string, id: number, label = `Узел ${nodeId}`) {
  return { id, nodeId, label, nodeType: 'topic', positionX: 100, positionY: 200, bullets: [], order: 1 }
}

type Reply = (url: string, init?: RequestInit) => Response | Promise<Response>
let reply: Reply

function api({ nodes = [payloadNode('n1', 1, 'React'), payloadNode('n2', 2, 'Redux')], edges = [{ id: 10, edgeId: 'e1', source: { nodeId: 'n1' }, target: { nodeId: 'n2' }, edgeType: 'smoothstep', animated: false }], roadmapOk = true, save }: { nodes?: unknown[]; edges?: unknown[]; roadmapOk?: boolean; save?: Reply } = {}) {
  reply = (url, init) => {
    if (init?.method && init.method !== 'GET') return save ? save(url, init) : Response.json({ doc: { id: 999 } })
    if (url.includes('/api/roadmaps/')) return roadmapOk ? Response.json({ id: ROADMAP_ID, title: 'Frontend React', slug: 'frontend-react' }) : new Response('нет', { status: 404 })
    if (url.includes('/api/roadmap-nodes')) return Response.json({ docs: nodes })
    if (url.includes('/api/roadmap-edges')) return Response.json({ docs: edges })
    if (url.includes('/api/courses')) return Response.json({ docs: [{ id: 51, title: 'Глубокий React', slug: 'deep-react' }, { id: 52, title: 'Redux Toolkit', slug: 'rtk' }] })
    return Response.json({})
  }
}

const writes = () => vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method && init.method !== 'GET').map(([url, init]) => `${init?.method} ${String(url)}`)

beforeEach(() => {
  vi.clearAllMocks()
  api()
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => Promise.resolve(reply(String(url), init))))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('панель свойств узла', () => {
  const onUpdate = vi.fn()
  const panel = (data: Partial<EditorNodeData> = {}, position?: { x: number; y: number }) => render(<NodeSidePanel node={editorNode('n1', data, position)} roadmapId={ROADMAP_ID} onUpdate={onUpdate} onDelete={vi.fn()} onClose={vi.fn()} />)

  it('под-темы добавляются, правятся и удаляются по одной', async () => {
    const user = userEvent.setup()
    panel({ bullets: ['Хуки', 'Контекст'] })

    expect(screen.getByText('Под-темы (2)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Добавить под-тему' }))
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { bullets: ['Хуки', 'Контекст', ''] })

    fireEvent.change(screen.getByPlaceholderText('Под-тема 2'), { target: { value: 'useContext' } })
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { bullets: ['Хуки', 'useContext'] })

    const second = screen.getByPlaceholderText('Под-тема 2').parentElement as HTMLElement
    await user.click(within(second).getByRole('button'))
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { bullets: ['Хуки'] })
  })

  it('после двадцати под-тем добавлять новые нельзя', () => {
    panel({ bullets: Array.from({ length: 20 }, (_, index) => `Пункт ${index + 1}`) })

    expect(screen.getByText('Под-темы (20)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Добавить под-тему' })).not.toBeInTheDocument()
  })

  it('сброс цвета и иконки и пустое описание уходят как null, а не пустая строка', async () => {
    const user = userEvent.setup()
    panel({ color: 'pink', icon: 'rocket', description: 'Старт' })

    await user.selectOptions(screen.getByDisplayValue('Pink (Start/End)'), '')
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { color: null })
    await user.selectOptions(screen.getByDisplayValue('Rocket'), '')
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { icon: null })
    fireEvent.change(screen.getByPlaceholderText('Краткое описание (max 300)'), { target: { value: '' } })
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { description: null })
  })

  it('цвет, иконка и описание сообщаются наверх, у описания виден счётчик', async () => {
    const user = userEvent.setup()
    panel({ description: 'Хуки' })

    expect(screen.getByText('4/300')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Краткое описание (max 300)')).toHaveAttribute('maxlength', '300')
    await user.selectOptions(screen.getByDisplayValue('По стадии'), 'lime')
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { color: 'lime' })
    await user.selectOptions(screen.getByDisplayValue('Без иконки'), 'database')
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { icon: 'database' })
  })

  it('порядок принимает только число, нечисловое значение становится нулём', () => {
    panel({ order: 3 })
    const order = screen.getByDisplayValue('3')

    fireEvent.change(order, { target: { value: '7' } })
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { order: 7 })
    fireEvent.change(order, { target: { value: '' } })
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { order: 0 })
  })

  it('привязка курса передаёт и id, и название; отвязка очищает оба', async () => {
    const user = userEvent.setup()
    panel({ courseId: 51, courseName: 'Глубокий React' })
    const course = screen.getByRole('option', { name: 'Не привязан' }).closest('select') as HTMLSelectElement
    expect(course).toBeDisabled()
    await waitFor(() => expect(course).toBeEnabled())
    expect(course).toHaveValue('51')

    await user.selectOptions(course, '52')
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { courseId: 52, courseName: 'Redux Toolkit' })
    await user.selectOptions(course, '')
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { courseId: null, courseName: null })
  })

  it('сохранённому узлу нельзя менять Node ID, новому — можно', () => {
    const view = panel({ payloadId: 10, nodeId: 'react-node' })
    expect(screen.getByDisplayValue('react-node')).toHaveAttribute('readonly')

    view.unmount()
    onUpdate.mockClear()
    panel({ payloadId: null, nodeId: 'draft-node' })
    const nodeId = screen.getByDisplayValue('draft-node')
    expect(nodeId).not.toHaveAttribute('readonly')
    fireEvent.change(nodeId, { target: { value: 'react-hooks' } })
    expect(onUpdate).toHaveBeenLastCalledWith('n1', { nodeId: 'react-hooks' })
  })

  it('показывает округлённую позицию и превью с названием, а без названия — заглушку', () => {
    const view = panel({ label: 'React' }, { x: 120.4, y: 80.6 })
    expect(screen.getByDisplayValue('120')).toHaveAttribute('readonly')
    expect(screen.getByDisplayValue('81')).toHaveAttribute('readonly')
    expect(screen.getByText('React')).toBeInTheDocument()

    view.unmount()
    panel({ label: '' })
    expect(screen.getByText('Preview')).toBeInTheDocument()
  })

  // Дефект: подписи Field (NodeSidePanel.tsx:289) — отдельный <label> без htmlFor и без вложенного поля,
  // поэтому ни одно поле панели не имеет доступного имени: экранный диктор читает «поле ввода» без подписи.
  it.fails('поля панели находятся по своим подписям — дефект: label не связан с полем', () => {
    panel({ label: 'React' })

    expect(screen.getByLabelText('Название')).toHaveValue('React')
    expect(screen.getByLabelText('Тип узла')).toHaveValue('topic')
  })

  // Дефект: кнопки-иконки закрытия панели (NodeSidePanel.tsx:141) и удаления под-темы (:248) без aria-label —
  // с клавиатурой и диктором их назначение не узнать.
  it.fails('кнопки-иконки названы для экранного диктора — дефект: нет aria-label', () => {
    panel({ bullets: ['Хуки'] })

    expect(screen.getByRole('button', { name: /Закрыть/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Удалить под-тему/ })).toBeInTheDocument()
  })
})

describe('меню добавления узла', () => {
  const toolbar = (onAddNode = vi.fn()) => render(<EditorToolbar roadmapInfo={{ id: ROADMAP_ID, title: 'Frontend React', slug: 'frontend-react' }} isDirty={false} isSaving={false} hasSelection={false} onAddNode={onAddNode} onDeleteSelected={vi.fn()} onSave={vi.fn()} canAlign canUndoAlignment={false} onAlign={vi.fn()} onUndoAlignment={vi.fn()} />)

  it('клик мимо меню закрывает его, ничего не добавляя', async () => {
    const user = userEvent.setup()
    const onAddNode = vi.fn()
    const view = toolbar(onAddNode)
    await user.click(screen.getByRole('button', { name: /Добавить/ }))
    expect(screen.getByRole('button', { name: 'Категория' })).toBeInTheDocument()

    await user.click(view.container.querySelector('div[style*="position: fixed"]') as HTMLElement)

    expect(screen.queryByRole('button', { name: 'Категория' })).not.toBeInTheDocument()
    expect(onAddNode).not.toHaveBeenCalled()
  })

  // Без aria-expanded диктор не узнает, что под кнопкой появился список видов узла.
  it('кнопка «Добавить» сообщает, раскрыто ли меню', async () => {
    const user = userEvent.setup()
    toolbar()
    const add = screen.getByRole('button', { name: /Добавить/ })

    expect(add).toHaveAttribute('aria-expanded', 'false')
    await user.click(add)
    expect(add).toHaveAttribute('aria-expanded', 'true')
  })

  // С клавиатуры меню закрывают Escape; фокус возвращается на кнопку, чтобы не потерять место на панели.
  it('Escape закрывает меню и возвращает фокус на кнопку', async () => {
    const user = userEvent.setup()
    toolbar()
    const add = screen.getByRole('button', { name: /Добавить/ })
    await user.click(add)
    // Как в Safari: клик не оставляет фокус на кнопке.
    add.blur()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'Категория' })).not.toBeInTheDocument()
    expect(add).toHaveAttribute('aria-expanded', 'false')
    expect(add).toHaveFocus()
  })
})

describe('редактор роадмапа целиком', () => {
  const unloadPrevented = () => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  }

  async function openEditor() {
    const user = userEvent.setup()
    render(<RoadmapEditorClient roadmapId={ROADMAP_ID} />)
    expect(screen.getByText('Загрузка роадмапа...')).toBeInTheDocument()
    await screen.findByText(/Frontend React/)
    return user
  }

  it('новый узел появляется в центре экрана, сразу выделяется и защищает уход со страницы', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const user = await openEditor()
    expect(unloadPrevented()).toBe(false)

    await user.click(screen.getByRole('button', { name: /Добавить/ }))
    await user.click(screen.getByRole('button', { name: 'Тема' }))

    expect(screen.getByText('Свойства узла')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Название узла')).toHaveValue('Новая тема')
    expect(screen.getByDisplayValue('500')).toBeInTheDocument()
    expect(screen.getByDisplayValue('400')).toBeInTheDocument()
    expect(screen.getAllByTestId('flow-node')).toHaveLength(3)
    expect(unloadPrevented()).toBe(true)
  })

  it('клик по узлу открывает его свойства, правка названия видна на канве', async () => {
    const user = await openEditor()

    await user.click(screen.getAllByTestId('flow-node')[0])
    const label = screen.getByPlaceholderText('Название узла')
    expect(label).toHaveValue('React')
    await user.clear(label)
    await user.type(label, 'React 19')

    expect(within(screen.getAllByTestId('flow-node')[0]).getByText('React 19')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()
  })

  it('удаление из панели убирает узел и закрывает панель', async () => {
    const user = await openEditor()
    await user.click(screen.getAllByTestId('flow-node')[1])

    await user.click(screen.getByRole('button', { name: 'Удалить узел' }))

    expect(screen.queryByText('Свойства узла')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('flow-node')).toHaveLength(1)
  })

  it('отказ сохранения показывается баннером, правки остаются несохранёнными', async () => {
    api({ save: () => new Response('нет прав', { status: 403 }) })
    const user = await openEditor()
    await user.click(screen.getAllByTestId('flow-node')[0])
    await user.type(screen.getByPlaceholderText('Название узла'), '!')

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('Ошибка обновления узла "React!": нет прав')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()
    expect(unloadPrevented()).toBe(true)
  })

  it('успешное сохранение снимает защиту ухода со страницы', async () => {
    const user = await openEditor()
    await user.click(screen.getAllByTestId('flow-node')[0])
    await user.type(screen.getByPlaceholderText('Название узла'), '!')

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled())
    expect(writes()).toEqual(['PATCH /api/roadmap-nodes/1'])
    expect(unloadPrevented()).toBe(false)
  })

  it('ненайденный роадмап объясняется баннером вместо пустой канвы', async () => {
    api({ roadmapOk: false })
    render(<RoadmapEditorClient roadmapId={ROADMAP_ID} />)

    expect(await screen.findByText('Роадмап не найден')).toBeInTheDocument()
  })
})

describe('сохранение: отказ на каждом шаге', () => {
  const node = editorNode('n1', { payloadId: null })
  const edge = (id: string, source = 'n1', target = 'n2'): EditorEdge => ({ id, source, target, data: { payloadId: null, edgeType: 'smoothstep', animated: false } })
  const pending = (patch: Partial<PendingChanges>) => ({ ...createEmptyPendingChanges(), ...patch })

  async function save(pendingChanges: PendingChanges, edges: EditorEdge[] = [], map = new Map([['n1', 1], ['n2', 2]])) {
    const { result } = renderHook(() => useEditorSave(ROADMAP_ID))
    let outcome!: { ok: boolean; error?: string }
    await act(async () => { outcome = await result.current.saveAll([node], edges, pendingChanges, map) })
    return outcome
  }

  it.each([
    ['удаления узла', pending({ deletedNodes: new Map([['old', 3]]) }), [], 'Ошибка удаления узла: занят'],
    ['создания связи', pending({ createdEdgeIds: new Set(['e-new']) }), [edge('e-new')], 'Ошибка создания ребра: занят'],
    ['удаления связи', pending({ deletedEdges: new Map([['e-old', 9]]) }), [], 'Ошибка удаления ребра: занят'],
  ])('отказ %s возвращается текстом сервера', async (_case, changes, edges, error) => {
    api({ save: () => new Response('занят', { status: 409 }) })

    expect(await save(changes, edges)).toEqual({ ok: false, error })
  })

  it('созданная связь запоминает серверный id, чтобы следующее сохранение могло её удалить', async () => {
    api({ save: () => Response.json({ doc: { id: 77 } }) })
    const created = edge('e-new')

    expect(await save(pending({ createdEdgeIds: new Set(['e-new']) }), [created])).toEqual({ ok: true })
    expect(created.data?.payloadId).toBe(77)
  })

  it('новое сохранение отменяет зависшее предыдущее', async () => {
    api({ save: (_url, init) => new Promise<Response>((resolve, reject) => {
      if (init?.signal?.aborted) reject(new DOMException('aborted', 'AbortError'))
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      setTimeout(() => resolve(Response.json({ doc: { id: 1 } })), 50)
    }) })
    const { result } = renderHook(() => useEditorSave(ROADMAP_ID))
    const changes = pending({ deletedNodes: new Map([['old', 3]]) })

    let first!: Promise<{ ok: boolean; error?: string }>
    let second!: Promise<{ ok: boolean; error?: string }>
    act(() => { first = result.current.saveAll([node], [], changes, new Map()) })
    act(() => { second = result.current.saveAll([node], [], changes, new Map()) })

    await expect(first).resolves.toEqual({ ok: false, error: 'Сохранение отменено' })
    await act(async () => { await expect(second).resolves.toEqual({ ok: true }) })
  })

  // Признак принадлежит текущему сохранению: иначе посреди записи снова доступна кнопка «Сохранить»,
  // а следующее сохранение уже не сможет отменить идущее.
  it('пока идёт новое сохранение, отменённое предыдущее не снимает признак сохранения', async () => {
    let finish: (() => void) | undefined
    api({ save: (_url, init) => new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      finish = () => resolve(Response.json({ doc: { id: 1 } }))
    }) })
    const { result } = renderHook(() => useEditorSave(ROADMAP_ID))
    const changes = pending({ deletedNodes: new Map([['old', 3]]) })

    let first!: Promise<unknown>
    act(() => { first = result.current.saveAll([node], [], changes, new Map()) })
    act(() => { void result.current.saveAll([node], [], changes, new Map()) })
    await act(async () => { await first })

    expect(result.current.isSaving).toBe(true)
    await act(async () => { finish?.() })
    await waitFor(() => expect(result.current.isSaving).toBe(false))
  })
})

describe('очередь сохранения: правки, отменённые до записи', () => {
  async function openHook() {
    const view = renderHook(() => useRoadmapEditor(ROADMAP_ID))
    await waitFor(() => expect(view.result.current.isLoading).toBe(false))
    return view
  }

  async function saveAll(view: Awaited<ReturnType<typeof openHook>>) {
    await act(async () => { await view.result.current.saveAll() })
  }

  it('новая связь, удалённая до сохранения, не создаётся и не удаляется на сервере', async () => {
    const view = await openHook()
    act(() => view.result.current.onConnect({ source: 'n2', target: 'n1', sourceHandle: null, targetHandle: null }))
    await waitFor(() => expect(view.result.current.edges).toHaveLength(2))

    act(() => view.result.current.onEdgesChange([{ type: 'remove', id: 'edge-n2-n1' }]))
    await saveAll(view)

    expect(writes()).toEqual([])
  })

  it('удаление узла канвой уносит и его несохранённую связь без запросов за ней', async () => {
    const view = await openHook()
    act(() => view.result.current.addNode('topic', { x: 0, y: 0 }))
    const created = view.result.current.nodes.at(-1)?.id as string
    act(() => view.result.current.onConnect({ source: 'n1', target: created, sourceHandle: null, targetHandle: null }))
    await waitFor(() => expect(view.result.current.edges).toHaveLength(2))

    act(() => view.result.current.onNodesChange([{ type: 'remove', id: 'n1' }]))
    await saveAll(view)

    expect(writes()).toEqual(['POST /api/roadmap-nodes', 'DELETE /api/roadmap-nodes/1', 'DELETE /api/roadmap-edges/10'])
  })

  it('удаление выделенного нового узла не оставляет запросов ни за ним, ни за его связью', async () => {
    const view = await openHook()
    act(() => view.result.current.addNode('subtopic', { x: 0, y: 0 }))
    const created = view.result.current.selectedNodeId as string
    act(() => view.result.current.onConnect({ source: 'n2', target: created, sourceHandle: null, targetHandle: null }))
    await waitFor(() => expect(view.result.current.edges).toHaveLength(2))

    act(() => view.result.current.deleteSelected())
    await saveAll(view)

    expect(view.result.current.nodes.map((node) => node.id)).toEqual(['n1', 'n2'])
    expect(writes()).toEqual([])
  })

  it('ошибка сохранения сама исчезает через пять секунд', async () => {
    api({ save: () => new Response('нет', { status: 500 }) })
    const view = await openHook()
    act(() => view.result.current.updateNodeData('n1', { label: 'React!' }))
    vi.useFakeTimers()

    await act(async () => { await view.result.current.saveAll() })
    expect(view.result.current.error).toBe('Ошибка обновления узла "React!": нет')

    act(() => vi.advanceTimersByTime(4_999))
    expect(view.result.current.error).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(view.result.current.error).toBeNull()
  })
})
