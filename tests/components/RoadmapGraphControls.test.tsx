import { useLayoutEffect, useSyncExternalStore, type ComponentType, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { GraphNode, NodeCourse, RoadmapNodeData } from '@/components/roadmap/types'
import type { EditorEdge, EditorNode } from '@/components/roadmap-editor/types'

type FlowNode = { id: string; type?: string; data?: unknown; position: { x: number; y: number }; focusable?: boolean; ariaRole?: string; ariaLabel?: string; measured?: { width: number; height: number } }
type FlowEdge = { id: string; type?: string; data?: unknown; selected?: boolean; markerEnd?: unknown }
type Handles = { sourceX: number; sourceY: number; targetX: number; targetY: number }

/**
 * Заглушка React Flow для проверки управления картой. Канва не рисуется, но то, что
 * библиотека отдаёт компонентам, — измеренные размеры, ручки рёбер, клики по узлу и
 * по пустому месту — приходит так же, как в браузере.
 */
const flow = vi.hoisted(() => ({
  nodes: [] as FlowNode[],
  handles: {} as Record<string, Handles>,
  listeners: new Set<() => void>(),
  viewport: { x: 0, y: 0, zoom: 1 },
  fitView: vi.fn(),
  setViewport: vi.fn(async () => true),
  setCenter: vi.fn(async () => true),
}))

vi.mock('@xyflow/react', async () => {
  const base = (await import('../helpers/component-mocks')).xyflowMock()
  const state = () => ({ nodeLookup: new Map(flow.nodes.map((node) => [node.id, { measured: { width: 280, height: 200 } }])) })
  function ReactFlow({ nodes = [], edges = [], nodeTypes = {}, edgeTypes = {}, onNodeClick, onPaneClick, children }: {
    nodes?: FlowNode[]
    edges?: FlowEdge[]
    nodeTypes?: Record<string, ComponentType<{ data: unknown }>>
    edgeTypes?: Record<string, ComponentType<Record<string, unknown>>>
    onNodeClick?: (event: unknown, node: FlowNode) => void
    onPaneClick?: () => void
    children?: ReactNode
  }) {
    // Как ResizeObserver библиотеки: после отрисовки узлов в хранилище появляются их размеры.
    useLayoutEffect(() => {
      flow.nodes = nodes
      for (const listener of flow.listeners) listener()
    }, [nodes])
    return (
      <div className="react-flow" data-testid="react-flow">
        <div data-testid="flow-pane" onClick={onPaneClick} />
        {nodes.map((node) => {
          const NodeComponent = node.type ? nodeTypes[node.type] : undefined
          return (
            <div key={node.id} className="react-flow__node" data-id={node.id} tabIndex={node.focusable === false ? -1 : 0} role={node.ariaRole} aria-label={node.ariaLabel} onClick={(event) => onNodeClick?.(event, node)}>
              {NodeComponent ? <NodeComponent data={node.data} /> : null}
            </div>
          )
        })}
        <svg>
          {edges.map((edge) => {
            const Edge = edge.type ? edgeTypes[edge.type] : undefined
            return Edge
              ? <Edge key={edge.id} id={edge.id} data={edge.data} selected={edge.selected} markerEnd={edge.markerEnd} {...flow.handles[edge.id]} />
              : <path key={edge.id} data-testid={`edge-${edge.id}`} data-kind="default" />
          })}
        </svg>
        {children}
      </div>
    )
  }
  return {
    ...base,
    ReactFlow,
    MiniMap: ({ nodeColor }: { nodeColor?: (node: FlowNode) => string }) => (
      <ul aria-label="Мини-карта">{flow.nodes.map((node) => <li key={node.id} data-id={node.id} data-color={nodeColor?.(node)} />)}</ul>
    ),
    BaseEdge: ({ id, path, style }: { id: string; path: string; style?: { stroke?: string; strokeWidth?: number } }) => (
      <path data-testid={`edge-${id}`} data-kind="route" d={path} data-stroke={style?.stroke} data-width={style?.strokeWidth} />
    ),
    SmoothStepEdge: ({ id }: { id: string }) => <path data-testid={`edge-${id}`} data-kind="smoothstep" />,
    useReactFlow: () => ({
      fitView: flow.fitView,
      setViewport: flow.setViewport,
      setCenter: flow.setCenter,
      getViewport: () => flow.viewport,
      getNode: (id: string) => flow.nodes.find((node) => node.id === id),
      screenToFlowPosition: (point: unknown) => point,
    }),
    useStore: (selector: (value: ReturnType<typeof state>) => unknown) => useSyncExternalStore(
      (listener) => { flow.listeners.add(listener); return () => flow.listeners.delete(listener) },
      () => selector(state()),
    ),
  }
})

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => '/roadmaps/frontend' }))

const { RoadmapGraph } = await import('@/components/roadmap/RoadmapGraph')
const { RoadmapTopicList } = await import('@/components/roadmap/RoadmapTopicList')
const { RoadmapExplorer } = await import('@/components/roadmap/RoadmapExplorer')
const { renderToString } = await import('react-dom/server')
const { RoadmapRouteEdge } = await import('@/components/roadmap/RoadmapRouteEdge')
const { RoadmapEditorCanvas } = await import('@/components/roadmap-editor/RoadmapEditorCanvas')

function course(overrides: Partial<NodeCourse> = {}): NodeCourse {
  return { slug: 'react-basics', title: 'Основы React', totalLessons: 10, completedLessons: 3, nextLesson: null, blockedBy: [], ...overrides }
}

function topic(id: string, overrides: Partial<RoadmapNodeData> = {}, position = { x: 0, y: 0 }): GraphNode {
  const data: RoadmapNodeData = {
    label: id, nodeType: 'topic', courseSlug: null, courses: [course()], extras: [], icon: null, description: null, status: 'available',
    comingSoon: false, progressPercent: 0, totalLessons: 10, completedLessons: 0, stage: 'stage1', color: null, bullets: [], isNextStep: false,
    ...overrides,
  }
  return { id, type: data.nodeType, position, data }
}

const graph = [
  topic('Основы', { nodeType: 'category', courses: [], stage: 'base' }, { x: 0, y: 0 }),
  topic('HTML', { status: 'completed', stage: 'base', learningOrder: 1 }, { x: 0, y: 200 }),
  topic('React', { status: 'in-progress', learningOrder: 2 }, { x: 0, y: 500 }),
  topic('TypeScript', { status: 'locked', learningOrder: 3 }, { x: 0, y: 800 }),
]
const nodeElement = (id: string) => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`) as HTMLElement
const panel = (label: string) => screen.queryByRole('complementary', { name: `Тема «${label}»` })

async function renderMap(props: Partial<Parameters<typeof RoadmapGraph>[0]> = {}) {
  const view = render(<RoadmapGraph nodes={graph} edges={[]} {...props} />)
  await waitFor(() => expect(view.container.querySelector('[data-roadmap-canvas]')).toHaveAttribute('data-layout-ready', 'true'))
  // Начальный показ идёт в следующем кадре; дальше проверяются только действия пользователя.
  await waitFor(() => expect(flow.fitView).toHaveBeenCalled())
  return view
}

let fullscreenElement: Element | null = null

function enterFullscreen(element: Element) {
  fullscreenElement = element
  document.dispatchEvent(new Event('fullscreenchange'))
}

beforeEach(() => {
  vi.clearAllMocks()
  flow.nodes = []
  flow.handles = {}
  flow.viewport = { x: 0, y: 0, zoom: 1 }
  fullscreenElement = null
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'fullscreenElement')
  Reflect.deleteProperty(document, 'exitFullscreen')
  Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
})

describe('карта роадмапа: клавиатура и панель темы', () => {
  it('тема открывается с клавиатуры Enter и пробелом, категория — нет', async () => {
    await renderMap()

    fireEvent.keyDown(nodeElement('Основы'), { key: 'Enter' })
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()

    fireEvent.keyDown(nodeElement('React'), { key: 'Enter' })
    expect(panel('React')).toBeInTheDocument()
    fireEvent.keyDown(nodeElement('HTML'), { key: ' ' })
    expect(panel('HTML')).toBeInTheDocument()
    expect(nodeElement('React')).toHaveAttribute('aria-label', 'Открыть тему «React»')
    expect(nodeElement('Основы')).toHaveAttribute('role', 'group')
  })

  it('прочие клавиши на теме не открывают панель', async () => {
    await renderMap()

    fireEvent.keyDown(nodeElement('React'), { key: 'ArrowDown' })

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('закрытие панели возвращает фокус на тему, с которой её открыли', async () => {
    const user = userEvent.setup()
    await renderMap()
    nodeElement('React').focus()
    fireEvent.keyDown(nodeElement('React'), { key: 'Enter' })

    await user.click(screen.getByRole('button', { name: 'Закрыть панель темы' }))

    expect(panel('React')).not.toBeInTheDocument()
    await waitFor(() => expect(nodeElement('React')).toHaveFocus())
  })

  it('клик по пустому месту карты закрывает панель', async () => {
    const user = userEvent.setup()
    await renderMap()
    await user.click(nodeElement('React'))

    await user.click(screen.getByTestId('flow-pane'))

    expect(panel('React')).not.toBeInTheDocument()
  })

  it('выбранная тема подсвечивает свои переходы на карте', async () => {
    const user = userEvent.setup()
    await renderMap()
    const strokes = () => Array.from(document.querySelectorAll('path[data-kind="route"]'), (path) => path.getAttribute('data-stroke'))
    // Цепочка идёт через заголовок этапа: Основы → HTML → React → TypeScript.
    expect(strokes()).toHaveLength(3)
    expect(strokes().every((stroke) => stroke === 'hsl(var(--muted-foreground))')).toBe(true)

    await user.click(nodeElement('TypeScript'))
    expect(strokes()).toEqual(['hsl(var(--muted-foreground))', 'hsl(var(--muted-foreground))', 'hsl(var(--info))'])

    await user.click(nodeElement('React'))
    expect(strokes()).toEqual(['hsl(var(--muted-foreground))', 'hsl(var(--info))', 'hsl(var(--info))'])
  })

  it('при внешнем управлении выбор темы сообщается наружу, а выбранная тема центрируется', async () => {
    const user = userEvent.setup()
    const onTopicChange = vi.fn()
    const view = await renderMap({ selectedTopic: null, onTopicChange })

    await user.click(nodeElement('React'))
    expect(onTopicChange).toHaveBeenCalledWith('React')
    expect(panel('React')).not.toBeInTheDocument()

    view.rerender(<RoadmapGraph nodes={graph} edges={[]} selectedTopic="React" onTopicChange={onTopicChange} />)
    expect(panel('React')).toBeInTheDocument()
    await waitFor(() => expect(flow.setCenter).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), { zoom: 1, duration: 300 }))
  })
})

describe('карта роадмапа: состав', () => {
  it('панель темы перечисляет, что в неё входит', async () => {
    const user = userEvent.setup()
    await renderMap({ nodes: [...graph.slice(0, 2), topic('React', { learningOrder: 2, bullets: ['Хуки', 'Контекст'] }, { x: 0, y: 500 })] })

    await user.click(nodeElement('React'))

    expect(screen.getByRole('heading', { level: 4, name: 'Что входит в тему' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Тема «React»' })).toHaveTextContent('ХукиКонтекст')
  })

  it('связи из CMS не добавляют лишних линий: карта рисует только цепочку шагов', async () => {
    await renderMap({ edges: [
      { id: 'cms-back', source: 'TypeScript', target: 'HTML' },
      { id: 'cms-forward', source: 'HTML', target: 'React', label: 'дальше' },
    ] })

    const ids = Array.from(document.querySelectorAll('path[data-kind="route"]'), (path) => path.getAttribute('data-testid'))
    expect(ids).toEqual(['Основы', 'HTML', 'React'].map((source, index) => `edge-sequence:${JSON.stringify([source, ['HTML', 'React', 'TypeScript'][index]])}`))
  })

  it('до гидратации сервер отдаёт список тем для телефона и место под карту, без переключателя вида', () => {
    const page = document.createElement('div')
    page.innerHTML = renderToString(<RoadmapExplorer nodes={graph} edges={[]} looseCourses={[]} nextStepNodeId={null} />)

    expect(page.querySelector('.sm\\:hidden')).toHaveTextContent('React')
    expect(page.querySelector('.animate-pulse')).toHaveClass('hidden', 'sm:block')
    expect(page.querySelector('[role="tablist"]')).toBeNull()
    expect(page.querySelector('.react-flow')).toBeNull()
  })

  it('в списке тем выбор управляется снаружи: повторный клик по теме снимает выбор', async () => {
    const user = userEvent.setup()
    const onTopicChange = vi.fn()
    const view = render(<RoadmapTopicList nodes={graph.slice(1)} looseCourses={[]} selectedTopic={null} onTopicChange={onTopicChange} />)

    await user.click(screen.getByText('React').closest('summary') as HTMLElement)
    expect(onTopicChange).toHaveBeenLastCalledWith('React')
    expect(screen.getByText('React').closest('details')).not.toHaveAttribute('open')

    view.rerender(<RoadmapTopicList nodes={graph.slice(1)} looseCourses={[]} selectedTopic="React" onTopicChange={onTopicChange} />)
    expect(screen.getByText('React').closest('details')).toHaveAttribute('open')
    await user.click(screen.getByText('React').closest('summary') as HTMLElement)
    expect(onTopicChange).toHaveBeenLastCalledWith(null)
  })
})

describe('карта роадмапа: обзор и этапы', () => {
  it('при открытии показывает первый ряд тем в читаемом масштабе', async () => {
    await renderMap()

    await waitFor(() => expect(flow.fitView).toHaveBeenCalledWith(expect.objectContaining({ padding: 0.18, minZoom: 0.65, maxZoom: 1, duration: 0 })))
  })

  it('«Обзор карты» закрывает панель и показывает всю карту', async () => {
    const user = userEvent.setup()
    await renderMap()
    await user.click(nodeElement('React'))
    flow.fitView.mockClear()

    await user.click(screen.getByRole('button', { name: 'Обзор карты' }))

    expect(panel('React')).not.toBeInTheDocument()
    expect(flow.fitView).toHaveBeenCalledWith({ padding: 0.12, duration: 300 })
  })

  it('при просьбе уменьшить движение карта перемещается без анимации', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }) as MediaQueryList)
    await renderMap()
    flow.fitView.mockClear()

    await user.click(screen.getByRole('button', { name: 'Обзор карты' }))

    expect(flow.fitView).toHaveBeenCalledWith({ padding: 0.12, duration: 0 })
  })

  it('переход к этапу показывает только его темы и сбрасывает выбор в списке', async () => {
    const user = userEvent.setup()
    await renderMap()
    const stage = screen.getByRole('combobox', { name: 'Перейти к этапу' })
    expect(Array.from((stage as HTMLSelectElement).options, (option) => option.textContent)).toEqual(['Перейти к этапу', 'Повторяем базу', 'Стажёр: основа'])
    flow.fitView.mockClear()

    await user.selectOptions(stage, 'stage1')

    expect(flow.fitView).toHaveBeenCalledOnce()
    const shown = (flow.fitView.mock.lastCall?.[0] as { nodes: { id: string }[] }).nodes.map((node) => node.id)
    expect(shown).toEqual(['React', 'TypeScript'])
    expect(stage).toHaveValue('')
  })

  it('мини-карта окрашивает темы по тем же статусам, что и легенда', async () => {
    await renderMap()

    const colors = Object.fromEntries(Array.from(screen.getByRole('list', { name: 'Мини-карта' }).children, (item) => [item.getAttribute('data-id'), item.getAttribute('data-color')]))
    expect(colors).toEqual({ Основы: 'hsl(var(--border))', HTML: 'hsl(var(--success))', React: 'hsl(var(--info))', TypeScript: 'hsl(var(--muted))' })
    expect(screen.getByRole('list', { name: 'Обозначения' })).toHaveTextContent('ПройденаВ процессеДоступнаЗакрыта')
  })
})

describe('карта роадмапа: полный экран', () => {
  function stubPane(view: ReturnType<typeof render>) {
    const pane = view.container.querySelector('.react-flow') as HTMLElement
    Object.defineProperty(pane, 'clientWidth', { configurable: true, get: () => fullscreenElement ? 1600 : 800 })
    Object.defineProperty(pane, 'clientHeight', { configurable: true, get: () => fullscreenElement ? 1200 : 600 })
  }

  it('сохраняет ту же точку карты в центре при переходе в полный экран и обратно', async () => {
    const user = userEvent.setup()
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: async function (this: HTMLElement) { enterFullscreen(this) } })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: async () => { fullscreenElement = null; document.dispatchEvent(new Event('fullscreenchange')) } })
    const view = await renderMap()
    stubPane(view)
    flow.viewport = { x: 100, y: 50, zoom: 1 }

    await user.click(screen.getByRole('button', { name: 'Во весь экран' }))

    await waitFor(() => expect(flow.setViewport).toHaveBeenCalledWith({ x: 350, y: 225, zoom: 1.5 }, { duration: 0 }))
    expect(screen.getByRole('button', { name: 'Выйти из полного экрана' })).toBeInTheDocument()

    flow.viewport = { x: 350, y: 225, zoom: 1.5 }
    await user.click(screen.getByRole('button', { name: 'Выйти из полного экрана' }))

    // Центр экрана — та же точка карты (300, 250), масштаб уменьшен вместе с окном.
    await waitFor(() => expect(flow.setViewport).toHaveBeenLastCalledWith({ x: 175, y: 112.5, zoom: 0.75 }, { duration: 0 }))
    expect(screen.getByRole('button', { name: 'Во весь экран' })).toBeInTheDocument()
  })

  it('запрет полного экрана объясняется, а карта остаётся рабочей', async () => {
    const user = userEvent.setup()
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: async () => { throw new TypeError('Permissions check failed') } })
    await renderMap()

    await user.click(screen.getByRole('button', { name: 'Во весь экран' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Браузер не разрешил полный экран. Используйте масштабирование карты.')
    expect(flow.setViewport).not.toHaveBeenCalled()
  })
})

describe('линия перехода между темами', () => {
  const edge = (points: { x: number; y: number }[] | undefined, active = false) => render(
    <svg><RoadmapRouteEdge {...({ id: 'e1', data: { points, active } } as unknown as Parameters<typeof RoadmapRouteEdge>[0])} /></svg>,
  )
  const path = () => screen.getByTestId('edge-e1')

  it('без маршрута ничего не рисует', () => {
    edge(undefined)
    expect(screen.queryByTestId('edge-e1')).not.toBeInTheDocument()
    edge([])
    expect(screen.queryByTestId('edge-e1')).not.toBeInTheDocument()
  })

  it('прямой отрезок рисуется без скруглений', () => {
    edge([{ x: 0, y: 0 }, { x: 100, y: 0 }])
    expect(path()).toHaveAttribute('d', 'M 0 0 L 100 0')
  })

  it('поворот скругляется радиусом 8', () => {
    edge([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])
    expect(path()).toHaveAttribute('d', 'M 0 0 L 92 0 Q 100 0 100 8 L 100 100')
  })

  it('на коротких отрезках радиус не больше половины отрезка — линия не выходит за угол', () => {
    edge([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }])
    expect(path()).toHaveAttribute('d', 'M 0 0 L 7 0 Q 10 0 10 3 L 10 6')
  })

  it('активный переход толще и другого цвета', () => {
    edge([{ x: 0, y: 0 }, { x: 0, y: 50 }], true)
    expect(path()).toHaveAttribute('data-stroke', 'hsl(var(--info))')
    expect(path()).toHaveAttribute('data-width', '2.2')
  })
})

describe('канва редактора роадмапа', () => {
  const editorNode = (id: string, nodeType: 'category' | 'topic', y: number): EditorNode => ({
    id, type: nodeType, position: { x: 0, y },
    data: { label: id, nodeType, icon: null, description: null, stage: null, color: null, bullets: [], courseId: null, courseName: null, guideIds: [], bootcampIds: [], order: 0, payloadId: null, nodeId: id },
  })
  const nodes = [editorNode('Основы', 'category', 0), editorNode('HTML', 'topic', 100), editorNode('CSS', 'topic', 300)]
  const edges: EditorEdge[] = [
    { id: 'routed', source: 'HTML', target: 'CSS', type: 'smoothstep', data: { payloadId: 3, edgeType: 'smoothstep', animated: false } },
    { id: 'plain', source: 'Основы', target: 'HTML', type: 'smoothstep' },
  ]
  const route = [{ x: 10, y: 20 }, { x: 10, y: 200 }, { x: 40, y: 200 }]
  const props = { nodes, edges, onNodesChange: vi.fn(), onEdgesChange: vi.fn(), onConnect: vi.fn(), onNodeClick: vi.fn(), onPaneClick: vi.fn() }
  const kind = (id: string) => screen.getByTestId(`edge-${id}`).getAttribute('data-kind')

  it('рисует рассчитанный маршрут, пока концы совпадают с ручками узлов', () => {
    flow.handles.routed = { sourceX: 11, sourceY: 21, targetX: 40, targetY: 198 }
    render(<RoadmapEditorCanvas {...props} layoutRoutes={{ routed: route }} />)

    expect(kind('routed')).toBe('route')
    expect(kind('plain')).toBe('default')
  })

  it('после ручного перемещения узла возвращается к обычной ступенчатой линии', () => {
    flow.handles.routed = { sourceX: 10, sourceY: 20, targetX: 43, targetY: 200 }
    render(<RoadmapEditorCanvas {...props} layoutRoutes={{ routed: route }} />)

    expect(kind('routed')).toBe('smoothstep')
  })

  it('выделенное ребро подсвечено', () => {
    flow.handles.routed = { sourceX: 10, sourceY: 20, targetX: 40, targetY: 200 }
    render(<RoadmapEditorCanvas {...props} edges={[{ ...edges[0], selected: true }]} layoutRoutes={{ routed: route }} />)

    expect(screen.getByTestId('edge-routed')).toHaveAttribute('data-stroke', 'hsl(var(--info))')
  })

  it('клик по узлу сообщает его id', async () => {
    const user = userEvent.setup()
    render(<RoadmapEditorCanvas {...props} />)

    await user.click(nodeElement('CSS'))

    expect(props.onNodeClick).toHaveBeenCalledWith('CSS')
  })

  it('после раскладки показывает первый ряд тем один раз на каждую ревизию', async () => {
    const view = render(<RoadmapEditorCanvas {...props} layoutRevision={1} />)
    await waitFor(() => expect(flow.fitView).toHaveBeenCalledOnce())
    expect(flow.fitView).toHaveBeenCalledWith({ nodes: [nodes[0], nodes[1]], padding: 0.18, minZoom: 0.65, maxZoom: 0.9, duration: 0 })

    view.rerender(<RoadmapEditorCanvas {...props} nodes={[...nodes]} layoutRevision={1} />)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(flow.fitView).toHaveBeenCalledOnce()

    view.rerender(<RoadmapEditorCanvas {...props} layoutRevision={2} />)
    await waitFor(() => expect(flow.fitView).toHaveBeenCalledTimes(2))
  })

  it('до готовности раскладки карту не двигает, а карта из одних категорий показывается целиком', async () => {
    const categories = [editorNode('Основы', 'category', 0), editorNode('Рост', 'category', 500)]
    const view = render(<RoadmapEditorCanvas {...props} nodes={categories} layoutReady={false} layoutRevision={1} />)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(flow.fitView).not.toHaveBeenCalled()

    view.rerender(<RoadmapEditorCanvas {...props} nodes={categories} layoutReady layoutRevision={1} />)
    await waitFor(() => expect(flow.fitView).toHaveBeenCalledWith(expect.objectContaining({ nodes: categories })))
  })
})
